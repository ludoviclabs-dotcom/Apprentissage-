/**
 * Bibliothèque de prompts versionnée.
 *
 * Les prompts vivent ici, jamais dans une route API ni dans un composant : un
 * prompt est un artefact de contenu, il se relit, se date et se version. La
 * règle de versionnement est stricte — **on ne modifie jamais un prompt publié**.
 * Corriger une consigne impose de déclarer une `v2` ; les brouillons déjà
 * générés continuent de référencer la `v1` dans leurs métadonnées et restent
 * donc explicables.
 */

export interface PromptDefinition {
  id: string;
  version: string;
  /** Ce que le prompt doit produire, en une phrase. */
  objective: string;
  /** Nom du schéma Zod qui valide la sortie, pour la traçabilité. */
  outputSchema: string;
  systemPrompt: string;
  /** Construit la partie variable à partir de l'enveloppe sérialisée. */
  buildUserPrompt(envelopeText: string, instruction: string): string;
}

export function promptKey(id: string, version: string): string {
  return `${id}.${version}`;
}

/**
 * Consignes communes à tous les prompts. La non-invention et la citation
 * obligatoire y sont énoncées une seule fois, pour qu'aucune famille de contenu
 * ne puisse les oublier.
 */
export const SHARED_RULES = `RÈGLES ABSOLUES, applicables à toute ta réponse :

1. NON-INVENTION. Tu n'écris que ce que les sources fournies établissent. Aucune
   règle, aucun compte, aucune formule, aucun montant, aucune date ne peut venir
   de tes connaissances générales. Si les sources ne permettent pas de produire
   un élément demandé, tu produis moins d'éléments — tu ne combles jamais.
2. CITATION OBLIGATOIRE. Chaque élément que tu produis cite ses sources par
   pack, documentId, documentTitle, sourceType, pageStart, pageEnd et chunkIds,
   repris À L'IDENTIQUE de l'enveloppe. Tu ne cites jamais une page ou un chunk
   qui n'y figure pas. Tu n'inventes jamais un numéro de page : ils te sont
   donnés. Le champ sourceType reprend la nature annoncée pour le document
   (« course », « official-reference », « personal-note », « exercise ») : ne
   présente JAMAIS un support de cours comme une référence officielle, ni
   l'inverse. Reporte effectiveDate uniquement si l'enveloppe la donne.
3. JSON UNIQUEMENT. Ta réponse entière est un objet JSON valide conforme au
   schéma demandé. Pas de texte avant, pas de texte après, pas de bloc de code
   Markdown, pas de commentaire.
4. LANGUE. Tout le contenu rédigé est en français, dans le registre d'un cours
   de comptabilité de niveau master.
5. AUCUN CHEMIN DE FICHIER. Tu ne mentionnes jamais un chemin, un dossier ou un
   nom de fichier local dans le contenu produit.`;

const JSON_REMINDER = `Réponds par un unique objet JSON valide, sans texte autour.`;

function definition(
  id: string,
  version: string,
  objective: string,
  outputSchema: string,
  specificRules: string
): PromptDefinition {
  return {
    id,
    version,
    objective,
    outputSchema,
    systemPrompt: `Tu es un concepteur pédagogique de comptabilité approfondie. Tu prépares des
brouillons destinés à une relecture humaine : ta sortie n'est jamais publiée telle quelle.

${SHARED_RULES}

CONSIGNES PROPRES À CETTE TÂCHE :
${specificRules}`,
    buildUserPrompt: (envelopeText, instruction) =>
      `${envelopeText}\n\n---\n\nTÂCHE : ${instruction}\n\n${JSON_REMINDER}`
  };
}

