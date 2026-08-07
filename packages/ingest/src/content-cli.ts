import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactFileName, artifactPath, extractManifestEntry } from "./content-pipeline/extract";
import { pairManifest } from "./content-pipeline/pair";
import { scanContentSources } from "./content-pipeline/scan";
import { loadLocalEnv } from "./local-config";
import {
  contentManifestSchema,
  isBlockingIssue,
  type ContentIssue,
  type ContentManifest
} from "./content-pipeline/types";
import {
  validateExtractionArtifact,
  validateManifest,
  validatePairingReport
} from "./content-pipeline/validate";

/**
 * CLI du pipeline de contenu :
 *
 *   pnpm content:scan      — inventorie les sources privées → manifest.json
 *   pnpm content:extract   — extraction page-aware → pages/*.json
 *   pnpm content:pair      — groupes cours/exercice/corrigé → pairing.json
 *   pnpm content:validate  — portes de qualité sur les trois artefacts
 *
 * La racine des sources vient de --root, sinon de CONTENT_SOURCE_ROOT, sinon
 * de `content-private/`. Chemins relatifs résolus depuis la racine du dépôt,
 * séparateurs portables Windows/Linux. Aucune génération IA, aucune publication.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

// Avant toute lecture d'environnement : `tsx` ne charge pas `.env`, et
// `CONTENT_SOURCE_ROOT` y est documenté comme la racine de ce scan. Sans cela la
// commande retombait sur `content-private/` sans le dire.
const envFile = loadLocalEnv(repoRoot);

interface CliOptions {
  command: string;
  rootPath: string;
  packId: string;
  outputDir: string;
}

function parseOptions(argv: string[]): CliOptions {
  const [command = ""] = argv;
  let root = process.env.CONTENT_SOURCE_ROOT ?? "content-private";
  let packId = "comptabilite";

  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--root" && argv[index + 1]) {
      root = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--pack" && argv[index + 1]) {
      packId = argv[index + 1];
      index += 1;
    }
  }

  const rootPath = isAbsolute(root) ? root : join(repoRoot, root);
  return { command, rootPath, packId, outputDir: join(repoRoot, "data", "extracted", packId) };
}

function printIssues(label: string, issues: ContentIssue[]): void {
  if (issues.length === 0) {
    return;
  }

  console.log(`\n${label} (${issues.length}) :`);
  for (const issue of issues) {
    const page = issue.page !== undefined ? ` [page ${issue.page}]` : "";
    console.log(`  - [${issue.code}]${page} ${issue.message}`);
  }
}

async function readManifest(options: CliOptions): Promise<ContentManifest> {
  const manifestPath = join(options.outputDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    console.error(`Manifeste introuvable : ${manifestPath}\nLancer d'abord : pnpm content:scan`);
    process.exit(1);
  }

  return contentManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runScan(options: CliOptions): Promise<void> {
  console.log(
    envFile.found
      ? `Configuration      : .env lu (${envFile.applied.length} variable(s) appliquée(s))`
      : "Configuration      : aucun .env — seules les variables du shell sont lues"
  );

  if (!existsSync(options.rootPath)) {
    console.error(
      `Racine des sources introuvable : ${options.rootPath}\n` +
        `Créer le dossier ou définir CONTENT_SOURCE_ROOT (voir .env.example).`
    );
    process.exit(1);
  }

  const manifest = await scanContentSources(options.rootPath, { packId: options.packId });
  await writeJson(join(options.outputDir, "manifest.json"), manifest);

  console.log(`Pack               : ${manifest.packId}`);
  console.log(`Fichiers retenus   : ${manifest.counts.files}`);
  console.log(`Fichiers ignorés   : ${manifest.counts.skipped}`);
  console.log(`Par catégorie      :`, manifest.counts.byCategory);
  console.log(`Par domaine        :`, manifest.counts.byDomain);
  console.log(`Manifeste          : ${join(options.outputDir, "manifest.json")}`);

  if (manifest.skipped.length > 0) {
    printIssues(
      "Ignorés",
      manifest.skipped.map((entry) => ({ code: "fichier-ignore", message: `${entry.relativePath} : ${entry.reason}` }))
    );
  }
}

async function runExtract(options: CliOptions): Promise<void> {
  const manifest = await readManifest(options);
  const byStatus: Record<string, number> = {};
  const informational: Array<{ relativePath: string; issue: ContentIssue }> = [];

  for (const entry of manifest.files) {
    const artifact = await extractManifestEntry(options.rootPath, entry);
    await writeJson(artifactPath(options.outputDir, entry), artifact);

    entry.extraction = {
      status: artifact.status,
      pageCount: artifact.pageCount,
      issues: [...artifact.issues, ...artifact.pages.flatMap((page) => page.issues)]
    };
    byStatus[artifact.status] = (byStatus[artifact.status] ?? 0) + 1;

    for (const issue of entry.extraction.issues) {
      if (!isBlockingIssue(issue)) {
        informational.push({ relativePath: entry.relativePath, issue });
      }
    }
  }

  await writeJson(join(options.outputDir, "manifest.json"), contentManifestSchema.parse(manifest));

  console.log(`Documents extraits : ${manifest.files.length}`);
  console.log(`Par statut         :`, byStatus);
  console.log(`Artefacts          : ${join(options.outputDir, "pages")}`);

  const flagged = manifest.files.filter((entry) => entry.extraction.status !== "extracted");

  if (flagged.length > 0) {
    console.log(`\nÀ revoir (${flagged.length}) :`);
    for (const entry of flagged) {
      const first = entry.extraction.issues.find(isBlockingIssue) ?? entry.extraction.issues[0];
      console.log(`  - ${entry.relativePath} [${entry.extraction.status}]${first ? ` — ${first.message}` : ""}`);
    }
  }

  // Un reclassement ne passe pas en silence : une page tenue pour peu dense
  // plutôt que dégradée n'apparaît plus dans « À revoir », elle doit donc être
  // dite ici, avec le motif qui l'y a mise.
  if (informational.length > 0) {
    console.log(`\nSignalé sans bloquer (${informational.length}) :`);
    for (const { relativePath, issue } of informational) {
      const page = issue.page !== undefined ? ` [page ${issue.page}]` : "";
      console.log(`  - ${relativePath}${page} [${issue.code}] ${issue.message}`);
    }
  }
}

async function runPair(options: CliOptions): Promise<void> {
  const manifest = await readManifest(options);
  const report = pairManifest(manifest);
  await writeJson(join(options.outputDir, "pairing.json"), report);

  console.log(`Chapitres          : ${report.counts.groups}`);
  console.log(`Paires énoncé/corrigé : ${report.counts.pairs}`);
  console.log(`Énoncés sans corrigé  : ${report.counts.exercisesWithoutCorrection}`);
  console.log(`Corrigés sans énoncé  : ${report.counts.correctionsWithoutExercise}`);
  console.log(`Rapport            : ${join(options.outputDir, "pairing.json")}`);

  for (const group of report.groups) {
    const summary = Object.entries(group.documents)
      .filter(([, paths]) => (paths ?? []).length > 0)
      .map(([category, paths]) => `${category}: ${(paths ?? []).length}`)
      .join(", ");
    console.log(`  - ${group.chapterLabel} (${group.domainId}) — ${summary}`);
  }
}

async function runValidate(options: CliOptions): Promise<void> {
  const manifestPath = join(options.outputDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    console.error(`Manifeste introuvable : ${manifestPath}\nLancer d'abord : pnpm content:scan`);
    process.exit(1);
  }

  const errors: ContentIssue[] = [];
  const warnings: ContentIssue[] = [];

  const manifestResult = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  errors.push(...manifestResult.errors);
  warnings.push(...manifestResult.warnings);

  if (manifestResult.manifest) {
    for (const entry of manifestResult.manifest.files) {
      const path = artifactPath(options.outputDir, entry);

      if (!existsSync(path)) {
        if (entry.extraction.status !== "pending") {
          errors.push({
            code: "artefact-manquant",
            message: `${entry.relativePath} : statut « ${entry.extraction.status} » mais artefact absent (${path})`
          });
        } else {
          warnings.push({
            code: "non-extrait",
            message: `${entry.relativePath} : pas encore extrait — lancer pnpm content:extract`
          });
        }
        continue;
      }

      const artifactResult = validateExtractionArtifact(JSON.parse(await readFile(path, "utf8")));
      errors.push(...artifactResult.errors);
      warnings.push(...artifactResult.warnings);

      if (artifactResult.artifact) {
        if (artifactResult.artifact.sha256 !== entry.sha256) {
          errors.push({
            code: "checksum-divergent",
            message: `${entry.relativePath} : SHA-256 de l'artefact ≠ manifeste — relancer scan puis extract`
          });
        }

        if (artifactResult.artifact.status !== entry.extraction.status) {
          errors.push({
            code: "statut-divergent",
            message: `${entry.relativePath} : statut artefact « ${artifactResult.artifact.status} » ≠ manifeste « ${entry.extraction.status} »`
          });
        }
      }
    }

    // Artefacts orphelins : présents sur disque mais absents du manifeste
    // (document retiré des sources depuis le dernier scan).
    const pagesDir = join(options.outputDir, "pages");

    if (existsSync(pagesDir)) {
      const expected = new Set(manifestResult.manifest.files.map((entry) => artifactFileName(entry)));

      for (const fileName of await readdir(pagesDir)) {
        if (fileName.endsWith(".json") && !expected.has(fileName)) {
          warnings.push({
            code: "artefact-orphelin",
            message: `pages/${fileName} ne correspond à aucune entrée du manifeste — document retiré des sources ?`
          });
        }
      }
    }

    const pairingPath = join(options.outputDir, "pairing.json");

    if (existsSync(pairingPath)) {
      const pairingResult = validatePairingReport(
        JSON.parse(await readFile(pairingPath, "utf8")),
        manifestResult.manifest
      );
      errors.push(...pairingResult.errors);
      warnings.push(...pairingResult.warnings);
    } else {
      warnings.push({ code: "rapprochement-absent", message: "pairing.json absent — lancer pnpm content:pair" });
    }
  }

  printIssues("Erreurs", errors);
  printIssues("Avertissements", warnings);
  console.log(`\nValidation : ${errors.length} erreur(s), ${warnings.length} avertissement(s).`);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

const options = parseOptions(process.argv.slice(2));

switch (options.command) {
  case "scan":
    await runScan(options);
    break;
  case "extract":
    await runExtract(options);
    break;
  case "pair":
    await runPair(options);
    break;
  case "validate":
    await runValidate(options);
    break;
  default:
    console.error(
      "Usage : tsx src/content-cli.ts <scan|extract|pair|validate> [--root <chemin>] [--pack <id>]"
    );
    process.exit(1);
}
