# Pipeline de contenu

Chaîne d'ingestion des sources pédagogiques privées vers des artefacts JSON
typés, prête à alimenter le parcours « Comptabilité approfondie ». Quatre
commandes, toutes déterministes, sans IA et sans réseau :

```text
content:scan  →  content:extract  →  content:pair  →  content:validate
manifest.json    pages/<sha>.json    pairing.json     portes de qualité
```

Code : `packages/ingest/src/content-pipeline/` (schémas Zod dans `types.ts`).
CLI : `packages/ingest/src/content-cli.ts`. Rien de tout cela n'est appelé par
l'application web ; le site continue de fonctionner sans aucun artefact.

## Prérequis

Déposer les sources dans le dossier privé (jamais commité) :

```powershell
# PowerShell — depuis la racine du dépôt
New-Item -ItemType Directory -Force content-private\comptabilite
Copy-Item "C:\Users\Ludo\Dropbox\Comptabilité Générale _ Approfondie\Comptabilité Approfondie\*" content-private\comptabilite\
```

Ou pointer directement la racine ailleurs (ex. Dropbox) via `.env` /
variable d'environnement :

```powershell
$env:CONTENT_SOURCE_ROOT = "C:\Users\Ludo\Dropbox\Comptabilité Générale _ Approfondie\Comptabilité Approfondie"
```

Sans variable, la racine par défaut est `content-private/` (relative au dépôt).

## Commandes

```powershell
corepack pnpm content:scan
corepack pnpm content:extract
corepack pnpm content:pair
corepack pnpm content:validate
```

Chaque commande accepte `--root <chemin>` et `--pack <id>` (défaut :
`comptabilite`). Exemple ciblé :

```powershell
corepack pnpm content:scan -- --root "C:\Users\Ludo\Dropbox\Comptabilité Générale _ Approfondie\Comptabilité Approfondie" --pack compta-approfondie
```

### content:scan

Inventorie récursivement la racine et écrit
`data/extracted/<pack>/manifest.json`. Chaque entrée porte : chemin relatif
portable (séparateurs `/`, jamais de chemin absolu), nom original, extension,
taille, checksum SHA-256, domaine détecté (`inferDomainFromPath`), catégorie
documentaire (`course | exercise | correction | synthesis | exam | reference`),
chapitre probable, clé de variante, et un statut d'extraction `pending`. Les
fichiers non supportés sont listés dans `skipped` avec leur raison.

### content:extract

Extrait chaque document **page par page** (`pdf-parse` renvoie le texte par
page ; le numéro réel est conservé, jamais un `1` arbitraire) :

- un artefact `pages/<sha256[0..12]>.json` par document : pages
  `{pageNumber, rawText, markdownText, issues}`, chunks bornés dans leur page,
  statut, problèmes ;
- le Markdown assemblé conserve les sauts de page (`<!-- page: N -->`) et les
  titres de section sont propagés aux pages suivantes ;
- pages vides, extraction dégradée ou tableau suspecté → statut `needs-review` ;
- `.docx` : une page logique unique, signalée `pagination-unavailable` ;
- `.pptx` / `.xlsx` : `needs-docling` (worker Docling à venir), aucun chunk ;
- le manifeste est mis à jour (statut, nombre de pages, problèmes).

### content:pair

Rapprochement déterministe par chapitre, sans IA (`pairing.json`) :

- groupe = (domaine, chapitre normalisé sans accents) ;
- « Fiche de cours » → `course`, « Mise en situation / Application / Exercice »
  → `exercise`, « Corrigé / Correction / Solution » → `correction`,
  « Synthèse » → `synthesis` ;
- énoncé ↔ corrigé appariés par clé de variante (« Application 3 » ↔
  « Application 3 - Corrigé ») ; un énoncé unique face à un corrigé unique est
  apparié d'office ;
- chaque groupe signale : énoncé sans corrigé, corrigé isolé, chapitre sans
  fiche de cours.

### content:validate

Rejoue toutes les portes de qualité (voir `docs/content-quality-gates.md`) sur
les trois artefacts et sort en code 1 à la moindre erreur. Les avertissements
(pages à revoir, corrigés manquants) n'empêchent pas la suite mais doivent être
traités avant génération.

## Ce que ce lot ne fait pas (volontairement)

- `content:generate` et `content:publish` n'existent pas encore : aucun appel
  IA, aucun contenu inventé, aucune publication automatique.
- Le workflow éditorial ne vit plus ici : il est porté par
  `@finance/content-generation` (voir `docs/content-review-workflow.md`), avec
  cinq états et sans état « publié ».
- L'écriture en base (`documents`, `document_pages`, `chunks`) n'est branchée
  sur rien. La fonction existe — `recordManifest` dans
  `packages/db/src/repository.ts` — mais **aucun appelant ne l'invoque** à ce
  jour. Les packs affichés sur `/source-packs` proviennent du catalogue seedé
  ou de la base ; le pipeline, lui, écrit dans `data/extracted/`. Relier les
  deux fait partie du lot suivant.

## L'interface web n'importe rien

`/source-packs` affiche les packs déjà connus et propose un **assistant**
(`apps/web/components/forms/source-pack-import-guide.tsx`) qui explique le flux
et compose la commande à copier. Il n'y a pas de bouton « Importer », parce
qu'il n'y a rien à importer depuis un navigateur :

- le serveur web n'a pas accès au disque de l'opérateur, et une instance
  déployée n'y aurait de toute façon aucun accès ;
- accepter un chemin de système de fichiers envoyé par un navigateur
  transformerait un flux local en surface de lecture côté serveur.

Le champ de chemin de l'assistant **ne quitte jamais le navigateur** : il sert
uniquement à composer une chaîne de caractères. Seuls les chemins relatifs au
projet sont acceptés (`source-packs/mon-pack`) ; un chemin absolu, un chemin
réseau, une URL ou une remontée `..` sont refusés avec un message explicite,
avant même que la commande existe. La logique est pure et testée
(`apps/web/lib/source-packs/import-command.ts`).

`GET /api/source-packs` reste la lecture des packs. `POST` répond **405** avec
`Allow: GET` : l'import n'est pas une action interdite à tel ou tel appelant,
c'est une méthode que cette ressource n'expose pas.
