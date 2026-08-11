import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PageUsabilityMapInvalidError,
  PageUsabilityMapRequiredError,
  indexUsability,
  pageUsabilityFileName,
  pageUsabilityMapSchema,
  requiresPageUsabilityMap,
  type PageUsability
} from "./page-usability";

/**
 * Résolution de la carte de fiabilité d'un chapitre.
 *
 * C'est le seul module qui sait où une carte se trouve. Le CLI, un script ou un
 * test passent par lui ; aucun d'eux ne recompose le chemin, faute de quoi
 * l'un des trois finirait par chercher au mauvais endroit et conclure « pas de
 * carte », c'est-à-dire « tout est fiable ».
 */

/** Où vivent les cartes. Sous `data/generated`, donc hors Git, comme le reste. */
export function pageUsabilityDir(dataDir: string): string {
  return join(dataDir, "generated", "review");
}

export interface ChapterPageUsability {
  /** Vrai quand le corpus du chapitre impose une carte. */
  required: boolean;
  /** Vrai quand une carte a effectivement été chargée. */
  configured: boolean;
  pageUsability?: ReadonlyMap<string, PageUsability>;
  /** Chemin consulté, pour un message d'erreur exploitable. */
  path: string;
}

/**
 * Charge la carte d'un chapitre, ou refuse.
 *
 * TROIS ISSUES, ET AUCUN REPLI SILENCIEUX :
 *
 * - le corpus n'exige rien et aucune carte n'existe → comportement historique ;
 * - le corpus exige une carte et elle est valide → elle est appliquée ;
 * - le corpus exige une carte et elle manque ou ne se lit pas → refus.
 *
 * Le cas qui n'existe pas est « exigée mais absente, donc on continue » : c'est
 * précisément celui qui laisserait le texte d'une page non vérifiée entrer dans
 * une génération.
 */
export async function loadChapterPageUsability(input: {
  dataDir: string;
  chapterSlug: string;
  documents: ReadonlyArray<{ pages: ReadonlyArray<{ degraded: boolean }> }>;
}): Promise<ChapterPageUsability> {
  const path = join(pageUsabilityDir(input.dataDir), pageUsabilityFileName(input.chapterSlug));
  const required = requiresPageUsabilityMap(input.documents);

  if (!existsSync(path)) {
    if (required) {
      throw new PageUsabilityMapRequiredError(input.chapterSlug, path);
    }

    return { required, configured: false, path };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new PageUsabilityMapInvalidError(
      input.chapterSlug,
      `JSON illisible (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const parsed = pageUsabilityMapSchema.safeParse(raw);

  if (!parsed.success) {
    throw new PageUsabilityMapInvalidError(
      input.chapterSlug,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`).join(" | ")
    );
  }

  // Une carte existante s'applique même quand le corpus ne l'exigeait pas : un
  // classement écrit par une personne prime sur l'heuristique d'ingestion.
  return { required, configured: true, pageUsability: indexUsability(parsed.data), path };
}
