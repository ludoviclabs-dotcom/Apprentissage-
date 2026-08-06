/**
 * Formats acceptés par l'ingestion.
 *
 * Isolé dans son propre module : `index.ts` et `content-pipeline/types.ts` en
 * ont tous deux besoin, et les faire dépendre l'un de l'autre créait un cycle
 * d'imports qui cassait le chargement du package.
 */
export const supportedExtensions = [".pdf", ".docx", ".pptx", ".xlsx", ".md"] as const;

export type SupportedExtension = (typeof supportedExtensions)[number];

export function isSupportedExtension(extension: string): extension is SupportedExtension {
  return supportedExtensions.includes(extension.toLowerCase() as SupportedExtension);
}
