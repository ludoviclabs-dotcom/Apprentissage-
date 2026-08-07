import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { chunkMarkdown, extractDocument, type ExtractedDocument } from "../src";
import { readImageProbe } from "../src/extractors";
import {
  chunkExtractedPages,
  extractManifestEntry,
  isBlockingIssue,
  looksLikeFlattenedTable,
  scanContentSources
} from "../src/content-pipeline";

/**
 * Construit un vrai PDF multi-pages en mémoire (offsets xref calculés), pour
 * prouver la conservation des numéros de pages sans commettre de PDF dans Git.
 */
function buildPdf(pages: string[][]): Buffer {
  const fontNumber = 3 + pages.length * 2;
  const bodies: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ];

  for (const [index, lines] of pages.entries()) {
    const pageNumber = 3 + index * 2;
    const stream = lines
      .map((line, lineIndex) => `BT /F1 12 Tf 72 ${720 - 16 * lineIndex} Td (${line}) Tj ET`)
      .join("\n");
    bodies.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${pageNumber + 1} 0 R >>`
    );
    bodies.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  bodies.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const [index, body] of bodies.entries()) {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefStart = out.length;
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}

interface FixturePage {
  lines?: string[];
  /** Image raster peinte sur la page, en pixels. */
  image?: { width: number; height: number };
}

/**
 * Même principe que {@link buildPdf}, mais chaque page peut porter une image
 * raster. C'est ce qui permet de rejouer, sur des fixtures fictives, les deux
 * pages que le corpus réel oppose : la consigne au-dessus d'un formulaire
 * vierge (aucune image) et le schéma entièrement rastérisé (une grande image).
 *
 * Aucune parenthèse dans `lines` : elle fermerait le littéral de chaîne PDF et
 * corromprait le flux de contenu.
 */
function buildPdfWithImages(pages: FixturePage[]): Buffer {
  const objects: string[] = [];
  const push = (body: string): number => objects.push(body);

  push("catalogue");
  push("arbre des pages");
  const fontNumber = push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  const pageNumbers: number[] = [];

  for (const page of pages) {
    let imageNumber: number | undefined;

    if (page.image) {
      const { width, height } = page.image;
      // Niveaux de gris 8 bits, sans filtre : un octet par pixel.
      let pixels = "";
      for (let index = 0; index < width * height; index += 1) {
        pixels += String.fromCharCode((index * 7) % 256);
      }
      imageNumber = push(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
          `/ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pixels.length} >>\n` +
          `stream\n${pixels}\nendstream`
      );
    }

    const drawing = (page.lines ?? [])
      .map((line, index) => `BT /F1 12 Tf 72 ${720 - 16 * index} Td (${line}) Tj ET`)
      .join("\n");
    const painting = page.image
      ? `q ${page.image.width} 0 0 ${page.image.height} 40 200 cm /Im0 Do Q`
      : "";
    const stream = [drawing, painting].filter(Boolean).join("\n");
    const contentNumber = push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const resources =
      `/Font << /F1 ${fontNumber} 0 R >>` +
      (imageNumber === undefined ? "" : ` /XObject << /Im0 ${imageNumber} 0 R >>`);
    pageNumbers.push(
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << ${resources} >> /Contents ${contentNumber} 0 R >>`
      )
    );
  }

  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[1] =
    `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] ` +
    `/Count ${pageNumbers.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const [index, body] of objects.entries()) {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}

/** Un paragraphe assez long pour qu'`assessQuality` tienne la page pour dense. */
const DENSE_PARAGRAPH = [
  "Les titres de participation sont des titres dont la possession durable",
  "est estimee utile a l activite de l entreprise, notamment parce qu elle",
  "permet d exercer une influence sur la societe emettrice ou d en assurer",
  "le controle. Ils figurent en immobilisations financieres au bilan de la",
  "societe detentrice, a leur cout d acquisition majore des frais engages."
];

describe("extraction page-aware", () => {
  it("préserve le numéro réel de chaque page d'un PDF", async () => {
    const root = join(tmpdir(), `content-pdf-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const pdf = buildPdf([
      [
        "Les provisions pour risques constituent un passif dont",
        "l'echeance ou le montant n'est pas fixe de facon precise.",
        "Elles sont comptabilisees des lors qu'une obligation",
        "existe a la cloture de l'exercice comptable en cours.",
        "La dotation s'enregistre au debit du compte 6815 dedie."
      ],
      [
        "La reprise de provision s'enregistre au credit du",
        "compte 78 des que le risque disparait ou se realise.",
        "Le montant repris doit correspondre a la provision",
        "anterieurement dotee pour le meme risque identifie.",
        "Cette regle assure la symetrie des ecritures comptables."
      ]
    ]);
    await writeFile(join(root, "Les provisions - Fiche de cours.pdf"), pdf);

    const manifest = await scanContentSources(root, { packId: "test-pack" });
    expect(manifest.files).toHaveLength(1);

    const artifact = await extractManifestEntry(root, manifest.files[0]);

    expect(artifact.pageCount).toBe(2);
    expect(artifact.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(artifact.pages[0].rawText).toContain("provisions pour risques");
    expect(artifact.pages[1].rawText).toContain("compte 78");

    // Aucun chunk n'écrase la pagination : chaque chunk vit dans sa page réelle.
    expect(artifact.chunks.length).toBeGreaterThan(0);
    const chunkPages = new Set(artifact.chunks.map((chunk) => `${chunk.pageStart}-${chunk.pageEnd}`));
    expect(chunkPages.has("2-2")).toBe(true);
    for (const chunk of artifact.chunks) {
      expect(chunk.pageStart).toBeLessThanOrEqual(chunk.pageEnd);
      expect([1, 2]).toContain(chunk.pageStart);
    }
  });

  it("conserve les sauts de page dans le Markdown assemblé", async () => {
    const root = join(tmpdir(), `content-pdf-marker-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "doc.pdf"), buildPdf([["Page un."], ["Page deux."]]));

    const extracted = await extractDocument(root, {
      path: "doc.pdf",
      extension: ".pdf",
      sizeBytes: 0,
      checksum: "0".repeat(64)
    });

    expect(extracted.pageContents.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(extracted.markdownText).toContain("<!-- page: 1 -->");
    expect(extracted.markdownText).toContain("<!-- page: 2 -->");
  });

  it("chunkMarkdown n'attribue plus pageStart = 1 arbitrairement", () => {
    const document: ExtractedDocument = {
      path: "extrait.pdf",
      extension: ".pdf",
      rawText: "",
      markdownText: "",
      pages: 3,
      pageContents: [
        { pageNumber: 4, rawText: "Texte de la page quatre.", markdownText: "Texte de la page quatre." },
        { pageNumber: 5, rawText: "Texte de la page cinq.", markdownText: "Texte de la page cinq." },
        { pageNumber: 6, rawText: "Texte de la page six.", markdownText: "Texte de la page six." }
      ],
      status: "extracted"
    };

    const chunks = chunkMarkdown(document, 1200);

    expect(chunks.map((chunk) => chunk.pageStart)).toEqual([4, 5, 6]);
    expect(chunks.every((chunk) => chunk.pageStart === chunk.pageEnd)).toBe(true);
    expect(chunks.some((chunk) => chunk.pageStart === 1)).toBe(false);
  });

  it("un Markdown reste une unique page logique réelle", async () => {
    const root = join(tmpdir(), `content-md-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "notes.md"), "# Provisions\n\nUne provision suppose une obligation.");

    const extracted = await extractDocument(root, {
      path: "notes.md",
      extension: ".md",
      sizeBytes: 0,
      checksum: "0".repeat(64)
    });

    expect(extracted.pageContents).toHaveLength(1);
    expect(extracted.pageContents[0].pageNumber).toBe(1);
    const chunks = chunkMarkdown(extracted);
    expect(chunks.every((chunk) => chunk.pageStart === 1 && chunk.pageEnd === 1)).toBe(true);
  });

  it("propage le titre de section d'une page aux pages suivantes", () => {
    const chunks = chunkExtractedPages("doc-test", [
      { pageNumber: 1, rawText: "", markdownText: "# Les emprunts obligataires\n\nDéfinition.", issues: [] },
      { pageNumber: 2, rawText: "", markdownText: "Suite du chapitre sans nouveau titre.", issues: [] }
    ]);

    expect(chunks[0].sectionTitle).toBe("Les emprunts obligataires");
    expect(chunks[1].sectionTitle).toBe("Les emprunts obligataires");
    expect(chunks[1].pageStart).toBe(2);
  });

  it("suspecte les tableaux aplatis et les signale needs-review", () => {
    const tableLike = [
      "Compte  Libellé  Débit  Crédit",
      "512  Banque  10 000  0",
      "701  Ventes  0  10 000",
      "44571  TVA collectée  0  2 000",
      "44566  TVA déductible  2 000  0"
    ].join("\n");

    expect(looksLikeFlattenedTable(tableLike)).toBe(true);
    expect(looksLikeFlattenedTable("Un paragraphe de cours parfaitement normal, sans colonnes.")).toBe(false);
  });

  it("ne confond pas une page peu dense avec une page mal extraite", async () => {
    const root = join(tmpdir(), `content-sparse-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "Les titres - Mise en situation.pdf"),
      buildPdfWithImages([
        { lines: DENSE_PARAGRAPH },
        // La page du corpus réel : une consigne complète au-dessus d'un
        // formulaire de journal vierge. Peu de texte, aucune image.
        { lines: ["1o Comptabiliser l operation precedente au journal."] },
        // L'inverse : un schema entierement rasterise, dont rien n'est
        // atteignable en texte.
        { lines: ["3"], image: { width: 320, height: 260 } }
      ])
    );

    const manifest = await scanContentSources(root, { packId: "test-pack" });
    const artifact = await extractManifestEntry(root, manifest.files[0]);

    const [dense, sparse, degraded] = artifact.pages;

    expect(dense.issues).toEqual([]);

    expect(sparse.issues).toHaveLength(1);
    expect(sparse.issues[0].code).toBe("sparse-page");
    expect(sparse.issues[0].severity).toBe("informational");
    // Le reclassement est motivé, pas simplement appliqué.
    expect(sparse.issues[0].message).toContain("sans image");

    expect(degraded.issues).toHaveLength(1);
    expect(degraded.issues[0].code).toBe("degraded-extraction");
    expect(degraded.issues[0].severity).toBeUndefined();
    expect(degraded.issues[0].message).toContain("image significative");

    // Le document reste en revue : il porte une vraie page dégradée.
    expect(artifact.status).toBe("needs-review");
  });

  it("laisse un document publiable quand ses seules pages courtes sont fidèles", async () => {
    const root = join(tmpdir(), `content-sparse-only-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "Les emprunts obligataires - Mise en situation.pdf"),
      buildPdfWithImages([
        { lines: DENSE_PARAGRAPH },
        { lines: ["1o Comptabiliser l operation precedente au journal de la societe CSP."] }
      ])
    );

    const manifest = await scanContentSources(root, { packId: "test-pack" });
    const artifact = await extractManifestEntry(root, manifest.files[0]);

    // Le constat existe et reste lisible dans l'artefact…
    expect(artifact.pages[1].issues.map((issue) => issue.code)).toEqual(["sparse-page"]);
    // …mais il ne retient plus le document entier.
    expect(artifact.status).toBe("extracted");
    // La page peut donc étayer un contenu : elle produit bien un chunk.
    expect(artifact.chunks.some((chunk) => chunk.pageStart === 2)).toBe(true);
  });

  it("distingue une page vierge d'une page dont le texte a été perdu", async () => {
    const root = join(tmpdir(), `content-blank-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "Les titres - Fiche de cours.pdf"),
      buildPdfWithImages([
        { lines: DENSE_PARAGRAPH },
        { lines: [] },
        { lines: [], image: { width: 320, height: 260 } }
      ])
    );

    const manifest = await scanContentSources(root, { packId: "test-pack" });
    const artifact = await extractManifestEntry(root, manifest.files[0]);

    expect(artifact.pages[1].issues[0].code).toBe("blank-page");
    expect(artifact.pages[1].issues[0].severity).toBe("informational");
    expect(artifact.pages[2].issues[0].code).toBe("empty-page");
    expect(artifact.pages[2].issues[0].severity).toBeUndefined();
    expect(artifact.status).toBe("needs-review");
  });

  it("ne réclame pas Docling pour un document court mais fidèlement extrait", async () => {
    const root = join(tmpdir(), `content-short-doc-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "Consigne isolee - Mise en situation.pdf"),
      buildPdfWithImages([{ lines: ["1o Comptabiliser l operation precedente au journal."] }])
    );

    const manifest = await scanContentSources(root, { packId: "test-pack" });
    const artifact = await extractManifestEntry(root, manifest.files[0]);

    expect(artifact.status).toBe("extracted");
    expect(artifact.issues.map((issue) => issue.code)).not.toContain("needs-docling");
    expect(artifact.pages[0].issues.map((issue) => issue.code)).toEqual(["sparse-page"]);
  });

  it("retombe sur le classement prudent quand le sondage d'images n'a pas eu lieu", () => {
    // Sans sondage, l'absence d'image n'est pas établie : la page reste
    // dégradée plutôt que présumée fidèle.
    expect(readImageProbe(undefined, 5)).toBe("not-probed");
    expect(readImageProbe({ probedPages: [1, 2], imageBearingPages: [] }, 5)).toBe("not-probed");
    expect(readImageProbe({ probedPages: [1, 5], imageBearingPages: [] }, 5)).toBe("no-image");
    expect(readImageProbe({ probedPages: [1, 5], imageBearingPages: [5] }, 5)).toBe("image-present");
    // Un sondage en échec ne vaut pas « aucune image » : il ne vaut rien.
    expect(
      readImageProbe({ probedPages: [5], imageBearingPages: [], probeFailure: "décodage impossible" }, 5)
    ).toBe("not-probed");
  });

  it("ne bloque un document que sur un constat bloquant", () => {
    expect(isBlockingIssue({ severity: "informational" })).toBe(false);
    expect(isBlockingIssue({ severity: "blocking" })).toBe(true);
    // Un constat sans gravité déclarée — artefact écrit avant l'introduction du
    // champ, ou code ajouté demain — bloque par défaut.
    expect(isBlockingIssue({})).toBe(true);
  });

  it("refuse les formats non couverts avec un statut needs-docling sans chunks", async () => {
    const root = join(tmpdir(), `content-xlsx-${Date.now()}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "classeur.xlsx"), "fake");

    const manifest = await scanContentSources(root, { packId: "test-pack" });
    const artifact = await extractManifestEntry(root, manifest.files[0]);

    expect(artifact.status).toBe("needs-docling");
    expect(artifact.chunks).toHaveLength(0);
    expect(artifact.issues.some((issue) => issue.code === "needs-docling")).toBe(true);
  });
});
