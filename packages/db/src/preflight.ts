import postgres from "postgres";

/**
 * Reconnaissance de la base **avant** d'y écrire quoi que ce soit.
 *
 * `checkDatabaseConnection` répond déjà « joignable ou non », mais elle exige
 * `FINANCE_HUB_USE_DATABASE=true` : c'est la question de l'application, qui
 * refuse de parler à une base qu'on ne lui a pas demandé d'utiliser. La question
 * d'un prévol est l'inverse — *quelle* cible verrait une migration, et
 * qu'y a-t-il déjà dessus — et elle doit pouvoir se poser quand le drapeau est
 * encore à `false`, puisque c'est précisément l'état d'une installation qu'on
 * s'apprête à activer.
 *
 * RIEN N'EST ÉCRIT ICI. Le module lit `information_schema` et la version du
 * serveur, rien d'autre. Appliquer une migration reste le travail de
 * `migrate.ts`, qui est un geste séparé, volontaire, et qui n'a pas à être
 * déclenché par un diagnostic.
 *
 * AUCUN SECRET N'EN SORT. `DatabaseTarget` ne porte ni l'utilisateur, ni le mot
 * de passe, ni la chaîne de connexion : seulement l'hôte, le port et le nom de
 * la base, c'est-à-dire de quoi dire *où* on va sans dire *avec quoi* on y
 * entre. Un rapport de prévol finit dans un terminal, parfois dans un ticket.
 */

/**
 * Les tables que chaque migration récente crée.
 *
 * Constater l'application d'une migration par ses tables plutôt que par une
 * table de suivi : ce dépôt n'en a pas — `migrate.ts` rejoue tout le dossier à
 * chaque fois, en s'appuyant sur l'idempotence de chaque fichier. La présence
 * des tables est donc le seul fait observable, et c'est celui qui compte.
 */
export const MIGRATION_TABLES: Readonly<Record<string, readonly string[]>> = {
  "0013_content_drafts": ["content_drafts", "content_draft_transitions"],
  "0014_content_publication": [
    "published_content_versions",
    "content_publication_audit",
    "chapter_activity_events"
  ]
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

export interface DatabaseTarget {
  /** La variable qui a désigné cette cible — l'ordre de préférence est visible. */
  variable: "DATABASE_ADMIN_URL" | "DATABASE_URL";
  host: string;
  port: number;
  database: string;
  /** Nom logique affichable. Jamais l'utilisateur, jamais le mot de passe. */
  label: string;
  loopback: boolean;
  /**
   * Une cible hors boucle locale demande une confirmation nominative.
   *
   * Le critère est délibérément grossier : tout ce qui n'est pas
   * `localhost` est traité comme potentiellement partagé. Un hôte distant de
   * recette coûte alors une confirmation de trop, ce qui est le bon sens de
   * l'erreur — l'inverse migre une base de production en croyant toucher un
   * bac à sable.
   */
  requiresConfirmation: boolean;
}

/**
 * Quelle base une migration atteindrait, d'après l'environnement.
 *
 * `DATABASE_ADMIN_URL` d'abord, exactement comme `migrate.ts` : les changements
 * de schéma passent par le propriétaire, pas par le rôle contraint que
 * l'application utilise. Lire la cible autrement que la migration ne la lit
 * produirait un prévol qui rassure sur une base et en modifie une autre.
 */
/**
 * Un environnement, vu comme un dictionnaire — et non `NodeJS.ProcessEnv`, que
 * Next.js augmente dans `apps/web` au point qu'un littéral de test cesse d'y
 * être assignable.
 */
export type DatabaseEnv = Record<string, string | undefined>;

export function describeDatabaseTarget(env: DatabaseEnv): DatabaseTarget | null {
  const variable = env.DATABASE_ADMIN_URL ? "DATABASE_ADMIN_URL" : "DATABASE_URL";
  const raw = env.DATABASE_ADMIN_URL ?? env.DATABASE_URL;

  if (!raw) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname;
  const port = url.port ? Number.parseInt(url.port, 10) : 5432;
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "(par défaut)";
  const loopback = LOOPBACK_HOSTS.has(host);

  return {
    variable,
    host,
    port,
    database,
    label: `${host}:${port}/${database}`,
    loopback,
    requiresConfirmation: !loopback
  };
}

export type DatabaseProbe =
  | { status: "unconfigured"; reason: string }
  | { status: "unreachable"; target: DatabaseTarget; reason: string }
  | {
      status: "reachable";
      target: DatabaseTarget;
      serverVersion: string;
      presentTables: string[];
      missingTables: string[];
    };

/** Ce qu'une sonde a besoin de savoir faire, pour qu'un test n'ait pas besoin d'un serveur. */
export interface DatabaseInspection {
  serverVersion: string;
  tables: string[];
}

export type DatabaseInspector = (connectionUrl: string) => Promise<DatabaseInspection>;

/**
 * La sonde réelle : une connexion, deux lectures, une fermeture.
 *
 * `max: 1` et un délai court, parce qu'un prévol qui pend trente secondes sur
 * une base éteinte n'est pas un prévol.
 */
export const inspectWithPostgres: DatabaseInspector = async (connectionUrl) => {
  const sql = postgres(connectionUrl, { max: 1, connect_timeout: 5, idle_timeout: 5 });

  try {
    const [version] = await sql<{ version: string }[]>`select version() as version`;
    const rows = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `;

    return {
      serverVersion: version?.version ?? "version inconnue",
      tables: rows.map((row) => row.table_name)
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
};

/**
 * Décrit la cible, la joint si possible, et dit lesquelles des tables attendues
 * y sont déjà.
 *
 * Une base injoignable est un résultat, pas une exception : le prévol doit
 * pouvoir rendre son rapport complet même quand la moitié des vérifications
 * échoue, sinon la première panne masque toutes les suivantes.
 */
export async function probeDatabase(
  expectedTables: readonly string[],
  env: DatabaseEnv = process.env,
  inspect: DatabaseInspector = inspectWithPostgres
): Promise<DatabaseProbe> {
  const target = describeDatabaseTarget(env);

  if (!target) {
    return {
      status: "unconfigured",
      reason: "ni DATABASE_ADMIN_URL ni DATABASE_URL ne désigne une base lisible"
    };
  }

  const connectionUrl = env.DATABASE_ADMIN_URL ?? env.DATABASE_URL!;

  try {
    const inspection = await inspect(connectionUrl);
    const present = new Set(inspection.tables);

    return {
      status: "reachable",
      target,
      serverVersion: inspection.serverVersion,
      presentTables: expectedTables.filter((table) => present.has(table)),
      missingTables: expectedTables.filter((table) => !present.has(table))
    };
  } catch (error) {
    return {
      status: "unreachable",
      target,
      // Le message de `postgres` peut contenir l'hôte, jamais les identifiants.
      reason: error instanceof Error ? error.message : "erreur de connexion inconnue"
    };
  }
}
