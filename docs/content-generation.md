# Fabrique de contenu — architecture

Génération de contenus pédagogiques à partir des sources privées déjà extraites
par le pipeline d'ingestion. Le principe tient en une phrase, inscrite en tête de
`packages/content-generation/src/index.ts` :

> **l'IA propose, Zod contrôle la structure, le code recalcule et vérifie, un
> humain approuve.**

Aucune de ces quatre étapes ne peut se substituer à une autre. Le générateur ne
décide pas de la forme (c'est le schéma), il ne décide pas des résultats
numériques (c'est le registre de calculs), et il ne décide jamais de la mise à
disposition (c'est un relecteur, et la publication n'existe pas dans ce lot).

Code : `packages/content-generation/src/`. CLI : `src/cli/`. Interface de revue :
`apps/web/app/admin/content-review/`.

## Le cycle

```text
SOURCE VALIDÉE      data/extracted/<pack>/ — manifeste, pages, chunks
      ↓             content:scan → content:extract → content:pair → content:validate
GÉNÉRATION          enveloppe + prompt versionné → provider (mock ou live)
      ↓
VALIDATION ZOD      le provider ne rend qu'un objet déjà conforme au schéma
      ↓
CONTRÔLES           références vérifiées, calculs refaits, équilibres recalculés
DÉTERMINISTES       (packages/content-generation/src/validation/engine.ts)
      ↓
needs_review        ← si tous les contrôles bloquants passent
validation_failed   ← sinon : le brouillon existe, il n'est pas approuvable
      ↓
approved | rejected décision humaine dans /admin/content-review
```

Un lot rendu par le générateur (quinze cartes, quatre exercices) est **éclaté en
brouillons unitaires** avant validation : la revue se fait carte par carte, et
approuver quinze cartes d'un bloc reviendrait à n'en relire aucune. Chaque
brouillon reçoit un identifiant déterministe `draft-<20 caractères hexadécimaux>`,
dérivé du SHA-256 de `chapitre:type:contenu` — régénérer deux fois le même contenu
depuis les mêmes sources désigne le même brouillon plutôt que d'en forker une
copie.

## Les six types de contenu

| Famille (`--types`) | Type stocké | Schéma | Prompt |
| --- | --- | --- | --- |
| `sheet` | `smart_revision_sheet` | `smartRevisionSheetSchema` | `smart-revision-sheet` |
| `flashcards` | `flashcard` | `generatedFlashcardSchema` | `flashcard-atomic` |
| `calculations` | `calculation_exercise` | `calculationExerciseSchema` | `calculation-exercise` |
| `journal_entries` | `journal_entry_exercise` | `journalEntryExerciseSchema` | `journal-entry` |
| `error_diagnoses` | `error_diagnosis_exercise` | `errorDiagnosisExerciseSchema` | `error-diagnosis` |
| `case` | `progressive_case` | `progressiveCaseSchema` | `progressive-case` |

Alias acceptés par `--types` : `fiche`, `cards`, `calculs`, `entries`,
`ecritures`, `diagnostics`, `cas`. Une valeur hors de cette liste est refusée
avec l'énumération complète en message. Sans `--types`, les six familles sont
générées, dans l'ordre du tableau.

Le contenu d'un brouillon est une union discriminée par `contentType`
(`contentPayloadSchema`) : il n'existe pas de JSON libre, et un contenu qui ne
correspond à aucune des six formes ne peut pas être écrit sur disque.

## L'enveloppe de sources

`buildSourceEnvelope` (`src/envelope/build.ts`) construit ce que le générateur
verra. Elle porte :

| Champ | Contenu |
| --- | --- |
| `chapterSlug`, `chapterLabel`, `domainId`, `sourcePackId` | Le périmètre exact de la génération. |
| `documents[]` | Par document : `documentId`, `title`, `category`, `pageCount`, `degradedPages`, et ses fragments. |
| `documents[].chunks[]` | `chunkId`, `pageStart`, `pageEnd`, `sectionTitle`, `content`, `contentHash`. |
| `excluded[]` | Fragments non transmis, avec leur raison. |
| `totalChars`, `maxInputChars` | Ce qui a réellement été transmis, et le plafond appliqué. |
| `inputHash` | SHA-256 des hashes de contenu triés : même corpus, même empreinte. |
| `allowedCalculationTemplates` | La liste fermée des calculs autorisés, transmise au générateur. |

Trois garanties structurent la construction :

1. **Un chapitre, un domaine.** Les documents sont filtrés sur `chapterSlug` ; si
   le chapitre couvre plusieurs domaines, la construction échoue plutôt que de
   produire des citations mélangées.
2. **Aucune troncature silencieuse.** Le plafond par défaut est de
   **60 000 caractères** (`DEFAULT_MAX_INPUT_CHARS`, redéfinissable par
   `CONTENT_AI_MAX_INPUT_CHARS`). Ce qui n'entre pas est consigné dans `excluded`
   avec sa raison — `limite de N caractères atteinte — contenu non transmis au
   générateur`, ou `chunk en double (même contenu déjà inclus)`. Un brouillon
   produit à partir d'un corpus amputé reste identifiable comme tel.
3. **Aucun chemin de fichier.** L'enveloppe ne transporte que des identifiants,
   des numéros de page et du texte. Le rendu textuel (`renderEnvelope`) le
   vérifie côté test : ni `.pdf`, ni lettre de lecteur.

Quand la place manque, l'ordre d'inclusion est celui de l'utilité : `course`,
puis `synthesis`, `correction`, `exercise`, `reference`, `exam`. C'est le cours
qui porte les règles citables, il entre en premier.

Les pages dont l'extraction est dégradée sont signalées au générateur dans
l'enveloppe (`⚠ pages à extraction dégradée, à éviter : …`) et restent listées
dans `degradedPages`.

## Les providers

| Mode | Classe | `name` | `model` | Réseau |
| --- | --- | --- | --- | --- |
| `mock` (défaut) | `MockContentProvider` | `mock` | `fixture-comptabilite-approfondie.v1` | aucun |
| `live` | `LiveContentProvider` | `live:<fournisseur>` | `CONTENT_AI_MODEL` | via `packages/ai` |

Le mode mock applique une fixture ancrée sur l'enveloppe réelle, puis la fait
passer par **le même schéma Zod** que le mode live : une fixture invalide échoue
exactement comme échouerait une sortie de modèle. C'est ce qui rend la chaîne de
validation testable sans clé d'API.

Le mode live habille un `AiProvider` de `packages/ai` — aucun second client HTTP,
aucun SDK supplémentaire. Sa seule logique propre est une boucle de réparation
bornée : quand la sortie n'est pas un JSON exploitable ou ne respecte pas le
schéma, les erreurs constatées sont renvoyées au modèle, et le nombre de
tentatives est inscrit dans `generationMetadata.repairAttempts`.

### Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `CONTENT_AI_ENABLED` | Doit valoir `true` pour qu'un appel externe soit possible. | `false` |
| `CONTENT_AI_PROVIDER` | `mock`, `openai` ou `ollama`. Retombe sur `AI_PROVIDER` si absent. | `mock` |
| `CONTENT_AI_MODEL` | Remplace `OPENAI_MODEL` / `OLLAMA_MODEL` pour la génération de contenu. | — |
| `CONTENT_AI_MAX_INPUT_CHARS` | Plafond de caractères transmis au générateur. | `60000` |
| `CONTENT_AI_MAX_RETRIES` | Réparations JSON avant abandon. | `2` |

Une génération live exige **les deux** : `--mode live` sur la ligne de commande
*et* `CONTENT_AI_ENABLED=true`. Une configuration incomplète lève une
`LiveProviderUnavailableError` explicite — jamais un repli silencieux sur le
mock. Un opérateur qui croit générer en live doit l'apprendre immédiatement.

Aucune de ces variables n'est lue par l'application web : elles ne concernent que
la CLI.

## Les commandes

Trois commandes, déclarées à la racine du dépôt et déléguées au package :

```powershell
corepack pnpm content:generate --chapter "Emprunts obligataires"
```

```powershell
corepack pnpm content:validate-generated --chapter "Emprunts obligataires"
```

```powershell
corepack pnpm content:report --chapter "Emprunts obligataires"
```

> Les deux formes fonctionnent, avec ou sans `--` avant les options. Les scripts
> racine délèguent par `corepack pnpm --filter`, qui transmet le `--`
> littéralement jusqu'à l'analyseur ; celui-ci l'ignore explicitement plutôt que
> de le refuser, parce que `pnpm <script> -- --option` est un réflexe répandu.

### Options

Les trois commandes partagent l'analyseur `parseCommonOptions`
(`src/cli/shared.ts`). Toutes acceptent donc la même syntaxe ; chacune n'exploite
que ce qui la concerne.

| Option | Effet | Défaut | Utilisée par |
| --- | --- | --- | --- |
| `--chapter <slug\|libellé>` | Chapitre visé. **Obligatoire.** Slug exact, ou libellé approché (accents et casse ignorés) ; une saisie ambiguë est refusée avec la liste des slugs concernés. | — | les trois |
| `--source-pack <id>` | Pack de sources dans `data/extracted/`. | `comptabilite` | les trois |
| `--output <dossier>` | Racine des brouillons. Chemin relatif résolu depuis la racine du dépôt. | `data/generated/drafts` | les trois |
| `--verbose` | Détaille chaque brouillon et ses problèmes. | `false` | `generate`, `validate-generated` |
| `--types <liste>` | Familles à générer, séparées par des virgules. | les six | `generate` |
| `--mode mock\|live` | Fournisseur. | `mock` | `generate` |
| `--dry-run` | Affiche l'enveloppe et s'arrête : aucune génération, aucune écriture, aucun appel au fournisseur. | `false` | `generate` |
| `--force` | Remplace les brouillons existants par une nouvelle révision. N'écrase **jamais** un contenu approuvé. | `false` | `generate` |
| `--limit <n>` | Borne le nombre de brouillons **écrits** (la génération, elle, a lieu entièrement). | — | `generate` |

Une option inconnue, une valeur manquante ou un `--limit` non entier positif
provoquent une `UsageError` : message court, rappel de la syntaxe, code de sortie
1.

### content:generate

Affiche le chapitre résolu, le domaine, le pack, le mode, les types demandés, les
documents sélectionnés avec leurs pages dégradées, le volume transmis et les
fragments exclus. Puis, hors `--dry-run` : génère, valide, écrit, et récapitule
par famille le nombre de contenus passés en `needs_review` et en
`validation_failed`, ainsi que le détail des écritures (créés, révisions,
approuvés préservés, existants conservés).

La sortie se termine toujours par la même phrase : aucun contenu n'est publié.

### content:validate-generated

Rejoue les contrôles déterministes sur les brouillons déjà produits et met à jour
leur statut : `needs_review` ↔ `validation_failed` selon le résultat. Deux
exceptions, volontaires :

- un contenu **approuvé** n'est jamais rétrogradé — il est seulement signalé s'il
  ne passe plus, et seule une action humaine peut le rouvrir ;
- un contenu **rejeté** reste rejeté tant qu'il n'est pas repris explicitement.

Quand le statut ne change pas, seul le constat de validation est rafraîchi et
aucune transition n'est inscrite dans l'historique. La commande sort en code 1
s'il reste au moins un contenu en échec.

### content:report

Rapport de couverture : répartition par statut, contenus exploitables par type
face à des repères indicatifs (1 fiche, 8–15 cartes, 3–5 calculs, 2–4 écritures,
2–4 diagnostics, 1 mini-cas), causes probables des trous de couverture, contenus
bloqués avec leur premier motif, avertissements, et mode de génération. Quand des
brouillons proviennent du mode mock, le rapport le dit — ce sont des fixtures
techniques, pas du contenu validé.

L'information utile de ce rapport est ce qui **manque** : un chapitre sans
corrigé produit moins d'exercices, et le rapport doit le dire plutôt que de le
masquer.

## Enchaînement complet

Depuis la racine du dépôt, sur le chapitre pilote.

```powershell
corepack pnpm content:scan --root content-private\comptabilite --pack compta-approfondie
```

```powershell
corepack pnpm content:extract --pack compta-approfondie
```

```powershell
corepack pnpm content:pair --pack compta-approfondie
```

```powershell
corepack pnpm content:validate --pack compta-approfondie
```

```powershell
corepack pnpm content:generate --chapter "Emprunts obligataires" --source-pack compta-approfondie --dry-run
```

```powershell
corepack pnpm content:generate --chapter "Emprunts obligataires" --source-pack compta-approfondie --mode mock
```

```powershell
corepack pnpm content:validate-generated --chapter "Emprunts obligataires" --source-pack compta-approfondie
```

```powershell
corepack pnpm content:report --chapter "Emprunts obligataires" --source-pack compta-approfondie
```

```powershell
$env:CONTENT_REVIEW_ENABLED = "true"
```

```powershell
corepack pnpm dev
```

L'espace de relecture est alors sur `http://localhost:3000/admin/content-review`.
Sans le drapeau, la route répond 404 : voir `docs/content-review-workflow.md`.

Les quatre premières commandes sont celles du lot précédent
(`docs/content-pipeline.md`) ; la racine des sources vient de `--root`, sinon de
`CONTENT_SOURCE_ROOT`, sinon de `content-private/`.

## Où vivent les brouillons

```text
data/generated/drafts/<packId>/<chapterSlug>/draft-<hex>.json
```

Un fichier JSON par brouillon, conforme à `contentDraftSchema` (enveloppe de
métadonnées + contenu discriminé). Le dossier est git-ignoré : un brouillon
contient du texte issu des PDF privés.

**Le disque est la source de vérité de ce lot.** La base n'est pas requise pour
générer ni pour relire, ce qui garde la fabrique utilisable sur une installation
locale sans PostgreSQL. La migration `0013` fournit les tables équivalentes —
`content_drafts` et `content_draft_transitions` — pour les installations qui
persistent, sans qu'aucun de ces chemins en dépende.

Chaque brouillon porte :

- `generationMetadata` : fournisseur, modèle, `promptId`, `promptVersion`,
  `inputHash`, pack, documents et fragments vus, mode, réparations. Jamais une
  clé d'API — le schéma nomme le fournisseur, pas le secret qui a servi à le
  joindre.
- `validationMetadata` : `passed`, version de validation, erreurs,
  avertissements, score de qualité, motifs bloquants. `null` tant que les
  contrôles n'ont pas tourné — ce qui n'est pas la même chose qu'un rapport vide.
- `reviewMetadata` : relecteur, date, motif, numéro de révision.
- `history` : la suite des transitions, avec acteur et horodatage.

## Ce que ce lot ne fait pas

Aucune publication, aucun bouton « Publier », aucune écriture dans les tables du
catalogue (`lessons`, `exercises`, `flashcards`, `concepts`). L'état `published`
**n'existe pas** dans la machine à états ni dans la contrainte `CHECK` de la
migration `0013` : la fuite d'un brouillon vers le site public est structurellement
impossible, et non simplement interdite. La promotion d'un contenu approuvé vers
le catalogue est le travail d'un lot ultérieur.

Aucun appel IA pendant `pnpm test` ni pendant `pnpm build` : le mode par défaut
est `mock`, et le mode live exige une activation explicite.
