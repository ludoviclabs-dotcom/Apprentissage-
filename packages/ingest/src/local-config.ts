import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lecture du `.env` local pour les commandes en ligne.
 *
 * POURQUOI CE FICHIER EXISTE. Next.js charge `.env` tout seul ; `tsx` ne le fait
 * pas. `CONTENT_SOURCE_ROOT` était donc documenté dans `.env.example` comme « la
 * racine scannée par `pnpm content:scan` » alors que la commande ne pouvait pas
 * le voir : elle retombait silencieusement sur `content-private/`, scannait un
 * dossier vide ou absent, et rendait un manifeste sans le dire. Une variable
 * documentée qu'un outil ignore est pire qu'une variable absente.
 *
 * LE SHELL L'EMPORTE TOUJOURS. Une valeur déjà présente dans l'environnement
 * n'est jamais remplacée : `CONTENT_SOURCE_ROOT=… pnpm content:scan` doit rester
 * la façon d'essayer un autre dossier sans toucher au fichier. C'est aussi la
 * règle de `--env-file` de Node, donc rien de surprenant pour qui la connaît.
 *
 * AUCUNE DÉPENDANCE. Le format lu est délibérément minimal — `CLÉ=valeur`,
 * commentaires `#`, guillemets simples ou doubles retirés s'ils encadrent toute
 * la valeur. Ni interpolation, ni valeurs multi-lignes, ni export : ce que le
 * dépôt met réellement dans son `.env`, et rien de plus. Un format plus riche
 * demanderait `dotenv`, qui n'est pas une dépendance ici.
 */

/**
 * Un environnement, vu comme un simple dictionnaire.
 *
 * Pas `NodeJS.ProcessEnv` : Next.js augmente ce type dans `apps/web` pour y
 * rendre `NODE_ENV` obligatoire, si bien qu'un objet littéral de test cesse d'y
 * être assignable selon le paquet qui compile. Un dictionnaire dit exactement ce
 * dont ces fonctions ont besoin, et `process.env` lui reste assignable.
 */
export type EnvLike = Record<string, string | undefined>;

export function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["'](.*)["']$/, "$1");

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      values[key] = value;
    }
  }

  return values;
}

export interface EnvFileApplication {
  /** Clés du fichier réellement posées dans l'environnement. */
  applied: string[];
  /** Clés du fichier qu'une valeur du shell a emporté. */
  overridden: string[];
}

export function applyEnvFile(
  values: Record<string, string>,
  env: EnvLike
): EnvFileApplication {
  const applied: string[] = [];
  const overridden: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined) {
      env[key] = value;
      applied.push(key);
    } else {
      overridden.push(key);
    }
  }

  return { applied, overridden };
}

export interface LocalEnvLoad extends EnvFileApplication {
  /** Faux quand il n'y a pas de `.env` — un cas normal, pas une erreur. */
  found: boolean;
}

/**
 * Charge `<repoRoot>/.env` s'il existe. Absent, la fonction ne fait rien et le
 * dit : une installation qui configure tout par le shell est légitime.
 */
export function loadLocalEnv(repoRoot: string, env: EnvLike = process.env): LocalEnvLoad {
  const path = join(repoRoot, ".env");

  if (!existsSync(path)) {
    return { found: false, applied: [], overridden: [] };
  }

  return { found: true, ...applyEnvFile(parseEnvFile(readFileSync(path, "utf8")), env) };
}
