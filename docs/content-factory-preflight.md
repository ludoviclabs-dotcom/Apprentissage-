# Contrôle préalable — fabrique pédagogique contrôlée

Date : 2026-08-05. Branche : `feat/compta-content-factory`.
Objet : état réel du dépôt avant la construction de la fabrique de contenu, écarts
constatés avec le lot précédent, et décisions d'architecture qui en découlent.

## 1. État vérifié du lot précédent

Le lot « pipeline d'ingestion » (commit `ab2201b`) est intégralement livré. Vérifié
en exécutant la chaîne : **878 tests passants, 49 fichiers de test, 0 échec**.

| Brique annoncée | État réel | Verdict |
| --- | --- | --- |
| `CONTENT_SOURCE_ROOT` | `.env.example`, lu par `content-cli.ts` | ✅ disponible |
| Exclusion Git des sources privées | `.gitignore` : `content-private/`, `data/extracted/`, `data/generated/drafts/`, `*.pdf` | ✅ disponible, testé |
| Scan + SHA-256 | `content-pipeline/scan.ts` | ✅ réutilisable tel quel |
| Extraction page par page | `content-pipeline/extract.ts`, `extractors.ts` | ✅ pages réelles préservées |
| `document_pages` / `chunks` fiables | artefacts `data/extracted/<pack>/pages/<sha12>.json` | ✅ chunks bornés par page |
| Classification documentaire | `content-pipeline/classify.ts` | ✅ 6 catégories |
| Association cours/exercice/corrigé | `content-pipeline/pair.ts` | ✅ groupes par chapitre |
| Commandes `content:scan/extract/pair/validate` | `package.json` racine + ingest | ✅ opérationnelles |
| Documentation | 4 fichiers `docs/content-*.md` | ✅ à jour |

## 2. Écarts constatés et corrections apportées dans ce lot

### 2.1 Écart bloquant — le workflow éditorial du lot 1 ne correspond pas au besoin

Le lot 1 avait défini, à titre préparatoire, un workflow à quatre états dans
`packages/ingest/src/content-pipeline/types.ts` :

```text
draft → needs-review → approved → published        (lot 1, kebab-case)
```

Le besoin réel de la fabrique en exige cinq, en `snake_case`, **sans** `published`
(la publication est hors périmètre) et **avec** deux états que le lot 1 ignorait —
`validation_failed`, qui matérialise l'échec des contrôles déterministes, et
`rejected`, qui matérialise un refus humain :

```text
draft → validation_failed → draft
draft → needs_review → approved
                    ↘ rejected → draft
```

Un contenu ne peut donc plus « échouer » silencieusement ni être rejeté sans trace.

**Correction** : le workflow autoritatif est déplacé dans le nouveau package
(`packages/content-generation/src/types/status.ts`) avec les cinq états, et
l'ébauche du lot 1 est supprimée de `packages/ingest`. Vérifié avant suppression :
elle n'était consommée que par son propre test et par la documentation — aucun
autre code n'en dépendait. Les documents du lot 1 sont mis à jour en conséquence.

### 2.2 Écart mineur — les chunks n'ont pas de titre de section exploitable

Sur le corpus réel, tous les chunks du chapitre pilote portent `sectionTitle:
"Sans titre"` : les PDF sources n'ont pas de titres Markdown (`#`), et l'heuristique
du lot 1 ne détecte donc rien. Ce n'est pas un défaut du pipeline mais une limite
du matériau. **Décision** : `sectionTitle` reste facultatif dans les références de
source, et l'enveloppe transmet le numéro de page comme repère principal. Aucune
correction de code n'est nécessaire.

### 2.3 Non-écart — l'absence de corrigé sur le chapitre pilote

Le chapitre « Emprunts obligataires » ne contient **pas** de corrigé
(`content:pair` le signale déjà : `exercice-sans-corrige`). Ce n'est pas un défaut à
corriger, c'est une contrainte à respecter : les réponses attendues des exercices
générés ne peuvent pas être recopiées d'un corrigé inexistant. Elles seront
**recalculées par le code** à partir des données présentes dans les énoncés
sources, ou l'élément ne sera pas produit. Voir §5.

## 3. Corpus réellement disponible pour le pilote

Pack `compta-approfondie`, chapitre `les-emprunts-obligataires`, domaine
`compta-generale` :

| Document | Catégorie | Pages | Statut | Chunks |
| --- | --- | --- | --- | --- |
| `Les emprunts obligataires - Fiche de cours.pdf` | `course` | 3 | `extracted` | 9 |
| `Les emprunts obligataires - Mise en situation.pdf` | `exercise` | 7 | `needs-review` (page 5 dégradée) | 10 |

Contenu réellement couvert par la fiche de cours (donc citable) : conditions
d'émission, valeur nominale, prix d'émission, prime de remboursement, coupon,
modalités de remboursement, et les comptes `163`, `169`, `4671`, `6272`, `16883`,
`6861`, `4816`, `6812`, `791`, avec l'étalement des primes et des frais d'émission
et leur présentation à l'actif du bilan.

Données chiffrées réellement présentes dans la mise en situation : cas CSP
(8 000 obligations de 1 000 €, émission 996 €, remboursement 1 006 €, coupon 90 €,
frais 100 000 € HT, 8 séries) et trois applications (Collins, Young, Brooks).

**Conséquence** : la page 5 étant dégradée, aucune référence de source ne pourra la
citer — la règle « pas de contenu approuvé citant une page `needs-review` » est
applicable dès ce lot.

## 4. Briques réutilisées (à ne pas dupliquer)

