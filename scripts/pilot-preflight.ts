import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Imports relatifs plutôt que par nom de paquet, comme `seed-published-content.ts` :
// la racine du dépôt ne déclare pas ces paquets dans ses dépendances, et les y
// ajouter pour un script de diagnostic ferait porter au dépôt entier une
// dépendance dont seule cette commande a besoin.
import { scanContentSources } from "../packages/ingest/src/content-pipeline/scan";
import { detectChapter, normalizeForMatching } from "../packages/ingest/src/content-pipeline/classify";
import { loadLocalEnv, type EnvLike, type LocalEnvLoad } from "../packages/ingest/src/local-config";
import { MIGRATION_TABLES, probeDatabase, type DatabaseProbe } from "../packages/db/src/preflight";

/**
 * Prévol du pilote « Emprunts obligataires ».
 *
 * Une seule question, posée neuf fois : *ce lot peut-il commencer ?* Le reste de
 * la chaîne — scan, extraction, génération, revue, publication — suppose un
 * corpus lisible, une base à jour, un mode de génération réel et un dépôt qui ne
 * suit aucun fichier privé. Découvrir l'absence de l'un d'eux au milieu d'une
 * génération coûte un état à moitié écrit ; le découvrir ici coûte une ligne de
 * rapport.
 *
 * TOUT EST VÉRIFIÉ, MÊME APRÈS UN ÉCHEC. Une base injoignable n'interrompt pas
 * les contrôles suivants : un opérateur doit lire *tous* ses blocages d'un coup,
 * pas les découvrir un par un à chaque relance. Le code de sortie vaut 1 dès
 * qu'un contrôle bloque.
 *
 * RIEN N'EST MODIFIÉ. Aucune écriture, aucune migration, aucun appel de
 * génération. La commande lit, et rend un avis.
 *
 * AUCUN SECRET, AUCUN CHEMIN PRIVÉ COMPLET. Les chemins absolus sont réduits à
 * leur dernier segment (`maskPath`), les valeurs de variables ne sont jamais
 * imprimées — seulement leur présence — et la cible de base est nommée par son
 * hôte et sa base, jamais par sa chaîne de connexion.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_PACK = "compta-approfondie";

/** Les tables dont ce lot dépend réellement : la publication, donc 0014. */
export const REQUIRED_MIGRATION = "0014_content_publication";

export const REQUIRED_TABLES = [
  ...MIGRATION_TABLES["0013_content_drafts"],
  ...MIGRATION_TABLES[REQUIRED_MIGRATION]
];

// --- Rapport ----------------------------------------------------------------

export type CheckStatus = "ok" | "warn" | "blocked";

export interface PreflightCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Ce qu'il faut faire quand ce n'est pas « ok ». Jamais un ordre vague. */
  hint?: string;
}

export interface PreflightReport {
  chapter: string;
  pack: string;
  checks: PreflightCheck[];
}

export function countByStatus(checks: readonly PreflightCheck[], status: CheckStatus): number {
  return checks.filter((check) => check.status === status).length;
}

const MARKS: Record<CheckStatus, string> = { ok: "✔", warn: "▲", blocked: "✖" };

export function renderReport(report: PreflightReport): string {
  const lines: string[] = [
    `Prévol — pilote « ${report.chapter} »`,
    `Pack : ${report.pack}`,
    ""
  ];

  const width = Math.max(...report.checks.map((check) => check.label.length));

  for (const check of report.checks) {
    lines.push(`  ${MARKS[check.status]} ${check.label.padEnd(width)}  ${check.detail}`);
  }

  const blocked = report.checks.filter((check) => check.status === "blocked");
  const warnings = report.checks.filter((check) => check.status === "warn");

  for (const [title, group] of [
    ["Blocages", blocked],
    ["Avertissements", warnings]
  ] as const) {
    if (group.length === 0) {
      continue;
    }

    lines.push("", `${title} (${group.length}) :`);

    for (const check of group) {
      lines.push(`  - ${check.label} : ${check.detail}`);

      if (check.hint) {
        lines.push(`    → ${check.hint}`);
      }
    }
  }

  lines.push(
    "",
    blocked.length === 0
      ? `Verdict : GO${warnings.length > 0 ? ` (${warnings.length} avertissement(s))` : ""}.`
      : `Verdict : NO-GO — ${blocked.length} blocage(s).`
  );

  return lines.join("\n");
}

