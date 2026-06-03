from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".md"}


@dataclass
class WorkerDocument:
    source_path: str
    output_markdown_path: str
    output_json_path: str
    checksum: str
    status: str
    error: str | None = None


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def convert_with_docling(path: Path) -> tuple[str, dict]:
    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:
        raise RuntimeError("Docling is not installed in this worker image.") from exc

    converter = DocumentConverter()
    result = converter.convert(path)
    document = result.document
    markdown = document.export_to_markdown()
    provenance = {
        "source": str(path),
        "export": "markdown",
        "engine": "docling",
        "tables": len(getattr(document, "tables", []) or []),
        "pictures": len(getattr(document, "pictures", []) or [])
    }
    return markdown, provenance


def convert_markdown(path: Path) -> tuple[str, dict]:
    return path.read_text(encoding="utf-8"), {
        "source": str(path),
        "export": "markdown",
        "engine": "native-markdown",
        "tables": 0,
        "pictures": 0
    }


def convert_file(source_root: Path, output_root: Path, path: Path) -> WorkerDocument:
    relative = path.relative_to(source_root)
    output_base = output_root / relative.with_suffix("")
    markdown_path = output_base.with_suffix(".md")
    json_path = output_base.with_suffix(".json")
    markdown_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        markdown, provenance = convert_markdown(path) if path.suffix.lower() == ".md" else convert_with_docling(path)
        provenance["checksum"] = checksum(path)
        provenance["relative_path"] = str(relative).replace("\\", "/")
        markdown_path.write_text(markdown, encoding="utf-8")
        json_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding="utf-8")

        return WorkerDocument(
            source_path=str(path),
            output_markdown_path=str(markdown_path),
            output_json_path=str(json_path),
            checksum=provenance["checksum"],
            status="converted"
        )
    except Exception as exc:  # noqa: BLE001 - worker report must capture conversion failures per file.
        return WorkerDocument(
            source_path=str(path),
            output_markdown_path=str(markdown_path),
            output_json_path=str(json_path),
            checksum=checksum(path),
            status="failed",
            error=str(exc)
        )


def iter_documents(source_root: Path):
    for path in sorted(source_root.rglob("*")):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            yield path


def main() -> int:
    parser = argparse.ArgumentParser(description="Finance Learning Hub Docling ingestion worker")
    parser.add_argument("source_path", help="Source pack directory")
    parser.add_argument("--out", default="data/processed/docling", help="Output directory")
    args = parser.parse_args()

    source_root = Path(args.source_path).resolve()
    output_root = Path(args.out).resolve()

    if not source_root.exists():
        raise SystemExit(f"Source path does not exist: {source_root}")

    output_root.mkdir(parents=True, exist_ok=True)
    documents = [convert_file(source_root, output_root, path) for path in iter_documents(source_root)]
    report = {
        "source_root": str(source_root),
        "output_root": str(output_root),
        "converted": sum(1 for document in documents if document.status == "converted"),
        "failed": sum(1 for document in documents if document.status == "failed"),
        "documents": [asdict(document) for document in documents]
    }
    report_path = output_root / "ingestion-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["failed"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
