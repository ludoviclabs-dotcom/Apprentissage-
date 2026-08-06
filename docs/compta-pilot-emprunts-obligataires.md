# Pilote public — Emprunts obligataires

Ce document décrit la **publication** du chapitre pilote. Sa génération est
décrite dans `docs/content-pilot-emprunts-obligataires.md`, qui reste valable et
n'est pas repris ici.

## État à la fin de ce lot

La machinerie complète est en place et testée. Le chapitre **n'est pas publié**
dans le dépôt, et ce n'est pas un oubli : deux conditions manquent, toutes deux
par construction.

### 1. Le corpus n'existe que sur le poste qui a extrait

`data/extracted/` est git-ignoré et absent de tout environnement autre que la
machine ayant lancé `content:scan` / `content:extract` sur `content-private/`.
Le garde de publication recharge le corpus et **refuse de publier sans lui** —
ne pas pouvoir vérifier n'est pas vérifier. La publication est donc, par nature,
un acte local.

### 2. Les brouillons du pilote sont en mode `mock`

`docs/content-pilot-emprunts-obligataires.md` le consigne : le pilote a été
généré avec les fixtures, sans appel réseau. Le garde refuse `mode: "mock"`, et
c'est le critère d'acceptation n° 2 du cahier des charges. Publier le pilote
suppose donc de le **régénérer en mode `live`**.

Les deux refus sont couverts par des tests
(`packages/content-publication/test/guard.test.ts`) : ce que ce document décrit
comme un blocage est un comportement vérifié, pas une supposition.

## Ce qui a été validé à la place

La chaîne complète — construction de l'instantané, garde, magasin, index,
archivage, lecture publique, notation, progression — est exercée de bout en bout
par `scripts/seed-published-content.ts`, qui publie six contenus du chapitre
(fiche, carte, calcul, écriture, diagnostic, mini-cas) **par le vrai chemin de
publication**, dans un magasin jetable sous `test-results/`.

Les quatorze specs de `tests/e2e/compta-approfondie.spec.ts` parcourent ensuite
ce chapitre comme un visiteur : les cinq onglets, la révélation d'une carte, sa
notation, un calcul juste et un calcul faux, une écriture déséquilibrée puis
équilibrée, un diagnostic, le verrouillage d'une étape de mini-cas, le panneau
Sources, la progression d'un visiteur sans compte, et le rendu à 390 px.

Ce que cela ne prouve pas : que le contenu **réel** du chapitre est bon. Cela
relève de la relecture humaine, pas d'un test.

## Publier le pilote pour de vrai

Sur la machine qui détient `content-private/` :

```bash
pnpm content:scan
pnpm content:extract
pnpm content:validate
```

Vérifier que le rapport ne signale pas de page dégradée sur les pages que le
chapitre citera — la page 5 de la mise en situation l'était au moment du lot
précédent, et le garde **refuse** un contenu qui s'appuie dessus.

```bash
pnpm content:generate --chapitre "Emprunts obligataires" --mode live
```

Puis, avec `CONTENT_REVIEW_ENABLED=true` :

```bash
pnpm dev
```

Dans `/admin/content-review`, pour chaque contenu :

1. relire l'aperçu à côté du texte source cité ;
2. relancer la validation ;
3. approuver ;
4. section « Publication » → **Publier** ;
5. lire la boîte de confirmation — titre, type, chapitre, version, nombre de
   sources, avertissements, URL cible — puis **Publier maintenant**.

Vérifier ensuite `/modules/comptabilite-approfondie/emprunts-obligataires`, les
cinq onglets, et le panneau Sources.

Enfin, mettre la publication en production :

```bash
git status --short content/published
git add content/published
git commit -m "publish(compta): emprunts obligataires v1"
```

Le commit est délibérément un second geste : tant qu'il n'est pas fait, la
publication est réversible d'un `git checkout`.

## Contrôles avant de commiter

```bash
git ls-files "*.pdf"
git grep -n "C:\\\\Users\\\\" -- content/published
git grep -n "CONTENT_SOURCE_ROOT" -- content/published
pnpm vitest run apps/web/test/compta-approfondie.test.ts
```

Le dernier vérifie, sur le magasin commité : aucun chemin privé, aucun lien de
fichier, aucun extrait de source, aucun secret, et `mode: "live"` sur chaque
version.

## Retour arrière

Voir `docs/content-publication.md`, section « Revenir en arrière » : archiver
depuis l'administration, republier une version antérieure, ou `git revert` sur
le commit de publication. Aucune ancienne version n'est supprimée physiquement.

## Ce que le chapitre proposera

D'après ce que la génération a réellement produit au lot précédent :

| Type | Ce qui est attendu | Onglet |
| --- | --- | --- |
| Fiche de révision | 1 | Comprendre + Fiche 2.0 |
| Flashcards | plusieurs | Réviser |
| Exercices de calcul | plusieurs (prime, coupon, intérêts courus) | S'entraîner |
| Écritures comptables | émission, intérêts, remboursement | S'entraîner |
| Diagnostics d'erreur | plusieurs | S'entraîner |
| Mini-cas progressif | 1 (cas CSP) | S'entraîner |

Le nombre exact dépend de ce que les sources étayent : un élément dont le
fragment d'appui est introuvable est **omis**, jamais inventé. Un chapitre qui ne
produirait qu'une fiche resterait publiable ; les onglets sans contenu affichent
un état vide nommé.