// --- Masquage ---------------------------------------------------------------

/**
 * Réduit un chemin absolu à son dernier segment.
 *
 * `C:\Users\<nom>\<cloud>\<matière>\Comptabilité Approfondie` devient
 * `…\Comptabilité Approfondie` : de quoi reconnaître le dossier qu'on a
 * configuré, sans publier le nom de compte, le fournisseur de synchronisation ni
 * l'arborescence privée. Un chemin relatif au dépôt n'est pas masqué — il ne
 * révèle rien que le dépôt ne dise déjà.
 */
export function maskPath(path: string): string {
  if (!isAbsolute(path)) {
    return path;
  }

  const segments = path.split(/[\\/]/).filter(Boolean);
  const last = segments.at(-1);

  return last ? `…${sep}${last}` : path;
}

// --- Mode de génération -----------------------------------------------------

/**
 * Ce que le prévol constate comme *disponible*, à ne pas confondre avec le mode
 * porté par un brouillon (`@finance/content-generation`). Ici, « none » signifie
 * qu'aucun chemin vers un contenu publiable n'existe — pas qu'un brouillon
 * serait étiqueté ainsi.
 */
export type AvailableMode = "live" | "manual-assisted" | "none";

export interface GenerationModeVerdict {
  mode: AvailableMode;
  detail: string;
  hint?: string;
}

/**
 * Quel mode de génération réel est disponible, dans l'ordre de préférence du
 * cahier des charges : provider live d'abord, mode assisté ensuite.
 *
 * Le mock n'est pas un mode disponible et n'apparaît pas ici : il produit des
 * fixtures, que le garde de publication refuse. Le présenter comme une option
 * reviendrait à proposer de publier une démonstration.
 */
export function describeGenerationMode(env: EnvLike): GenerationModeVerdict {
  const provider = env.CONTENT_AI_PROVIDER ?? env.AI_PROVIDER ?? "none";
  const enabled = env.CONTENT_AI_ENABLED === "true";

  if (enabled && provider === "openai" && env.OPENAI_API_KEY) {
    return { mode: "live", detail: `provider live « openai » configuré` };
  }

  if (enabled && provider === "ollama" && env.OLLAMA_BASE_URL) {
    return { mode: "live", detail: `provider live « ollama » configuré` };
  }

  const reason = !enabled
    ? "CONTENT_AI_ENABLED n'est pas à « true »"
    : provider === "none" || provider === "mock"
      ? `CONTENT_AI_PROVIDER vaut « ${provider} »`
      : `le provider « ${provider} » n'a ni clé ni URL`;

  return {
    mode: "manual-assisted",
    detail: `aucun provider live (${reason}) — repli sur le mode manual-assisted`,
    hint:
      "le mode manual-assisted produit des brouillons soumis aux mêmes contrôles, marqués comme tels, " +
      "et publiables seulement après approbation humaine ; pour un provider live : CONTENT_AI_ENABLED=true " +
      "et CONTENT_AI_PROVIDER=openai|ollama avec la clé ou l'URL correspondante"
  };
}

// --- Git --------------------------------------------------------------------

export type GitRunner = (args: readonly string[]) => string;

export const runGit: GitRunner = (args) =>
  execFileSync("git", [...args], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Ce que Git ne doit jamais suivre — la liste du cahier des charges, littéralement. */
export const FORBIDDEN_TRACKED_PATTERNS = [
  "*.pdf",
  "data/extracted/*",
  "data/generated/*",
  "content-private/*"
];

export function trackedPrivateFiles(git: GitRunner): string[] {
  const tracked = git(["ls-files", "--", ...FORBIDDEN_TRACKED_PATTERNS]);

  return tracked
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith(".gitkeep"));
}

