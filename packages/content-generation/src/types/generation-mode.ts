import { z } from "zod";

/**
 * Les modes de génération, et lesquels une publication accepte.
 *
 * CE MODULE EST LA SEULE DÉFINITION DE CES DEUX LISTES. Il a été extrait de
 * `metadata.ts` le jour où une deuxième liste écrite à la main — le
 * `z.enum(["mock", "live"])` du schéma de publication — a divergé de celle-ci et
 * rendu impubliable un mode que le garde acceptait. La divergence n'était pas
 * visible : chaque liste était juste vue de son fichier, et seule leur
 * confrontation, au moment exact où un relecteur cliquait « Publier », révélait
 * qu'elles ne décrivaient pas le même système.
 *
 * IL NE DÉPEND QUE DE ZOD, ET C'EST UNE CONTRAINTE, PAS UN HASARD. La racine de
 * `@finance/content-generation` réexporte le magasin de brouillons et le
 * chargeur de corpus, qui importent `node:fs` : une définition qui y vivrait
 * seule ne pourrait pas être atteinte depuis un îlot client sans tirer `node:fs`
 * dans le paquet du navigateur. Le sous-chemin `@finance/content-generation/generation-mode`
 * existe pour cette raison, comme `./normative` avant lui.
 *
 * Trois provenances, et une seule frontière qui compte.
 *
 * - `mock` : une fixture technique. Elle sert à exercer la chaîne sans réseau et
 *   n'est du contenu pédagogique en aucun sens. **Impubliable, définitivement.**
 * - `live` : un modèle a rédigé le brouillon à partir de l'enveloppe de sources.
 * - `manual-assisted` : le brouillon a été rédigé à partir des extraits validés,
 *   sans appel à un fournisseur, puis soumis **aux mêmes** contrôles
 *   déterministes et à la **même** approbation humaine que `live`.
 *
 * `manual-assisted` n'est donc pas un `mock` renommé, et la distinction n'est pas
 * déclarative : une fixture est choisie par `prompt.id` dans un catalogue
 * compilé dans le dépôt, tandis qu'un contenu assisté est lu d'un fichier
 * d'entrée hors Git, écrit pour ce chapitre-là, et refusé s'il n'existe pas. Les
 * deux modes ne peuvent pas produire le même octet par accident.
 *
 * Ce qui autorise la publication est l'approbation humaine, pas le mode ; ce que
 * le mode décide est seulement s'il existe un chemin vers cette approbation. Le
 * mock n'en a aucun.
 */
export const generationModes = ["mock", "live", "manual-assisted"] as const;

export type GenerationMode = (typeof generationModes)[number];

/**
 * Le schéma des modes **connus**, employé partout où un mode est désérialisé.
 *
 * IL DÉCRIT CE QUI EST STRUCTURELLEMENT VALIDE, PAS CE QUI EST PUBLIABLE. Un
 * instantané de mode `mock` est une valeur bien formée — on peut la relire, la
 * comparer, l'auditer — et c'est le garde, pas Zod, qui décide qu'elle ne
 * franchit pas la frontière du site public. Confondre les deux avait précisément
 * pour effet de rendre `manual-assisted` illisible plutôt qu'impubliable, ce qui
 * se manifestait par une exception au lieu d'un refus motivé.
 */
export const generationModeSchema = z.enum(generationModes);

/** Les modes qu'une publication peut accepter, une fois l'humain passé. */
export const publishableGenerationModes = ["live", "manual-assisted"] as const;

export type PublishableGenerationMode = (typeof publishableGenerationModes)[number];

export const publishableGenerationModeSchema = z.enum(publishableGenerationModes);

/**
 * La liste blanche, et rien d'autre.
 *
 * ÉNONCER CE QUI EST ACCEPTÉ PLUTÔT QUE CE QUI EST REFUSÉ. Un `mode !== "mock"`
 * rendrait publiable, sans que personne ne l'ait décidé, tout mode ajouté par
 * une évolution ultérieure. Ici, un mode inconnu est refusé par défaut et le
 * reste jusqu'à ce que quelqu'un l'inscrive au-dessus — la décision est alors
 * prise au moment où le mode est créé, ce qui est le seul moment où elle peut
 * l'être en connaissance de cause.
 */
export function isPublishableGenerationMode(mode: string): mode is PublishableGenerationMode {
  return (publishableGenerationModes as readonly string[]).includes(mode);
}
