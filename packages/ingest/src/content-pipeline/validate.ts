import {
  contentManifestSchema,
  extractedDocumentArtifactSchema,
  pairingReportSchema,
  isBlockingIssue,
  type ContentIssue,
  type ContentManifest,
  type ExtractedDocumentArtifact,
  type PairingReport
} from "./types";

export interface ValidationReport {
  errors: ContentIssue[];
  warnings: ContentIssue[];
}

function zodIssues(prefix: string, error: { issues: Array<{ path: PropertyKey[]; message: string }> }): ContentIssue[] {
  return error.issues.map((issue) => ({
    code: "schema-invalide",
    message: `${prefix}${issue.path.length > 0 ? ` ${issue.path.join(".")}` : ""} : ${issue.message}`
  }));
}

/**
 * Porte de qualité du manifeste : schéma Zod (qui refuse déjà chemins absolus,
 * remontées `..`, catégories inconnues et checksums non SHA-256), plus les
 * invariants inter-entrées que le schéma ne voit pas.
 */
export function validateManifest(input: unknown): ValidationReport & { manifest?: ContentManifest } {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const parsed = contentManifestSchema.safeParse(input);

  if (!parsed.success) {
    return { errors: zodIssues("manifeste", parsed.error), warnings };
  }

  const manifest = parsed.data;
  const seenPaths = new Set<string>();
  const seenChecksums = new Map<string, string>();

  for (const file of manifest.files) {
    if (seenPaths.has(file.relativePath)) {
      errors.push({ code: "chemin-duplique", message: `chemin en double dans le manifeste : ${file.relativePath}` });
    }
    seenPaths.add(file.relativePath);

    const existing = seenChecksums.get(file.sha256);
    if (existing) {
      warnings.push({
        code: "doublon-probable",
        message: `${file.relativePath} a le même SHA-256 que ${existing} — fichier dupliqué dans les sources ?`
      });
    } else {
      seenChecksums.set(file.sha256, file.relativePath);
    }
  }

  if (manifest.counts.files !== manifest.files.length) {
    errors.push({
      code: "compteur-incoherent",
      message: `counts.files (${manifest.counts.files}) ≠ nombre d'entrées (${manifest.files.length})`
    });
  }

  if (manifest.counts.skipped !== manifest.skipped.length) {
    errors.push({
      code: "compteur-incoherent",
      message: `counts.skipped (${manifest.counts.skipped}) ≠ fichiers ignorés (${manifest.skipped.length})`
    });
  }

  for (const skipped of manifest.skipped) {
    warnings.push({ code: "fichier-ignore", message: `${skipped.relativePath} : ${skipped.reason}` });
  }

  return { errors, warnings, manifest };
}

/**
 * Porte de qualité d'un artefact d'extraction : pagination réelle strictement
 * croissante, chunks bornés par des pages existantes, statut cohérent avec les
 * problèmes relevés. Un document dont des pages posent problème ne peut pas se
 * déclarer `extracted`.
 */
export function validateExtractionArtifact(
  input: unknown
): ValidationReport & { artifact?: ExtractedDocumentArtifact } {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const parsed = extractedDocumentArtifactSchema.safeParse(input);

  if (!parsed.success) {
    return { errors: zodIssues("artefact", parsed.error), warnings };
  }

  const artifact = parsed.data;
  const label = artifact.relativePath;

  if (artifact.pageCount !== artifact.pages.length) {
    errors.push({
      code: "pagination-incoherente",
      message: `${label} : pageCount (${artifact.pageCount}) ≠ pages présentes (${artifact.pages.length})`
    });
  }

  const pageNumbers = artifact.pages.map((page) => page.pageNumber);

  for (let index = 1; index < pageNumbers.length; index += 1) {
    if (pageNumbers[index] <= pageNumbers[index - 1]) {
      errors.push({
        code: "pagination-non-croissante",
        message: `${label} : numéros de pages non strictement croissants (${pageNumbers[index - 1]} puis ${pageNumbers[index]})`,
        page: pageNumbers[index]
      });
    }
  }

  const knownPages = new Set(pageNumbers);

  for (const chunk of artifact.chunks) {
    if (!knownPages.has(chunk.pageStart) || !knownPages.has(chunk.pageEnd)) {
      errors.push({
        code: "chunk-hors-pages",
        message: `${label} : chunk ${chunk.id} référence les pages ${chunk.pageStart}-${chunk.pageEnd}, absentes de l'extraction`,
        page: chunk.pageStart
      });
    }
  }

  // Un constat `informational` — page peu dense mais fidèlement extraite — ne
  // retient pas le document : il est là pour être lu, pas pour bloquer.
  const blockingPageIssues = artifact.pages.reduce(
    (total, page) => total + page.issues.filter(isBlockingIssue).length,
    0
  );

  if (artifact.status === "extracted" && blockingPageIssues > 0) {
    errors.push({
      code: "statut-incoherent",
      message: `${label} : ${blockingPageIssues} problème(s) bloquant(s) de page mais statut « extracted » — attendu « needs-review »`
    });
  }

  if (artifact.status === "needs-docling" && artifact.chunks.length > 0) {
    errors.push({
      code: "statut-incoherent",
      message: `${label} : chunks produits malgré le statut « needs-docling »`
    });
  }

  for (const page of artifact.pages) {
    for (const issue of page.issues) {
      // Les constats d'un document en revue sont tous remontés. Ceux qui ne
      // bloquent pas le sont quel que soit le statut : sinon un reclassement
      // disparaîtrait de la porte de qualité au moment précis où il fait passer
      // le document en « extracted » — ce qui est l'inverse d'un reclassement
      // visible.
      if (artifact.status === "needs-review" || !isBlockingIssue(issue)) {
        warnings.push({ ...issue, message: `${label} : ${issue.message}` });
      }
    }
  }

  return { errors, warnings, artifact };
}

/** Porte de qualité du rapprochement : chaque chemin cité existe au manifeste. */
export function validatePairingReport(
  input: unknown,
  manifest: ContentManifest
): ValidationReport & { report?: PairingReport } {
  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];
  const parsed = pairingReportSchema.safeParse(input);

  if (!parsed.success) {
    return { errors: zodIssues("rapprochement", parsed.error), warnings };
  }

  const report = parsed.data;
  const knownPaths = new Set(manifest.files.map((file) => file.relativePath));

  for (const group of report.groups) {
    for (const paths of Object.values(group.documents)) {
      for (const path of paths ?? []) {
        if (!knownPaths.has(path)) {
          errors.push({
            code: "chemin-inconnu",
            message: `groupe « ${group.chapterLabel} » : ${path} absent du manifeste`
          });
        }
      }
    }

    for (const issue of group.issues) {
      warnings.push({ ...issue, message: `chapitre « ${group.chapterLabel} » : ${issue.message}` });
    }
  }

  return { errors, warnings, report };
}