export function workingTreeChanges(git: GitRunner): string[] {
  return git(["status", "--porcelain"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// --- Contrôles --------------------------------------------------------------

export interface SourceRootVerdict {
  configured: boolean;
  path: string;
  exists: boolean;
}

export function resolveSourceRoot(env: EnvLike): SourceRootVerdict {
  const raw = env.CONTENT_SOURCE_ROOT;
  const path = raw ? (isAbsolute(raw) ? raw : join(repoRoot, raw)) : join(repoRoot, "content-private");

  return { configured: Boolean(raw), path, exists: existsSync(path) };
}

/** Les documents du manifeste qui portent sur le chapitre demandé. */
export function documentsForChapter(
  files: readonly { originalName: string; category: string; chapterSlug: string }[],
  chapter: string
): typeof files {
  const wanted = detectChapter(`${chapter}.pdf`).chapterSlug;
  const normalized = normalizeForMatching(chapter);

  return files.filter(
    (file) =>
      file.chapterSlug === wanted ||
      normalizeForMatching(file.chapterSlug.replaceAll("-", " ")).includes(normalized)
  );
}

export function checkDatabase(probe: DatabaseProbe): PreflightCheck[] {
  if (probe.status === "unconfigured") {
    return [
      {
        id: "database",
        label: "base de données",
        status: "blocked",
        detail: probe.reason,
        hint: "définir DATABASE_ADMIN_URL (propriétaire) ou DATABASE_URL dans .env"
      },
      {
        id: "migrations",
        label: "migrations",
        status: "blocked",
        detail: "non vérifiables sans cible",
        hint: `appliquer ${REQUIRED_MIGRATION} avec « corepack pnpm db:migrate » une fois la base configurée`
      }
    ];
  }

  if (probe.status === "unreachable") {
    return [
      {
        id: "database",
        label: "base de données",
        status: "blocked",
        detail: `${probe.target.label} injoignable (${probe.target.variable})`,
        hint:
          "démarrer PostgreSQL — « docker compose up -d postgres » — ou pointer DATABASE_ADMIN_URL " +
          "vers une base de développement joignable"
      },
      {
        id: "migrations",
        label: "migrations",
        status: "blocked",
        detail: "non vérifiables : base injoignable",
        hint: `appliquer ${REQUIRED_MIGRATION} avec « corepack pnpm db:migrate » une fois la base démarrée`
      }
    ];
  }

  const confirmation = probe.target.requiresConfirmation
    ? {
        id: "database-target",
        label: "cible de base",
        status: "warn" as const,
        detail: `${probe.target.label} n'est pas une boucle locale`,
        hint:
          "vérifier qu'il ne s'agit pas de la base de production avant toute migration ; " +
          "ce lot ne migre aucune base distante sans confirmation explicite"
      }
    : undefined;

  return [
    {
      id: "database",
      label: "base de données",
      status: "ok",
      detail: `${probe.target.label} joignable (${probe.target.variable})`
    },
    ...(confirmation ? [confirmation] : []),
    probe.missingTables.length === 0
      ? {
          id: "migrations",
          label: "migrations",
          status: "ok",
          detail: `${probe.presentTables.length} table(s) attendue(s) présente(s), dont ${REQUIRED_MIGRATION}`
        }
      : {
          id: "migrations",
          label: "migrations",
          status: "blocked",
          detail: `table(s) absente(s) : ${probe.missingTables.join(", ")}`,
          hint: "appliquer les migrations manquantes avec « corepack pnpm db:migrate »"
        }
  ];
}

export interface PreflightOptions {
  chapter: string;
  pack: string;
}

export interface PreflightDeps {
  env: EnvLike;
  git: GitRunner;
  probe: (tables: readonly string[], env: EnvLike) => Promise<DatabaseProbe>;
  loadEnv: (env: EnvLike) => LocalEnvLoad;
}

export async function runPreflight(
  options: PreflightOptions,
  deps: PreflightDeps
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const { env } = deps;

  // 1. Configuration, chargée exactement comme les commandes du pipeline la
  //    chargent : même fonction, donc le prévol ne peut pas valider une
  //    configuration que `content:scan` ne verrait pas.
  const loaded = deps.loadEnv(env);

  checks.push(
    loaded.found
      ? {
          id: "configuration",
          label: "configuration",
          status: "ok",
          detail:
            `.env lu à la racine — ${loaded.applied.length} variable(s) appliquée(s)` +
            (loaded.overridden.length > 0
              ? `, ${loaded.overridden.length} déjà définie(s) par le shell`
              : "")
        }
      : {
          id: "configuration",
          label: "configuration",
          status: "warn",
          detail: "aucun .env à la racine — seules les variables du shell sont lues",
          hint: "copier .env.example vers .env (git-ignoré) et y renseigner CONTENT_SOURCE_ROOT"
        }
  );

  // 2. Racine des sources privées.
  const root = resolveSourceRoot(env);

  if (!root.configured) {
    checks.push({
      id: "source-root",
      label: "racine des sources",
      status: "blocked",
      detail: `CONTENT_SOURCE_ROOT non défini — repli sur ${maskPath(root.path)} (${root.exists ? "présent" : "absent"})`,
      hint: "définir CONTENT_SOURCE_ROOT dans .env sur le dossier qui contient réellement les PDF du cours"
    });
  } else if (!root.exists) {
    checks.push({
      id: "source-root",
      label: "racine des sources",
      status: "blocked",
      detail: `${maskPath(root.path)} est introuvable`,
      hint: "corriger CONTENT_SOURCE_ROOT, ou monter le dossier s'il est synchronisé depuis un cloud"
    });
  } else {
    checks.push({
      id: "source-root",
      label: "racine des sources",
      status: "ok",
      detail: `${maskPath(root.path)} accessible`
    });
  }

  // 3. Documents du chapitre, vus par le scanner réel plutôt que par une
  //    heuristique parallèle : ce que le prévol compte est ce que `content:scan`
  //    retiendra.
  if (root.exists) {
    try {
      const manifest = await scanContentSources(root.path, { packId: options.pack });
      const matching = documentsForChapter(manifest.files, options.chapter);
      const categories = [...new Set(matching.map((file) => file.category))].sort();
      const hasCorrection = categories.includes("correction");

      checks.push(
        matching.length === 0
          ? {
              id: "chapter-documents",
              label: "documents du chapitre",
              status: "blocked",
              detail: `aucun document ne porte sur « ${options.chapter} » parmi ${manifest.files.length} fichier(s)`,
              hint: "vérifier l'orthographe du chapitre, ou que les PDF sont bien sous la racine configurée"
            }
          : {
              id: "chapter-documents",
              label: "documents du chapitre",
              status: "ok",
              detail: `${matching.length} document(s) — ${categories.join(", ")}`
            }
      );

      if (matching.length > 0 && !hasCorrection) {
        checks.push({
          id: "chapter-correction",
          label: "corrigé",
          status: "warn",
          detail: "aucun corrigé rapproché pour ce chapitre",
          hint:
            "aucune réponse attendue ne pourra être recopiée : tout chiffre devra être recalculé " +
            "par un template, sans quoi l'élément ne sera pas produit"
        });
      }
    } catch (error) {
      checks.push({
        id: "chapter-documents",
        label: "documents du chapitre",
        status: "blocked",
        detail: `lecture impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`,
        hint: "vérifier les droits de lecture sur le dossier des sources"
      });
    }
  } else {
    checks.push({
      id: "chapter-documents",
      label: "documents du chapitre",
      status: "blocked",
      detail: "non vérifiables : racine des sources absente"
    });
  }

  // 4. Base et migrations.
  checks.push(...checkDatabase(await deps.probe(REQUIRED_TABLES, env)));

  // 5. Mode de génération.
  const generation = describeGenerationMode(env);
  checks.push({
    id: "generation-mode",
    label: "mode de génération",
    status: generation.mode === "live" ? "ok" : "warn",
    detail: generation.detail,
    hint: generation.hint
  });

  // 6. Interface de revue.
  checks.push(
    env.CONTENT_REVIEW_ENABLED === "true"
      ? {
          id: "review-ui",
          label: "interface de revue",
          status: "ok",
          detail: "CONTENT_REVIEW_ENABLED=true — /admin/content-review répondra"
        }
      : {
          id: "review-ui",
          label: "interface de revue",
          status: "blocked",
          detail: "CONTENT_REVIEW_ENABLED n'est pas à « true » — /admin/content-review répond 404",
          hint: "poser CONTENT_REVIEW_ENABLED=true dans .env avant de lancer le serveur de revue"
        }
  );

  // 7. Aucun fichier réel suivi par Git.
  try {
    const tracked = trackedPrivateFiles(deps.git);
    checks.push(
      tracked.length === 0
        ? {
            id: "git-private",
            label: "fichiers privés",
            status: "ok",
            detail: "aucun PDF ni artefact dérivé suivi par Git"
          }
        : {
            id: "git-private",
            label: "fichiers privés",
            status: "blocked",
            detail: `${tracked.length} fichier(s) suivi(s) : ${tracked.slice(0, 3).join(", ")}`,
            hint: "retirer ces fichiers de l'index (« git rm --cached ») avant toute suite"
          }
    );
  } catch (error) {
    checks.push({
      id: "git-private",
      label: "fichiers privés",
      status: "blocked",
      detail: `Git n'a pas répondu : ${error instanceof Error ? error.message : "erreur inconnue"}`
    });
  }

  // 8. Espace de travail : sale n'est pas bloquant, mais doit être dit.
  try {
    const changes = workingTreeChanges(deps.git);
    checks.push(
      changes.length === 0
        ? { id: "workspace", label: "espace de travail", status: "ok", detail: "propre" }
        : {
            id: "workspace",
            label: "espace de travail",
            status: "warn",
            detail: `${changes.length} changement(s) non commité(s)`,
            hint: "vérifier qu'aucun n'est un contenu réel avant de commiter"
          }
    );
  } catch {
    checks.push({
      id: "workspace",
      label: "espace de travail",
      status: "warn",
      detail: "état Git indéterminé"
    });
  }

  return { chapter: options.chapter, pack: options.pack, checks };
}

// --- CLI --------------------------------------------------------------------

export class UsageError extends Error {}

export function parseArgs(argv: readonly string[]): PreflightOptions {
  let chapter: string | undefined;
  let pack = DEFAULT_PACK;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];

    if (flag === "--") {
      continue;
    }

    if (flag === "--chapter") {
      if (!next) throw new UsageError("--chapter attend une valeur");
      chapter = next;
      index += 1;
    } else if (flag === "--pack") {
      if (!next) throw new UsageError("--pack attend une valeur");
      pack = next;
      index += 1;
    } else if (flag.startsWith("--")) {
      throw new UsageError(`option inconnue : ${flag}`);
    }
  }

  if (!chapter) {
    throw new UsageError('--chapter est requis (exemple : --chapter "Emprunts obligataires")');
  }

  return { chapter, pack };
}

async function main(): Promise<void> {
  let options: PreflightOptions;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  const report = await runPreflight(options, {
    env: process.env,
    git: runGit,
    probe: (tables, env) => probeDatabase(tables, env),
    loadEnv: (env) => loadLocalEnv(repoRoot, env)
  });

  console.log(renderReport(report));

  if (countByStatus(report.checks, "blocked") > 0) {
    process.exitCode = 1;
  }
}

// `void` plutôt que `await` : la racine du dépôt n'est pas un paquet ESM, et
// tsx transpile ce fichier en CommonJS, où un `await` de haut niveau ne
// s'exprime pas. Le code de sortie passe par `process.exitCode`, que Node lit
// quand la boucle d'événements se vide — donc après la promesse.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
