# Audit ciblé — pipeline de contenu « Comptabilité approfondie »

Date : 2026-08-05. Périmètre : `packages/ingest`, `packages/domain`, `packages/db`, scripts
racine. Objectif : préparer l'ingestion et la publication du parcours « Comptabilité
approfondie » sans dupliquer l'existant.

## 1. Ce qui existe et se réutilise tel quel

### packages/ingest

| Élément | Fichier | Verdict |
| --- | --- | --- |
| `createSourcePackManifest` | `src/index.ts` | Réutilisable : parcours récursif, tri stable, SHA-256, comptage des fichiers ignorés. Le manifeste enrichi du pipeline s'appuie dessus (mêmes checksums). |
| `inferDomainFromPath` | `src/index.ts` | Réutilisable tel quel : les regex couvrent déjà compta générale/approfondie/analytique, IFRS, ISO, fiscalité. Le pipeline l'appelle par fichier. |
| `extractPdf` / `extractDocx` | `src/extractors.ts` | Réutilisables mais **aplatis** : `getText()` de `pdf-parse` v2 renvoie pourtant `pages: [{num, text}]`, jeté aujourd'hui. L'extraction page-aware l'exploite (aucune dépendance nouvelle). |
| `normalizeText`, `assessQuality` | `src/extractors.ts` | Réutilisables : la même heuristique qualité s'applique désormais **par page**. |
| `chunkMarkdown` | `src/index.ts` | À corriger : `pageStart = pageEnd = 1` codés en dur. Corrigé en place (les chunks suivent les pages réelles quand le document en a). |
| `sourcePackManifestSchema` (Zod) | `src/index.ts` | Conservé pour l'import DB existant ; le pipeline ajoute son propre schéma enrichi sans casser celui-ci. |
| `build-corpus.ts` | `src/build-corpus.ts` | Prototype ponctuel : chemin Dropbox en dur en défaut, catégorisation binaire course/exercise, sortie non validée. Remplacé par les commandes `content:*` ; conservé le temps de la transition. |

### packages/domain

| Élément | Verdict |
| --- | --- |
| `DomainId`, `SourceType`, `SourceReference`, `DocumentRecord`, `Chunk` (`src/types.ts`) | Réutilisés tels quels. `SourceReference` porte déjà pack/document/pageStart/pageEnd/effectiveDate : c'est la cible des citations des fiches 2.0. |
| `SourcePackStatus` (`ready / processing / needs-review`) | Réutilisé pour le statut global d'un pack. |
| `assemble-compta.mjs` | **Problème corrigé dans ce lot** : `INPUT` pointait sur un chemin absolu `AppData/Local/Temp/claude/...`. Il lit désormais argument CLI → `COMPTA_ASSEMBLY_INPUT` → `data/generated/compta-assembly.json` (relatif au dépôt), et échoue avec un message clair si le fichier manque. |
| `compta-v1.ts` | Généré ; inchangé dans ce lot. |

### packages/db

| Élément | Verdict |
| --- | --- |
| `source_packs`, `documents`, `document_pages`, `chunks` (`src/drizzle-schema.ts`) | **Aucune table nouvelle nécessaire pour ce lot.** `document_pages(page_number, raw_text, markdown_text, extracted_tables_json)` et `chunks(page_start, page_end)` sont déjà taillées pour l'extraction page-aware. |
| `importSourcePackFromManifest` (`src/repository.ts`) | Réutilisable : insère packs/documents/pages/chunks. Limite actuelle : il n'extrait que les `.md` et écrit une seule page. L'écriture multi-pages depuis les artefacts `data/extracted/` est le point de branchement du lot suivant, sans changement de schéma. |

### Scripts et racine

- `pnpm ingest` (→ `packages/ingest/src/cli.ts`) n'imprimait qu'un manifeste : conservé, les
  nouvelles commandes `content:*` portent le vrai pipeline.
- `.gitignore` couvrait `data/raw|processed|exports|backups` mais ni `content-private/`, ni
  `data/extracted/`, ni `data/generated/drafts/` : corrigé dans ce lot, plus un garde-fou
  global `*.pdf`. Vérification : `git ls-files "*.pdf"` est vide aujourd'hui, et un test
  l'asserte désormais.

## 2. Manques identifiés (comblés dans ce lot)

1. **Manifeste enrichi** : l'existant ne porte ni catégorie documentaire, ni chapitre, ni
   statut d'extraction, ni problèmes détectés. → `contentManifestSchema` (Zod) dans
   `packages/ingest/src/content-pipeline/`.
2. **Classification documentaire déterministe** : « Fiche de cours » → `course`,
   « Mise en situation / Application / Exercice » → `exercise`, « Corrigé / Correction /
   Solution » → `correction`, « Synthèse » → `synthesis`, annales → `exam`, défaut
   `reference`. Aucune IA.
3. **Extraction page-aware** : `document_pages` réels, numéros de pages préservés,
   chunks bornés par page, `needs-review` sur pages dégradées ou tableaux suspectés.
4. **Rapprochement par chapitre** : groupes course/exercise/correction déterministes
   (normalisation des accents, clé de variante « Application 1 » ↔ « Application 1 - Corrigé »).
5. **Workflow éditorial** (première ébauche ; remplacée depuis par la machine à
   cinq états de `@finance/content-generation` — voir
   `docs/content-factory-preflight.md` §2.1) : les statuts `draft → needs-review → approved → published`
   n'existaient nulle part. Le type `ContentDraftStatus` et ses transitions autorisées sont
   définis dans ce lot ; la génération et la publication restent hors périmètre.

## 3. Manques identifiés (reportés, avec point d'ancrage)

| Manque | Lot | Ancrage prévu |
| --- | --- | --- |
| Table `content_drafts` (statut éditorial, auteur, revue) | Génération contrôlée | Nouvelle migration `packages/db/migrations` ; aucune table existante ne modélise la revue humaine. |
| Écriture DB multi-pages depuis `data/extracted/` | Génération contrôlée | Étendre `importSourcePackFromManifest` (schéma inchangé). |
| Extraction fidèle des tableaux PDF | Plus tard (worker Docling) | `workers/ingestion-worker` est la frontière prévue ; en attendant les pages à tableaux sont marquées `needs-review`. |
| `.pptx` / `.xlsx` | Plus tard | Déjà signalés `needs-docling` par l'existant. |

## 4. Décisions d'architecture de ce lot

- **Aucune table ni abstraction dupliquée** : le pipeline produit des artefacts JSON sous
  `data/extracted/` validés par Zod, alignés champ à champ sur `documents`,
  `document_pages` et `chunks`, pour que l'import DB du lot suivant soit un mapping direct.
- **Sources privées hors Git** : `content-private/` (défaut de `CONTENT_SOURCE_ROOT`),
  jamais servi par l'app, jamais commité. Les artefacts extraits sont également ignorés
  (ils contiennent le texte des PDF).
- **Chemins portables** : tout chemin persisté est relatif à la racine des sources et
  normalisé en `/` ; la validation refuse chemins absolus, lettres de lecteur et `..`.
- **Déterminisme** : mêmes octets → même checksum → mêmes ids (`<pack>-<sha256[0..12]>`),
  même classement, mêmes groupes. Tout est testable sans IA et sans réseau.
