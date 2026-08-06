import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenerationMode } from "../types/metadata";
import type { ContentGenerationProvider, GenerationRequest, GenerationResult } from "./types";

/**
 * Provider assisté — le repli quand aucun fournisseur live n'est configuré.
 *
 * CE QU'IL EST. Le rédacteur lit les extraits validés du chapitre et écrit lui-même
 * la charge utile JSON, dans un fichier d'entrée hors Git. Ce provider la relit,
 * la fait passer par **le schéma Zod du mode live**, et la rend à l'orchestrateur
 * qui applique ensuite **les mêmes** contrôles déterministes — recalcul de chaque
 * montant, équilibre de chaque écriture, vérification de chaque référence — puis
 * la **même** approbation humaine. Rien n'est allégé ; seule la plume change.
 *
 * CE QU'IL N'EST PAS. Un mock renommé. Trois différences structurelles, pas
 * déclaratives :
 *
 * 1. **La source du contenu.** Une fixture est choisie par `prompt.id` dans un
 *    catalogue compilé dans le dépôt, disponible pour tout chapitre qui a une
 *    fixture. Un contenu assisté est lu d'un fichier écrit pour *ce* chapitre.
 * 2. **L'absence est un échec.** Sans fichier, ce provider refuse et nomme le
 *    chemin attendu. Il ne retombe sur aucune fixture — un repli silencieux
 *    publierait de la démonstration en croyant publier du cours.
 * 3. **La traçabilité.** Le `model` rapporté porte l'empreinte du fichier lu :
 *    deux rédactions différentes ne peuvent pas se faire passer l'une pour
 *    l'autre dans les métadonnées d'un brouillon.
 *
 * LES ENTRÉES NE SONT PAS COMMITÉES. Elles dérivent du corpus privé, donc elles
 * vivent sous `data/generated/`, git-ignoré, exactement comme les brouillons
 * qu'elles produisent.
 */

export const MANUAL_ASSISTED_MODE: GenerationMode = "manual-assisted";

/** `data/generated/manual/<pack>/<chapitre>/<promptId>.json` */
export function manualPayloadPath(
  rootDir: string,
  packId: string,
  chapterSlug: string,
  promptId: string
): string {
  return join(rootDir, packId, chapterSlug, `${promptId}.json`);
}

export interface ManualAssistedOptions {
  /** Racine des charges utiles rédigées, hors Git. */
  rootDir: string;
  /** Qui a rédigé. Apparaît dans les métadonnées, jamais un secret. */
  author: string;
}

export class ManualAssistedContentProvider implements ContentGenerationProvider {
  readonly name = "manual-assisted";
  readonly mode: GenerationMode = MANUAL_ASSISTED_MODE;
  readonly model: string;

  constructor(private readonly options: ManualAssistedOptions) {
    this.model = `manual-assisted:${options.author}`;
  }

  async generateStructuredContent<T>(request: GenerationRequest<T>): Promise<GenerationResult<T>> {
    const path = manualPayloadPath(
      this.options.rootDir,
      request.envelope.sourcePackId,
      request.envelope.chapterSlug,
      request.prompt.id
    );

    if (!existsSync(path)) {
      return {
        ok: false,
        // Le chemin est relatif à la racine des entrées, pas absolu : un journal
        // de génération ne doit pas publier l'arborescence du poste.
        error:
          `aucune charge utile rédigée pour « ${request.prompt.id} » sur le chapitre « ${request.envelope.chapterSlug} » — ` +
          `attendue dans ${request.envelope.sourcePackId}/${request.envelope.chapterSlug}/${request.prompt.id}.json ` +
          "sous la racine des contenus assistés. Aucune fixture n'est utilisée en remplacement.",
        model: this.model,
        mode: this.mode,
        repairAttempts: 0
      };
    }

    const raw = await readFile(path, "utf8");
    const digest = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    const model = `${this.model}:${digest}`;

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      return {
        ok: false,
        error: `la charge utile « ${request.prompt.id} » n'est pas un JSON valide : ${
          error instanceof Error ? error.message : "erreur inconnue"
        }`,
        model,
        mode: this.mode,
        repairAttempts: 0
      };
    }

    const parsed = request.schema.safeParse(parsedJson);

    if (!parsed.success) {
      return {
        ok: false,
        // Aucune réparation n'est tentée, contrairement au mode live : une sortie
        // de modèle est un texte qu'on peut re-demander, une rédaction est un
        // fichier qu'on corrige. Deviner ce que l'auteur voulait écrire serait
        // exactement la correction silencieuse que ce lot interdit.
        error: `la charge utile rédigée ne respecte pas son schéma : ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} — ${issue.message}`)
          .join(" ; ")}`,
        model,
        mode: this.mode,
        repairAttempts: 0
      };
    }

    return { ok: true, data: parsed.data, model, mode: this.mode, repairAttempts: 0 };
  }
}
