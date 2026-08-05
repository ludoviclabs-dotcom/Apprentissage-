# Bibliothèque de prompts

Les prompts de la fabrique vivent dans un seul fichier :
`packages/content-generation/src/prompts/registry.ts`. Jamais dans une route API,
jamais dans un composant. Un prompt est un artefact de contenu — il se relit, se
date, se version, et il doit rester lisible sans ouvrir le code qui l'appelle.

La règle de versionnement est stricte : **on ne modifie jamais un prompt publié.**
Corriger une consigne impose de déclarer une `v2`. Les brouillons déjà générés
continuent de référencer la `v1` dans leurs métadonnées et restent donc
explicables.

## Structure d'un `PromptDefinition`

| Champ | Rôle |
| --- | --- |
| `id` | Identifiant stable de la famille (`flashcard-atomic`). |
| `version` | `v1`, `v2`, … Le format est vérifié par `generationMetadataSchema` (`/^v\d+$/`). |
| `objective` | Ce que le prompt doit produire, en une phrase. |
| `outputSchema` | Nom du schéma Zod qui valide la sortie, pour la traçabilité. |
| `systemPrompt` | Rôle + règles partagées + consignes propres à la tâche. |
| `buildUserPrompt(envelopeText, instruction)` | Assemble la partie variable. |

Le registre est une `Map` clefée par `id.version` (`promptKey`), exposée par
`PROMPT_REGISTRY`, `PROMPT_KEYS` et `getPrompt(id, version)`.

Le `systemPrompt` est assemblé par une fabrique interne, toujours dans le même
ordre :

```text
Tu es un concepteur pédagogique de comptabilité approfondie. Tu prépares des
brouillons destinés à une relecture humaine : ta sortie n'est jamais publiée
telle quelle.

<SHARED_RULES>

CONSIGNES PROPRES À CETTE TÂCHE :
<règles de la famille>
```

Le `buildUserPrompt` produit, lui :

```text
<enveloppe rendue par renderEnvelope>

---

TÂCHE : <instruction>

Réponds par un unique objet JSON valide, sans texte autour.
```

L'instruction concrète (« Produis entre 8 et 15 flashcards atomiques… ») ne vit
pas dans le registre mais dans `KIND_DEFINITIONS`
(`src/generate/orchestrator.ts`), auprès de la famille qu'elle sert et du schéma
qui la valide.

## Les règles partagées

`SHARED_RULES` est énoncé **une seule fois**, pour qu'aucune famille de contenu ne
puisse en oublier une. Les cinq règles, dans l'ordre du fichier :

| # | Règle | Ce qu'elle interdit |
| --- | --- | --- |
| 1 | **NON-INVENTION** | Rien ne peut venir des connaissances générales du modèle : ni règle, ni compte, ni formule, ni montant, ni date. Si les sources ne permettent pas de produire un élément, le modèle en produit moins — il ne comble jamais. |
| 2 | **CITATION OBLIGATOIRE** | Chaque élément cite ses sources par `documentId`, `pageStart`, `pageEnd` et `chunkIds`, repris à l'identique de l'enveloppe. Aucun numéro de page inventé : ils sont donnés. |
| 3 | **JSON UNIQUEMENT** | Pas de texte avant, pas de texte après, pas de bloc Markdown, pas de commentaire. |
| 4 | **LANGUE** | Français, registre d'un cours de comptabilité de niveau master. |
| 5 | **AUCUN CHEMIN DE FICHIER** | Ni chemin, ni dossier, ni nom de fichier local dans le contenu produit. |

Ces règles sont des consignes, pas des garanties : ce qui les rend opposables,
c'est le moteur de contrôles déterministes qui les revérifie après coup — une
citation absente devient `aucune-source`, une citation fausse
`chunk-inconnu`, un chemin oublié `chemin-absolu`. Voir
`docs/content-validation-rules.md`.

Un test parcourt `PROMPT_KEYS` et vérifie que le `systemPrompt` de chaque prompt
enregistré contient bien `NON-INVENTION` et `JSON UNIQUEMENT` : un prompt ajouté
sans passer par la fabrique commune échoue à la construction du lot de tests.

## Les six prompts

| `id.version` | Objectif | Schéma de sortie |
| --- | --- | --- |
| `smart-revision-sheet.v1` | Produire une fiche de révision structurée à partir d'une fiche de cours. | `smartRevisionSheetSchema` |
| `flashcard-atomic.v1` | Produire un lot de flashcards atomiques. | `flashcardBatchSchema` |
| `calculation-exercise.v1` | Produire des exercices de calcul dont le résultat est recalculable. | `calculationBatchSchema` |
| `journal-entry.v1` | Produire des exercices d'écriture comptable équilibrés. | `journalEntryBatchSchema` |
| `error-diagnosis.v1` | Produire des diagnostics d'erreur à partir d'une faute plausible. | `errorDiagnosisBatchSchema` |
| `progressive-case.v1` | Produire un mini-cas progressif en étapes cohérentes. | `progressiveCaseSchema` |

