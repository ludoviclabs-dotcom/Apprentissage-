# Versionnement normatif des contenus

Un plan comptable n'est pas une vérité intemporelle : c'est un texte daté. Un
contenu pédagogique qui enregistre une opération est donc vrai *selon un
référentiel*, et faux selon un autre. Ce document décrit comment le système le
dit, le contrôle et l'applique.

## Le problème, en un exemple

Les frais d'émission d'un emprunt obligataire ont deux traitements.

| | Support d'origine | Plan comptable général au 1er janvier 2026 |
| --- | --- | --- |
| Frais étalés | 4816 (subdivision) | 481 |
| Virement | 791 « Transferts de charges d'exploitation » | *aucun* — 481 est débité à l'engagement |
| Dotation | 6812 | 6862 |

Chacun est cohérent **dans son millésime**. Ce qui ne l'est pas :

- les additionner (481 avec 791, 6862 avec 6812) ;
- noter un apprenant d'aujourd'hui sur celui d'hier ;
- présenter 4816 ou 4671 comme des comptes prescrits par le plan officiel.

## `normativeContext`

L'objet est porté par l'**enveloppe** du brouillon, à côté de
`generationMetadata` et `validationMetadata` — jamais par `content`. Un contexte
normatif ne se rédige pas : il se constate en lisant les comptes employés, puis
il est décidé à la revue. Le placer dans le contenu en aurait fait un champ que
le générateur remplit, donc un champ qu'il peut se tromper à remplir, et dont
l'erreur passerait pour une donnée.

```ts
{
  profile: "anc-2026-current" | "course-original" | "entity-specific",
  status: "current" | "legacy" | "custom",
  effectiveFrom?: string,
  effectiveTo?: string,
  scoringPolicy: "graded" | "comparison-only" | "not-gradable",
  sourceVersionIds: string[],
  supersededByProfile?: NormativeProfile,
  customAccountDisclosures: Array<{
    accountNumber: string;
    parentAccount: string;
    source: "course" | "entity-plan";
    label: string;
  }>,
  versionConflictNotes: Array<{
    code: string;
    severity: "info" | "warning" | "blocking";
    message: string;
    sourceIds: string[];
  }>
}
```

Aucune table n'a été créée pour lui : il vit dans l'enveloppe du brouillon, il
est recopié dans l'instantané publié (`normativeContextSnapshot`), et l'index de
publication en retient les deux champs dont les écrans ont besoin sans ouvrir un
instantané — le profil et la politique de notation.

**Il est facultatif, et il ne le restera pas.** Les contenus écrits avant lui ne
le portent pas ; les invalider en bloc aurait fait basculer un chapitre entier en
`validation_failed` sans qu'un humain ait rien arbitré. Son absence produit donc
un avertissement (`contexte-normatif-absent`) dès qu'un compte versionné
apparaît — mais la **publication** la refuse : servir un contenu sans savoir
selon quel plan comptable il est vrai n'est pas une option.

## Les trois profils

### `anc-2026-current`

Le référentiel du parcours public, et le seul sur lequel un apprenant est noté.

- `status: "current"` ;
- `scoringPolicy` : `graded` pour un exercice, `not-gradable` pour une fiche —
  jamais `comparison-only`, qui est la voie de ce qui n'est plus applicable ;
- refuse 791, 6812, 16883 **dans un champ typé** — carte des comptes,
  chronologie, ligne d'écriture, comptes requis : c'est là qu'un compte devient
  la réponse. Les *nommer en prose* reste possible, et c'est ce qui permet
  d'écrire un encart comparatif ; il faut alors déclarer la divergence ;
- refuse une subdivision qui **double** un compte officiel — 4816 porte
  l'intitulé exact de 481 — mais admet une subdivision déclarée qui nomme un
  usage que le plan ne nomme pas, comme 4671 sous 467 ;
- exige au moins une source `official-reference` : se déclarer du plan en vigueur
  en ne citant que le support revient à affirmer que le support *est* le plan.

### `course-original`

Le traitement du support, conservé fidèlement.

- `status: "legacy"`, `scoringPolicy: "comparison-only"` ;
- ne corrige aucune tentative, n'entre dans aucun score, n'est jamais placé dans
  la file de répétition espacée ;
- s'affiche avec la mention explicite qu'il s'agit du traitement d'origine ;
- exige au moins une `versionConflictNotes` : présenter l'ancien traitement sans
  avertissement le ferait passer pour toujours applicable.

### `entity-specific`

Une subdivision propre à une entité ou à un exercice.

- `status: "custom"` ;
- le compte parent officiel et la source de la subdivision sont obligatoires ;
- le compte n'est jamais présenté comme obligatoire.

## Comptes versionnés

`packages/content-generation/src/validation/normative-accounts.ts` porte une
liste **fermée** : exactement les comptes sur lesquels le support et le plan 2026
divergent, plus ceux que le support subdivise sans le dire. Un compte absent de
cette table est hors périmètre, et le validateur le laisse passer sans rien en
dire — prétendre arbitrer les milliers de numéros du PCG depuis du TypeScript
reviendrait à le réécrire.

