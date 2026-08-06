import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus, resolveChapter, type ChapterSummary, type LoadedCorpus } from "../corpus/load";

/**
 * Socle commun aux commandes `content:generate`, `content:validate-generated`
 * et `content:report`.
 *
 * Tous les chemins sont résolus depuis la racine du dépôt : aucune constante
 * absolue, et un `--root` relatif fonctionne identiquement sous Windows et Linux.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..", "..", "..");

export interface CommonOptions {
  chapter?: string;
  types?: string;
  mode: "mock" | "live";
  dryRun: boolean;
  force: boolean;
  limit?: number;
  sourcePack: string;
  output: string;
  verbose: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function resolvePath(candidate: string): string {
  return isAbsolute(candidate) ? candidate : join(repoRoot, candidate);
}

export function parseCommonOptions(argv: readonly string[]): CommonOptions {
  const options: CommonOptions = {
    mode: "mock",
    dryRun: false,
    force: false,
    sourcePack: "comptabilite",
    output: join("data", "generated", "drafts"),
    verbose: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    // `pnpm <script> -- --chapter …` est un réflexe répandu, mais la délégation
    // par `pnpm --filter` transmet le `--` littéralement jusqu'ici. On l'ignore
    // plutôt que de le refuser : les deux formes doivent marcher.
    if (flag === "--") {
      continue;
    }

    switch (flag) {
      case "--chapter":
        if (!next) throw new UsageError("--chapter attend une valeur");
        options.chapter = next;
        index += 1;
        break;
      case "--types":
        if (!next) throw new UsageError("--types attend une liste (sheet,flashcards,…)");
        options.types = next;
        index += 1;
        break;
      case "--mode":
        if (next !== "mock" && next !== "live") {
          throw new UsageError("--mode attend « mock » ou « live »");
        }
        options.mode = next;
        index += 1;
        break;
      case "--source-pack":
        if (!next) throw new UsageError("--source-pack attend une valeur");
        options.sourcePack = next;
        index += 1;
        break;
      case "--output":
        if (!next) throw new UsageError("--output attend un chemin");
        options.output = next;
        index += 1;
        break;
      case "--limit": {
        const parsed = Number.parseInt(next ?? "", 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new UsageError("--limit attend un entier positif");
        }
        options.limit = parsed;
        index += 1;
        break;
      }
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--verbose":
        options.verbose = true;
        break;
      default:
        if (flag.startsWith("--")) {
          throw new UsageError(`option inconnue : ${flag}`);
        }
    }
  }

  return options;
}

export function extractedDir(): string {
  return join(repoRoot, "data", "extracted");
}

export function draftsRoot(options: CommonOptions): string {
  return resolvePath(options.output);
}

export interface ResolvedContext {
  corpus: LoadedCorpus;
  chapter: ChapterSummary;
}

export async function resolveContext(options: CommonOptions): Promise<ResolvedContext> {
  if (!options.chapter) {
    throw new UsageError('--chapter est requis (exemple : --chapter "Emprunts obligataires")');
  }

  const corpus = await loadCorpus(extractedDir(), options.sourcePack);
  return { corpus, chapter: resolveChapter(corpus, options.chapter) };
}

/** Sortie d'erreur uniforme : message lisible, code de sortie non nul. */
export function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
