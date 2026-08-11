import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editorialScopeSchema, type EditorialScopeExclusion } from "./editorial-scope";
import { pageUsabilityDir } from "./load-page-usability";

/**
 * Résolution du périmètre éditorial d'un chapitre.
 *
 * Comme pour la carte de fiabilité, un seul module sait où la politique vit.
 * Elle est facultative : un chapitre sans périmètre déclaré se génère comme
 * avant. Mais un fichier présent et illisible n'est pas « pas de périmètre » —
 * c'est une politique qu'on n'a pas su lire, et la génération s'arrête.
 */

export function editorialScopeFileName(chapterSlug: string): string {
  return `${chapterSlug}-editorial-scope.json`;
}

export class EditorialScopeInvalidError extends Error {
  readonly code = "editorial-scope-invalid";

  constructor(
    readonly chapterSlug: string,
    readonly detail: string
  ) {
    super(`le périmètre éditorial du chapitre « ${chapterSlug} » est inexploitable : ${detail}`);
    this.name = "EditorialScopeInvalidError";
  }
}

export interface ChapterEditorialScope {
  configured: boolean;
  scopeLabel?: string;
  exclusions: readonly EditorialScopeExclusion[];
  path: string;
}

export async function loadChapterEditorialScope(input: {
  dataDir: string;
  chapterSlug: string;
}): Promise<ChapterEditorialScope> {
  const path = join(pageUsabilityDir(input.dataDir), editorialScopeFileName(input.chapterSlug));

  if (!existsSync(path)) {
    return { configured: false, exclusions: [], path };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new EditorialScopeInvalidError(
      input.chapterSlug,
      `JSON illisible (${error instanceof Error ? error.message : String(error)})`
    );
  }

  const parsed = editorialScopeSchema.safeParse(raw);

  if (!parsed.success) {
    throw new EditorialScopeInvalidError(
      input.chapterSlug,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`).join(" | ")
    );
  }

  return {
    configured: true,
    scopeLabel: parsed.data.scopeLabel,
    exclusions: parsed.data.exclusions,
    path
  };
}
