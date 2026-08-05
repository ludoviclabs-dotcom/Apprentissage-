# Portes de qualité du contenu

Ce que `pnpm content:validate` vérifie, et ce qu'aucun contenu ne peut
contourner avant génération puis publication. Implémentation :
`packages/ingest/src/content-pipeline/validate.ts` (+ schémas Zod dans
`types.ts`). Erreur = code de sortie 1 ; avertissement = à traiter avant le lot
de génération.

## Portes bloquantes (erreurs)

| Code | Règle |
| --- | --- |
| `schema-invalide` | Tout artefact doit passer son schéma Zod : catégories fermées (`course/exercise/correction/synthesis/exam/reference`), extensions supportées uniquement, SHA-256 hexadécimal de 64 caractères, statuts d'extraction fermés. Pas de JSON libre. |
| chemin non portable (via schéma) | Chemins relatifs uniquement : pas de lettre de lecteur (`C:`), pas de `\`, pas de `/` initial, pas de `..`. |
| `chemin-duplique` | Deux entrées du manifeste ne peuvent pas partager le même chemin. |
| `compteur-incoherent` | `counts.*` doit refléter exactement les entrées présentes. |
| `pagination-incoherente` | `pageCount` = nombre de pages réellement extraites. |
| `pagination-non-croissante` | Les numéros de pages sont strictement croissants — impossible d'écraser la pagination réelle (jamais de `pageStart = 1` arbitraire). |
| `chunk-hors-pages` | Un chunk référence uniquement des pages qui existent dans son document, avec `pageStart ≤ pageEnd`. |
| `statut-incoherent` | Un document dont des pages posent problème ne peut pas se déclarer `extracted` ; un document `needs-docling` ne produit aucun chunk. |
| `artefact-manquant` | Un statut d'extraction non-`pending` exige l'artefact correspondant sur disque. |
| `checksum-divergent` / `statut-divergent` | L'artefact et le manifeste racontent la même histoire (même SHA-256, même statut) — sinon re-scanner puis ré-extraire. |
| `chemin-inconnu` | `pairing.json` ne peut citer que des documents du manifeste. |

## Avertissements (non bloquants, à instruire)

| Code | Signification |
| --- | --- |
| `degraded-extraction` | Page trop courte ou ratio alphanumérique faible — probable scan ou mise en page perdue. Page localisée précisément. |
| `table-suspected` | Lignes en colonnes alignées ou majoritairement numériques : tableau probablement aplati par l'extraction texte. À revoir avant toute citation. |
| `empty-page` | Page sans texte (illustration ou scan). |
| `pagination-unavailable` | DOCX : pas de pagination physique, une page logique unique. |
| `needs-docling` | Format non couvert par l'extracteur Node (`.pptx`, `.xlsx`) ou PDF globalement illisible : attendre le worker Docling. |
| `exercice-sans-corrige` / `corrige-sans-exercice` / `chapitre-sans-cours` | Trous de couverture détectés par le rapprochement. |
| `fichier-ignore` | Extension non supportée, listée avec sa raison. |
| `non-extrait` | Entrée encore `pending` — lancer `content:extract`. |
| `artefact-orphelin` | Artefact sur disque sans entrée au manifeste (document retiré des sources). |
| `doublon-probable` | Deux fichiers de même SHA-256 dans les sources. |

## Workflow éditorial (préparé, non actif)

Les contenus générés du lot suivant naîtront `draft` et suivront :

```text
draft → needs-review → approved → published
          ↑     |            |         |
          └─────┴────────────┴─────────┘  (toute régression repasse par la revue)
```

Transitions codées dans `canTransitionDraft`
(`packages/ingest/src/content-pipeline/types.ts`) et testées :
**aucun chemin ne mène de `draft` à `published` sans passer par `needs-review`
puis `approved`** — la publication automatique est structurellement impossible.

## Garanties d'hygiène (testées à chaque `pnpm test`)

- aucun PDF suivi par Git (`git ls-files "*.pdf"` vide) ;
- `.gitignore` couvre `content-private/`, `data/extracted/`,
  `data/generated/drafts/` et `*.pdf` ;
- aucun chemin absolu codé en dur dans `packages/ingest/src` ni dans
  `assemble-compta.mjs` ;
- checksums stables : deux scans du même corpus produisent le même manifeste.

## Commandes

```powershell
corepack pnpm content:validate
```

```powershell
# Cibler un pack précis
corepack pnpm content:validate -- --pack compta-approfondie
```
