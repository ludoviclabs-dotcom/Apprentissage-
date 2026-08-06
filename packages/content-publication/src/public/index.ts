/**
 * Point d'entrée « public ».
 *
 * Il n'exporte ni le garde, ni le magasin en écriture, ni la notation : une page
 * publique importe des projections et des types, pas les moyens de publier. La
 * séparation est un garde-fou d'import, pas une politique — un composant client
 * qui tenterait d'appeler `publishVersion` ne compilerait pas.
 */

export * from "./projection";
export type {
  PublicationStatus,
  PublishedContentVersion,
  PublishedSourceReference
} from "../types";
export {
  COMPTA_APPROFONDIE,
  COMPTA_APPROFONDIE_DOMAIN,
  COMPTA_APPROFONDIE_MODULE,
  getPublicChapter,
  resolvePublicChapter,
  type PublicChapterDefinition,
  type PublicModuleDefinition
} from "../taxonomy";
