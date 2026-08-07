import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "@finance/ingest";
import { loadCorpus, resolveChapter, type ChapterSummary, type LoadedCorpus } from "../corpus/load";
import { generationModes, type GenerationMode } from "../types/metadata";

/**
 * Socle commun aux commandes `content:generate`, `content:validate-generated`
 * et `content:report`.
 *
 * Tous les chemins sont résolus depuis la racine du dépôt : aucune constante
 * absolue, et un `--root` relatif fonctionne identiquement sous Windows et Linux.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..", "..", "..");

/**
 * `.env` chargé à l'import, avant toute lecture de `process.env`.
 *
 * `createContentProvider` décide du mode sur `CONTENT_AI_ENABLED` et
 * `CONTENT_AI_PROVIDER` ; sans ce chargement, un opérateur qui a rempli son
 * `.env` obtiendrait « génération live indisponible » en croyant l'avoir
 * configurée. Le shell reste prioritaire.
 */
export const localEnv = loadLocalEnv(repoRoot);

export interface CommonOptions {
  chapter?: string;
  types?: string;
  mode: GenerationMode;
  dryRun: boolean;
  force: boolean;
  limit?: number;
  sourcePack: string;
  output: string;
  verbose: boolean;
  /** Racine des charges utiles rédigées, pour `--mode manual-assisted`. */
  manualInput: string;
  /** Qui a rédigé, exigé par `--mode manual-assisted`. */
  author?: string;
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
    verbose: false,
    manualInput: join("data", "generated", "manual")
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
        if (!(generationModes as readonly string[]).includes(next ?? "")) {
          throw new UsageError(`--mode attend ${generationModes.map((mode) => `« ${mode} »`).join(", ")}`);
        }
        options.mode = next as GenerationMode;
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
      case "--manual-input":
        if (!next) throw new UsageError("--manual-input attend un chemin");
        options.manualInput = next;
        index += 1;
        break;
      case "--author":
        if (!next) throw new UsageError("--author attend un nom");
        options.author = next;
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

/**
 * Options du provider assisté, ou une erreur d'usage.
 *
 * L'auteur est **exigé** : un brouillon publiable doit nommer qui l'a rédigé, et
 * une valeur par défaut du genre « manuel » ne nommerait personne. Le mode
 * assisté est un repli, pas une commodité.
 */
export function manualOptions(options: CommonOptions): { rootDir: string; author: string } {
  const author = options.author ?? process.env.CONTENT_MANUAL_AUTHOR;

  if (!author) {
    throw new UsageError(
      "--mode manual-assisted exige --author (ou CONTENT_MANUAL_AUTHOR) : un contenu publiable nomme son rédacteur"
    );
  }

  return { rootDir: resolvePath(options.manualInput), author };
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