const DEFINITIONS: readonly PromptDefinition[] = [
  definition(
    "smart-revision-sheet",
    "v1",
    "Produire une fiche de révision structurée à partir d'une fiche de cours.",
    "smartRevisionSheetSchema",
    `- Chaque règle essentielle, chaque compte, chaque formule et chaque étape de
  chronologie porte ses PROPRES sourceReferences.
- accountMap ne contient que des comptes explicitement cités dans les sources,
  avec leur numéro exact tel qu'il y figure.
- formulas, accountMap et timelineSteps peuvent être des tableaux vides si les
  sources ne les documentent pas. Un tableau vide est préférable à une invention.
- workedExample suit les étapes : understand, data, rule, calculation, entry,
  result, justification. N'inclus « entry » que si les sources donnent l'écriture,
  et « calculation » que si elles donnent les chiffres.
- activeRecallQuestions sont des questions dont la réponse figure dans les sources.`
  ),
  definition(
    "flashcard-atomic",
    "v1",
    "Produire un lot de flashcards atomiques.",
    "flashcardBatchSchema",
    `- UNE carte teste UNE seule connaissance. Si tu hésites, coupe en deux cartes.
- Le recto ne doit jamais contenir les mots qui constituent la réponse.
- Le recto pose une seule question (un seul « ? »).
- Le verso est court et direct ; l'explication porte le développement.
- atomicityCheck.testedFactCount vaut 1 et singleFocus vaut true, sinon ne
  produis pas la carte.
- Ne produis pas deux cartes qui posent la même question autrement.
- Le type « account » cite un numéro de compte ; le type « formula » comporte
  une expression au verso.`
  ),
  definition(
    "calculation-exercise",
    "v1",
    "Produire des exercices de calcul dont le résultat est recalculable.",
    "calculationBatchSchema",
    `- formulaTemplateId DOIT être choisi dans la liste de templates autorisés
  fournie dans l'enveloppe. Tu ne peux pas écrire ta propre formule.
- templateInputs reprend exactement les noms d'entrées déclarés par le template
  choisi, et leurs valeurs doivent être IDENTIQUES aux variables de l'énoncé.
- Toutes les données chiffrées viennent des sources. N'invente aucun montant.
- expectedAnswer doit être le résultat du template appliqué à templateInputs,
  arrondi selon roundingRule. Il sera recalculé par le code : une divergence
  fait échouer la validation.
- calculationSteps décrit le raisonnement pas à pas, en français.
- competencyTags nomme au moins une compétence visée, en minuscules avec des
  tirets (par exemple « cg-emprunts-obligataires »).`
  ),
  definition(
    "journal-entry",
    "v1",
    "Produire des exercices d'écriture comptable équilibrés.",
    "journalEntryBatchSchema",
    `- Le total des débits DOIT égaler le total des crédits. L'équilibre est
  recalculé par le code.
- Une ligne porte un montant au débit OU au crédit, jamais les deux.
- Les numéros de compte viennent des sources, tels qu'ils y figurent.
- requiredAccounts liste les comptes sans lesquels l'écriture est fausse ;
  chacun doit apparaître dans expectedLines.
- expectedTotalDebit et expectedTotalCredit sont les sommes réelles des lignes.
- Les montants proviennent des données de l'énoncé source.
- competencyTags nomme au moins une compétence visée.`
  ),
  definition(
    "error-diagnosis",
    "v1",
    "Produire des diagnostics d'erreur à partir d'une faute plausible.",
    "errorDiagnosisBatchSchema",
    `- L'erreur présentée doit être RÉELLEMENT observable dans la réponse ou
  l'écriture proposée.
- expectedErrorCategory figure obligatoirement parmi errorCategories.
- errorCategories propose au moins deux choix distincts et plausibles.
- expectedCorrection explique la correction en s'appuyant sur les sources.
- La faute doit porter sur une règle que les sources énoncent.
- gradingRubric porte sur ce qui est réellement noté : la catégorie choisie.
- competencyTags nomme au moins une compétence visée.`
  ),
  definition(
    "progressive-case",
    "v1",
    "Produire un mini-cas progressif en étapes cohérentes.",
    "progressiveCaseSchema",
    `- Les étapes suivent une progression : chaque étape ne dépend que d'étapes de
  rang INFÉRIEUR (prerequisiteStepIds).
- answerSpecification.kind est identique à exerciseType de l'étape.
- Les écritures attendues sont équilibrées ; les calculs attendus sont exacts.
- sharedData porte les données communes, énoncées une seule fois.
- hintLevels va du plus discret (1) au plus explicite (3).
- Chaque étape cite ses sources et porte un barème non nul.
- competencyTags, au niveau du cas, nomme au moins une compétence visée.`
  )
];

export const PROMPT_REGISTRY: ReadonlyMap<string, PromptDefinition> = new Map(
  DEFINITIONS.map((prompt) => [promptKey(prompt.id, prompt.version), prompt])
);

export const PROMPT_KEYS: readonly string[] = [...PROMPT_REGISTRY.keys()].sort();

export function getPrompt(id: string, version: string): PromptDefinition | undefined {
  return PROMPT_REGISTRY.get(promptKey(id, version));
}

/** La version courante de chaque prompt, utilisée par défaut à la génération. */
export const CURRENT_PROMPT_VERSIONS: Readonly<Record<string, string>> = {
  "smart-revision-sheet": "v1",
  "flashcard-atomic": "v1",
  "calculation-exercise": "v1",
  "journal-entry": "v1",
  "error-diagnosis": "v1",
  "progressive-case": "v1"
};