Quelques consignes propres méritent d'être connues, parce qu'elles ont une
contrepartie exécutable :

- **fiche de révision** — `formulas`, `accountMap` et `timelineSteps` peuvent être
  des tableaux vides si les sources ne les documentent pas. Un tableau vide est
  préférable à une invention ; le moteur émet alors un avertissement, jamais une
  erreur.
- **flashcards** — une carte teste une seule connaissance, le recto pose un seul
  « ? » et ne contient pas les mots de la réponse. Le générateur doit renseigner
  `atomicityCheck`, et le code **recompte** derrière lui.
- **calculs** — `formulaTemplateId` est choisi dans la liste de templates
  autorisés transmise par l'enveloppe. Le modèle ne peut pas écrire sa propre
  formule ; `expectedAnswer` sera recalculé.
- **écritures** — l'équilibre débit/crédit est recalculé par le code, les numéros
  de compte viennent des sources telles qu'elles les écrivent.
- **diagnostics** — l'erreur présentée doit être réellement observable dans la
  réponse ou l'écriture proposée, et porter sur une règle que les sources
  énoncent.
- **mini-cas** — chaque étape ne dépend que d'étapes de rang inférieur, et
  `answerSpecification.kind` est identique à `exerciseType`.

## Versions courantes

```text
CURRENT_PROMPT_VERSIONS = {
  "smart-revision-sheet": "v1",
  "flashcard-atomic":     "v1",
  "calculation-exercise": "v1",
  "journal-entry":        "v1",
  "error-diagnosis":      "v1",
  "progressive-case":     "v1"
}
```

C'est cette table, et elle seule, que l'orchestrateur consulte pour choisir la
version à employer. Un prompt absent de la table, ou pointant vers une version
absente du registre, fait sauter la famille concernée avec un motif explicite
plutôt que d'en produire silencieusement une autre.

Un test vérifie que chaque entrée de `CURRENT_PROMPT_VERSIONS` résout bien vers un
prompt existant.

## Publier une `v2` sans écraser l'existant

Chaque brouillon inscrit `promptId` et `promptVersion` dans son
`generationMetadata`. Modifier une `v1` en place rendrait donc **fausses** les
métadonnées de tous les contenus déjà produits : ils prétendraient venir d'un
prompt qu'ils n'ont jamais vu. La procédure est donc additive.

1. **Ne toucher à rien de la `v1`.** Ni son texte, ni son `objective`, ni son
   `outputSchema`. Elle reste dans `DEFINITIONS` pour toujours.
2. **Ajouter une entrée** au tableau `DEFINITIONS`, avec le même `id` et la
   version `"v2"` :

   ```text
   definition(
     "flashcard-atomic",
     "v2",
     "…objectif, éventuellement reformulé…",
     "flashcardBatchSchema",
     `- …consignes propres, corrigées…`
   )
   ```

   La clé du registre devient `flashcard-atomic.v2` ; `flashcard-atomic.v1`
   continue d'exister et reste résolvable par `getPrompt("flashcard-atomic", "v1")`.
3. **Mettre à jour `CURRENT_PROMPT_VERSIONS`** pour cette famille, et elle seule.
   C'est le seul geste qui change le comportement des générations à venir.
4. **Ne pas régénérer par réflexe.** Les brouillons existants restent valides et
   restent attribués à la `v1`. Une régénération est un choix, exécuté avec
   `--force` — qui crée une nouvelle révision, conserve la date de création et
   l'historique, et n'écrase jamais un contenu approuvé.
5. **Le comparer.** Les deux versions étant simultanément présentes, un contenu
   produit par la `v2` se lit dans l'interface de revue à côté d'un contenu
   produit par la `v1` : la ligne `promptId.promptVersion` est affichée en tête
   de chaque brouillon.

Une modification du schéma de sortie n'est pas une nouvelle version de prompt :
c'est un changement de contrat qui touche aussi les contrôles et le stockage. Il
se traite comme tel, et non par cette procédure.

## Le même raisonnement pour les calculs

Le registre de templates de calcul (`src/calc/templates.ts`) suit exactement la
même règle : les identifiants sont de la forme `<id>.<version>`, et **modifier le
comportement d'un template existant impose de publier une `v2`**. Les brouillons
déjà générés continuent de désigner la `v1` et gardent le sens qu'ils avaient au
moment de leur validation. Voir `docs/content-validation-rules.md`.
