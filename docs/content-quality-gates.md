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
| `degraded-extraction` | Ratio alphanumérique faible, ou page trop courte **portant une image significative** : une partie du contenu échappe au texte. Page localisée précisément. |
| `table-suspected` | Lignes en colonnes alignées ou majoritairement numériques : tableau probablement aplati par l'extraction texte. À revoir avant toute citation. |
| `empty-page` | Page sans aucun texte, **portant une image significative** : scan ou illustration. |
| `sparse-page` | Page peu dense **sans image** : le texte extrait est complet. Formulaire à remplir, page de séparation. Non bloquant — voir plus bas. |
| `blank-page` | Page sans texte ni image : réellement vierge, rien n'a été perdu. Non bloquant. |
| `image-probe-failed` | Le sondage d'images n'a pas abouti sur ce document : ses pages peu denses restent classées `degraded-extraction`, faute de pouvoir établir qu'elles ne le sont pas. |
| `pagination-unavailable` | DOCX : pas de pagination physique, une page logique unique. |
| `needs-docling` | Format non couvert par l'extracteur Node (`.pptx`, `.xlsx`) ou PDF globalement illisible : attendre le worker Docling. |
| `exercice-sans-corrige` / `corrige-sans-exercice` / `chapitre-sans-cours` | Trous de couverture détectés par le rapprochement. |
| `fichier-ignore` | Extension non supportée, listée avec sa raison. |
| `non-extrait` | Entrée encore `pending` — lancer `content:extract`. |
| `artefact-orphelin` | Artefact sur disque sans entrée au manifeste (document retiré des sources). |
| `doublon-probable` | Deux fichiers de même SHA-256 dans les sources. |

## Page mal extraite ou page peu dense ?

Un seuil de longueur ne sait pas répondre à cette question, et la confusion se
payait à l'autre bout de la chaîne : `assessPage` faisait de toute page de moins
de 200 caractères un problème de page, ce qui basculait le document en
`needs-review`, marquait la page `degraded` à l'entrée du corpus, et faisait
**refuser la publication** de tout contenu la citant
(`packages/content-publication/src/guard.ts`). Une consigne courte au-dessus d'un
formulaire vierge suffisait donc à rendre un chapitre impubliable.

Le pack `compta-approfondie` porte les deux cas, et ils sont indiscernables au
seul vu du texte :

| Page | Texte | Image | Réalité |
| --- | --- | --- | --- |
| Les emprunts obligataires - Mise en situation, p. 5 | 72 car. | aucune | Consigne complète au-dessus d'un formulaire de journal vierge tracé en vectoriel. Extraction **fidèle**. |
| Les titres - Mise en situation, p. 14 | 82 car. | aucune | Idem. Extraction **fidèle**. |
| Les titres - Fiche de cours, p. 2 | 1 car. | 1319 × 1022 | Arbre de décision entier (« Possession durable ? », « TIAP », « Titres de participation ») rastérisé. Extraction **échouée**. |
| Les titres - Mise en situation, p. 3 | 188 car. | 1998 × 795 + 2096 × 751 | Deux avis de débit bancaires porteurs des montants, plus les énoncés en pense-bêtes, tous en image. Extraction **échouée**. |

La présence d'une image significative départage les deux, et c'est le seul
signal qui le fasse : `getTable()` ne détecte aucun tableau sur ces quatre pages,
le formulaire vierge étant tracé en lignes vectorielles isolées. Le pipeline
sonde donc les images (`pdf-parse`, `getImage()`, aucune dépendance nouvelle) et
en tire deux codes distincts plutôt qu'un seul verdict.

Trois précautions, chacune motivée :

- **Sondage ciblé.** Seules les pages déjà signalées trop courtes sont sondées.
  Mesuré sur les dix PDF du pack (84 pages, 4 candidates) : `getText()` seul
  ≈ 1,4 s, sondage ciblé **+44 à +275 ms**, le même sondage appliqué à toutes les
  pages **+3,4 à +3,6 s**. Le parser déjà chargé est réutilisé, le document n'est
  pas relu.
- **Surface, pas côté.** Une image compte à partir de 240 × 240 px de *surface*.
  Le filtre intégré de `pdf-parse` compare chaque dimension au seuil séparément
  et laisserait donc échapper une bande scannée large et basse ; il est désactivé
  (`imageThreshold: 0`) et la décision est prise sur la surface.
- **L'indécidable n'est pas l'absence.** Une page non sondée, ou un sondage en
  échec, ne vaut pas « aucune image » : la page reste classée dégradée, et le
  document porte `image-probe-failed` pour le dire.

Le ratio alphanumérique faible n'est jamais reclassé : il constate un texte déjà
abîmé, qu'aucune absence d'image ne rend fidèle. **Il est donc évalué avant la
longueur, et non après** : un texte court peut être abîmé, et c'est alors le
défaut abîmé qui l'emporte. Tant que les deux défauts menaient au même refus
l'ordre était sans effet ; depuis qu'un texte court peut être déclaré fidèle sur
preuve d'absence d'image, trancher sur la longueur en premier ferait passer pour
un formulaire vierge une page réduite à de la ponctuation et des traits.

### Gravité des constats

`ContentIssue` porte désormais une gravité facultative. `informational` désigne
un constat exact qui ne retire rien au texte extrait ; son absence vaut
`blocking`, si bien qu'un artefact écrit avant l'introduction du champ garde son
interprétation prudente et qu'un code ajouté demain bloque par défaut plutôt que
de passer inaperçu. Seuls les constats bloquants mettent un document en
`needs-review` et marquent une page `degraded` à l'entrée du corpus.

Un reclassement n'est jamais silencieux : la page conserve son constat dans
l'artefact, `content:extract` le liste sous « Signalé sans bloquer », et
`content:validate` le remonte en avertissement **quel que soit** le statut du
document — sans quoi il disparaîtrait de la porte de qualité au moment précis où
il fait passer le document en `extracted`.

Effet mesuré sur le pack : trois documents en `needs-review` avant, deux après —
« Les emprunts obligataires - Mise en situation » redevient publiable, les deux
documents « Les titres » restent retenus par leurs pages réellement rastérisées.

## Workflow éditorial

Ces portes-ci contrôlent les **sources**. Les contenus *générés* à partir
d'elles ont leurs propres portes et leur propre machine à états, portées par
`@finance/content-generation` :

```text
draft → validation_failed → draft
      ↘ needs_review → approved
                     ↘ rejected → draft
```

Il n'existe pas d'état « publié » : son absence rend la publication accidentelle
impossible plutôt que simplement interdite. Voir
`docs/content-review-workflow.md` et `docs/content-validation-rules.md`.

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