| Brique existante | Emplacement | Usage dans ce lot |
| --- | --- | --- |
| Artefacts d'extraction page-aware | `data/extracted/<pack>/` | Source unique de l'enveloppe ; aucune ré-extraction. |
| `ContentManifest`, `PairingReport` | `packages/ingest/src/content-pipeline/` | Sélection du chapitre et de ses documents. |
| `SourceReference`, `DomainId`, `Flashcard`, `Lesson`, `Exercise`, `Concept` | `packages/domain/src/types.ts` | Types de base ; les schémas de la fabrique s'y alignent. |
| `AiProvider`, `createAiProviderFromEnv` | `packages/ai/src/index.ts` | Le provider *live* s'appuie dessus — aucun SDK nouveau. |
| Tables `documents`, `document_pages`, `chunks` | migration `0001` | Cibles de vérification des références ; **inchangées**. |
| Conventions RLS + migrations | `packages/db/migrations/`, `schema.ts` | La migration `0013` suit le motif `DO $$ … FOREACH` de `0011`. |
| `requireAdmin`, `resolveAdmin` | `apps/web/lib/auth/require-admin.ts` | Garde d'accès de l'interface de revue (refus en 404). |
| Primitives UI + CSS global | `apps/web/components/ui/`, `app/styles/` | L'interface de revue réutilise `page-stack`, `panel`, `state-token`, `Feedback`… |
| Vitest + Playwright | `vitest.config.ts`, `playwright.config.ts` | Aucun runner nouveau. |

## 5. Décisions d'architecture

### 5.1 Une table `content_drafts`, et non une extension des tables du catalogue

Le brief demande de justifier toute nouvelle table. Les structures existantes sont
réellement incompatibles, pour trois raisons cumulatives :

1. **Les tables du catalogue sont un état publié, pas un état de travail.**
   `lessons`, `exercises`, `flashcards`, `concepts` n'ont ni statut, ni métadonnées
   de génération, ni historique de revue. Y ajouter un statut éditorial obligerait
   à filtrer *toutes* les lectures existantes (`getLessons`, `getExercises`,
   `getFlashcards`, …) sur `WHERE status = 'published'`. Un oubli publierait un
   brouillon sur le site public — exactement le risque que ce lot doit rendre
   impossible. Ne pas toucher ces tables rend la fuite structurellement impossible.
2. **Quatre des six types produits n'ont aucune table d'accueil.**
   `SmartRevisionSheet`, `CalculationExercise`, `JournalEntryExercise`,
   `ErrorDiagnosisExercise` et `ProgressiveCase` ne correspondent à aucun schéma
   existant. Les y forcer demanderait cinq tables supplémentaires, soit davantage
   de surface que la solution retenue.
3. **Le brouillon est polymorphe, le catalogue ne l'est pas.** Un brouillon porte
   toujours les mêmes métadonnées (génération, validation, revue, historique) et un
   contenu qui varie selon son type — un `payload` JSONB discriminé par
   `content_type` et validé par Zod à la frontière exprime cela sans multiplier les
   tables.

La table `content_drafts` ne remplace donc rien : elle précède le catalogue. La
promotion d'un brouillon approuvé vers `lessons`/`flashcards`/`exercises` est le
travail du lot suivant, et n'existe pas dans celui-ci.

Une seconde table, `content_draft_transitions`, porte l'historique des changements
de statut (ancien, nouveau, date, acteur, commentaire). Elle est distincte parce
qu'un historique s'ajoute, ne se met jamais à jour, et doit survivre à toute
réécriture du brouillon.

### 5.2 Les calculs passent par des templates versionnés, pas par un parseur

Le dépôt possède déjà un moteur de formules sûr (`packages/domain/src/spreadsheet/`),
mais il est orienté **cellules A1** : il sert à noter une grille Excel. Les
exercices de calcul de comptabilité approfondie manipulent des variables nommées
(nominal, taux, nombre d'obligations, prorata). Les faire transiter par des
références de cellules rendrait l'énoncé illisible et le contrôle plus fragile.

Décision : un **registre fermé et versionné de templates de calcul**, chacun étant
une fonction TypeScript pure. L'IA ne peut que désigner un `formulaTemplateId` et
fournir des entrées nommées ; elle ne peut pas exprimer une opération arbitraire.
C'est plus fort qu'un parseur sûr — la surface d'expression est nulle. Aucun `eval`,
aucun `Function`, aucune exécution dynamique. Le moteur de formules existant reste
la solution du lab Excel et n'est pas dupliqué.

### 5.3 Le provider live réutilise `packages/ai`, aucun SDK nouveau

`packages/ai` expose déjà `AiProvider` (`complete(messages)`) avec des
implémentations OpenAI et Ollama, plus `DisabledAiProvider`. Le provider live de la
fabrique s'appuie dessus : la fabrique apporte la structure (schéma, prompt
versionné, réparation JSON bornée, `inputHash`), pas un second client HTTP.
Le mode par défaut reste `mock` : `pnpm install`, `pnpm test` et `pnpm build`
n'appellent jamais un service externe.

### 5.4 Les sources privées ne franchissent jamais la frontière du navigateur

L'enveloppe envoyée au générateur contient le texte extrait et des identifiants,
jamais un chemin de fichier. Les artefacts d'extraction portent déjà des chemins
relatifs (garanti par le schéma Zod du lot 1). L'interface de revue affiche le texte
extrait et les métadonnées ; elle ne sert aucun PDF et n'expose aucun chemin absolu.

## 6. Ce que ce lot ne fait pas

Aucune publication, aucun bouton « Publier », aucune écriture dans les tables du
catalogue, aucun appel IA pendant les tests ou le build, aucune synchronisation
Dropbox, aucune base vectorielle. La transition vers un état `published` n'existe
pas dans la machine à états — elle ne peut donc pas être déclenchée par erreur.