| Compte | Nature | Règle |
| --- | --- | --- |
| 481 | officiel courant | frais d'émission étalés |
| 6862 | officiel courant | dotation de l'étalement |
| 6272 | officiel courant | frais retenus, charge de l'exercice |
| 512 | officiel courant | exige une source `official-reference` : son intitulé vient du plan de comptes, pas du support |
| 467 | officiel courant | parent de 4671 et 4672 |
| 4816 | subdivision, double 481 | à déclarer avec `parentAccount: "481"` ; refusé dans le profil courant, où 481 tient ce rôle |
| 4671, 4672 | subdivision | à déclarer avec `parentAccount: "467"` ; admise dans tous les profils une fois déclarée |
| 791 | remplacé | jamais dans le profil courant ; divergence à marquer |
| 6812 | remplacé par 6862 | conservé dans le seul support d'origine |
| 16883 | remplacé par 1638 | même constat, même traitement |

Le relevé des comptes distingue les champs **typés** (lignes d'écriture, comptes
requis, carte des comptes), qui font foi, des **textes**, qui ne servent qu'à
repérer un traitement décrit en prose. Les refus s'appuient sur les premiers.

## Refus des réponses hybrides

Code de validation : **`normative-profile-mismatch`**, bloquant.

Un seul code couvre tous les mélanges, parce que le relecteur n'a pas besoin de
dix codes pour une seule question — « ce contenu dit-il vrai selon un seul
référentiel, et lequel ? ». Sont refusés :

1. 481 (plan en vigueur) avec 791 (virement historique), **dans des champs
   typés** ;
2. 6862 et 6812 pour la même dotation, **dans des champs typés** ;
3. un contenu `anc-2026-current` qui ne cite aucune référence officielle ;
4. un contenu **noté** dont la réponse attendue emploie un compte remplacé ;
5. un contenu qui emploie un compte remplacé sans note de divergence ;
6. un profil dont le statut ou la politique de notation le contredit.

Les points 1 et 2 sont refusés **même sans référentiel déclaré** : additionner
deux mécanismes qui se remplacent est faux quel que soit le plan qu'on invoque.
4816 avec 791, en revanche, n'est *pas* un mélange — c'est le traitement
historique cohérent.

Un mélange est une **écriture** qui additionne deux mécanismes, pas une phrase
qui les compare. Le contrôle porte donc sur les champs typés : l'appliquer à la
prose aurait rendu impossible d'écrire ce qui a changé, alors que le comprendre
fait partie de ce qu'un apprenant doit savoir.

Codes voisins, pour ce qui n'est pas un mélange :

- `compte-personnalise-non-declare` — une subdivision employée sans déclaration,
  ou déclarée sans être employée ;
- `subdivision-parent-errone` — un parent déclaré qui n'est pas le bon ;
- `compte-officiel-non-source` — le compte 512 sans référence officielle ;
- `contexte-normatif-absent` — avertissement à la validation, refus à la
  publication.

## Conséquences publiques

- `anc-2026-current` est le profil par défaut ; une version publiée avant ce
  champ est lue comme telle, ce qui était son comportement implicite.
- La file de répétition espacée et l'entraînement ne chargent que des versions
  `graded` ; les contenus `comparison-only` sont livrés séparément, pour un
  encart comparatif facultatif.
- La route d'activité **refuse** (409) de corriger, d'enregistrer ou de planifier
  un contenu non noté. C'est là que la règle devient vraie : un écran qui filtre
  est une convention, qu'un identifiant recopié dans une requête contourne.
- Les DTO publics ne portent ni `versionConflictNotes` ni `sourceVersionIds` :
  ce sont des raisonnements de relecteur. Les sous-comptes déclarés n'y sont pas
  non plus **avant la tentative** — un énoncé d'écriture est projeté sans ses
  comptes requis, et les publier dans le contexte les redonnerait par la bande.
  Ils voyagent avec ce qui est déjà visible : la fiche, le verso révélé, la
  correction rendue.

## Persistance

Le référentiel doit survivre à la publication, et il doit y survivre **par les
deux magasins**. Le site public ne lit que des instantanés : si la couche de
stockage perd le contexte, aucune page ne peut plus savoir si elle a le droit de
noter.

### Ce qui était perdu

`published_content_versions` n'avait pas de colonne pour lui. L'écriture le
laissait tomber, la lecture ne pouvait pas le retrouver, et
`resolveNormativeContext` — dont le défaut est *le référentiel en vigueur* —
rendait courante et notable une carte publiée « support d'origine, comparaison
seule ». Elle serait entrée dans la file de révision espacée et aurait corrigé un
apprenant sur un traitement remplacé. Le défaut par défaut : correct pour une
ligne qui n'a jamais eu de contexte, exactement faux pour une ligne qui en avait
un et l'a perdu en transit.

### Trois colonnes, une seule dérivation

La migration `0015_published_normative_context.sql` ajoute :

| Colonne | Rôle |
| --- | --- |
| `normative_context_snapshot` (JSONB) | le contexte entier, recopié comme le reste de l'instantané |
| `normative_profile` (TEXT) | dérivé, pour répondre sans ouvrir le JSONB |
| `scoring_policy` (TEXT) | dérivé, même raison |

Les deux colonnes dérivées existent parce que « qu'y a-t-il de publié ici, et
qu'a-t-on le droit de noter ? » est la question de chaque écran de chapitre :
la poser au JSONB reviendrait à tirer un instantané par ligne, ce que la requête
de résumé existe précisément pour éviter. L'index du magasin de fichiers porte
les deux mêmes champs, et `storedNormativeFields` les dérive **une seule fois**
pour les deux magasins : les calculer chacun de son côté aurait créé deux
définitions du même fait, donc tôt ou tard deux réponses.

### Les lignes antérieures restent nulles

Aucune reprise de données. Réécrire le contexte des anciennes lignes
reviendrait à affirmer un référentiel que personne n'a relu, et à le faire en
silence — exactement le geste que ce modèle existe pour empêcher. `NULL` dit
« non établi » ; la lecture le traite comme le référentiel en vigueur, ce que la
ligne signifiait quand elle a été écrite.

Une contrainte exige en revanche que les trois colonnes s'accordent sur ce
qu'elles savent : toutes nulles, ou toutes renseignées.

### Ce qui interdit une nouvelle publication muette

La colonne ne peut pas être `NOT NULL` sans casser les publications
historiques ; une contrainte SQL ne saurait pas distinguer une ancienne ligne
d'une nouvelle. Le refus vit donc là où la décision se prend, dans le garde de
publication, qui appelle `checkPublishableNormativeContext` — la même fonction
pour les deux magasins. Sont refusés :

- une publication sans contexte normatif ;
- un profil `anc-2026-current` qui ne nomme aucune version de référentiel ;
- un profil historique déclaré notable (déjà couvert par la cohérence de profil) ;
- un mode de génération hors liste blanche.

### Ce que les tests prouvent, et ce qu'ils ne prouvent pas

- `packages/db/test/migration-0015.test.ts` — le *texte* de la migration :
  idempotence, absence de destruction, nullabilité, valeurs admises.
- `apps/web/test/publication-normative-persistence.test.ts` — la
  *correspondance* : brouillon → instantané → colonnes → `versionFromRow` →
  projection publique, sur les trois profils. C'est là qu'un champ se perd.
- `packages/db/test/normative-persistence.integration.test.ts` — le *moteur* :
  migrations rejouées depuis zéro deux fois, contraintes qui refusent, rollback
  transactionnel. Il exige `RLS_TEST_ADMIN_DATABASE_URL` et **se saute
  bruyamment** sans base.

Aucun de ces tests ne remplace le suivant. Tant que le troisième n'a pas tourné
sur un vrai PostgreSQL, la migration n'a pas été appliquée — elle a été écrite.

## Classement des contenus existants

```bash
corepack pnpm content:classify-normative --chapter "Emprunts obligataires" --source-pack compta-approfondie
```

La commande inspecte les comptes employés, propose un `normativeContext`, rejoue
les contrôles avec la proposition et écrit un rapport local ignoré sous
`data/generated/review/`. Elle **ne réécrit aucune réponse attendue** : remplacer
791 par 481 dans une écriture changerait son nombre de lignes, ses montants et
son barème — ce serait réécrire l'exercice, pas le classer.

Par défaut elle n'écrit que le rapport. `--apply` pose en plus le référentiel
proposé, ajuste le statut (`needs_review`, ou `validation_failed` pour ce qui
reste en défaut une fois classé), incrémente la révision et trace la transition —
après avoir conservé l'état antérieur de chaque brouillon sous
`data/generated/checkpoints/normative-pre-apply/`. Un contenu **approuvé** n'est
jamais touché : il porte une signature humaine.

## Référentiel ANC

L'ANC publie **deux** documents pour le millésime 2026, et ils ne disent pas la
même chose :

1. le **Plan comptable général** (règlement 2014-03, version consolidée) — le
   texte du règlement et les mécanismes comptables ;
2. le **Plan de comptes** — la nomenclature officielle et les intitulés.

Ils sont enregistrés comme deux documents distincts, avec deux identifiants
distincts. Les confondre revient à sourcer un intitulé de compte dans un document
qui ne le porte pas.

### Un référentiel n'appartient à aucun chapitre

Le plan comptable vaut pour les emprunts obligataires comme pour les contrats à
long terme : il vit dans son propre pack d'import. `loadCorpusWithReferences`
réunit donc, pour un chapitre donné, le pack du contenu **et** tout pack
entièrement composé de documents de référence. Sans cette réunion, un contenu
qui citait le PCG était refusé pour « document inconnu », et l'exigence d'une
source officielle dans le profil en vigueur était intenable.

Les packs de chapitres restent étanches entre eux : le critère est « tous les
documents sont des références », et non « au moins un », faute de quoi un
chapitre aurait pu citer le cours d'un autre sans que rien ne le signale.
