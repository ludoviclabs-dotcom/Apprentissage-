# Pilote — Les emprunts obligataires

Premier chapitre passé de bout en bout dans la fabrique : sources extraites,
enveloppe construite, contenus générés en mode mock, contrôles rejoués, file de
revue peuplée. Ce document consigne ce qui a réellement été obtenu, et ce que les
sources ne permettaient pas d'obtenir.

Pack `compta-approfondie`, chapitre `les-emprunts-obligataires`, domaine
`compta-generale`.

## Les sources disponibles

| Document | Catégorie | Pages | Fragments | Statut d'extraction |
| --- | --- | --- | --- | --- |
| Les emprunts obligataires — Fiche de cours | `course` | 3 | 9 | `extracted` |
| Les emprunts obligataires — Mise en situation | `exercise` | 7 | 10 | `needs-review` |

Deux constats, tous deux visibles dans les artefacts du pipeline :

- **La page 5 de la mise en situation est dégradée.** Le rapport d'extraction
  porte `degraded-extraction — texte trop court (72 caractères)` sur cette page
  précise. Le fragment existe, mais il ne contient presque rien.
- **Il n'y a pas de corrigé.** `content:pair` le signale :
  `exercice-sans-corrige — aucun corrigé rapproché pour Les emprunts obligataires -
  Mise en situation.pdf`.

### Ce que l'absence de corrigé implique

Ce n'est pas un défaut à corriger, c'est une contrainte à respecter : **aucune
réponse attendue ne peut être recopiée d'un corrigé qui n'existe pas.** Les
réponses des exercices générés sont donc, sans exception :

- soit **recalculées par le code** à partir des données présentes dans l'énoncé
  source, via le registre fermé de templates de calcul ;
- soit absentes — l'élément n'est pas produit.

C'est ce que fait la construction des fixtures : chaque élément cherche son
fragment d'appui dans l'enveloppe et s'omet si ce fragment est introuvable. Sans
les données chiffrées de la mise en situation, aucun exercice de calcul n'est
produit du tout ; sans la fiche de cours, aucune fiche de révision. Pas de
source, pas de contenu.

## L'enveloppe transmise

```text
Sources sélectionnées :
  - Les emprunts obligataires - Fiche de cours [course] 3 pages, 9 fragments
  - Les emprunts obligataires - Mise en situation [exercise] 7 pages, 10 fragments — pages dégradées : 5

Caractères transmis : 16068 / 60000
```

Aucun fragment exclu : le chapitre entier tient largement sous le plafond de
60 000 caractères. La fiche de cours passe en premier, conformément à l'ordre de
priorité par catégorie, et la page dégradée est signalée au générateur dans
l'enveloppe elle-même.

## Ce qui a été produit

Génération en mode `mock`, puis rapport de couverture.

| Type | Produits | Exploitables | Repère indicatif |
| --- | --- | --- | --- |
| Fiche de révision | 1 | 1 | 1 |
| Flashcards | 15 | 15 | 8 – 15 |
| Exercices de calcul | 4 | 4 | 3 – 5 |
| Écritures comptables | 2 | 2 | 2 – 4 |
| Diagnostics d'erreur | 2 | 2 | 2 – 4 |
| Mini-cas progressif | 1 | 1 | 1 |
| **Total** | **25** | **25** | |

**Les 25 brouillons sont en `needs_review`.** Aucun en `validation_failed`, aucun
en `approved` — un contenu ne peut pas naître approuvé.

Un seul avertissement sur l'ensemble :

```text
⚠ Quel compte reçoit les intérêts courus non échus d'un emprunt obligataire ?
  — le recto reprend 75 % des mots du verso — vérifier que la question ne guide pas trop
```

C'est exactement le comportement voulu par le contrôle de fuite de réponse : le
recto reprend « compte », « intérêts », « courus », mais le verso apporte le seul
élément qui compte, le numéro `16883`. Le moteur signale, il ne bloque pas.

### Ce que les brouillons citent

Les 25 brouillons s'appuient sur sept références distinctes :

| Document | Pages citées | Notions |
| --- | --- | --- |
| Fiche de cours | 1 | conditions d'émission, valeur nominale, prix d'émission |
| Fiche de cours | 2 | coupon et modalités de remboursement, comptes de l'écriture d'émission (`163`, `4671`, `169`), intérêts courus (`16883`) |
| Fiche de cours | 3 | amortissement de la prime (`6861`), frais d'émission (`4816`, `6812`, `6272`) |
| Mise en situation | 1 | données chiffrées du cas CSP |

Les comptes de l'écriture d'émission sont répartis sur deux fragments voisins de
la page 2 : la référence couvre les deux plutôt que d'en citer un seul, parce
qu'une citation partielle serait trompeuse.

**Aucun brouillon ne cite la page 5 de la mise en situation.** Une citation de
cette page ne serait pas refusée par le moteur — elle produirait un avertissement
`page-degradee`, visible du relecteur avant sa décision — mais le cas ne s'est
pas présenté : les fixtures cherchent leurs ancres dans les fragments qui portent
réellement les notions visées, et cette page n'en porte aucune.

## Le cas CSP

Données réellement présentes dans la mise en situation, et reprises telles quelles
dans les énoncés générés :

| Donnée | Valeur |
| --- | --- |
| Nombre d'obligations | 8 000 |
| Valeur nominale | 1 000 € |
| Prix d'émission | 996 € |
| Prix de remboursement | 1 006 € |
| Coupon annuel unitaire | 90 € |
| Frais d'émission | 100 000 € HT |
| Remboursement | 8 séries annuelles, soit 96 mois |
| Date d'émission | 01/09/N, clôture au 31/12/N — 4 mois écoulés |

### Montants recalculés par le code

Aucun de ces montants n'est écrit à la main dans un énoncé : chacun est le
résultat d'un template du registre, appliqué aux données ci-dessus, et recalculé
une seconde fois par le moteur de validation au moment du contrôle.

| Montant | Template | Résultat |
| --- | --- | --- |
| Prime de remboursement totale | `prime-remboursement-totale.v1` | **80 000 €** |
| Montant encaissé à l'émission | `montant-emission-total.v1` | **7 968 000 €** |
| Dette inscrite au passif (compte `163`) | `dette-remboursement-totale.v1` | **8 048 000 €** |
| Dotation à l'amortissement de la prime au 31/12/N | `amortissement-lineaire-periode.v1` | **3 333,33 €** |

L'écriture de souscription générée s'équilibre sur ces valeurs — débit `4671`
7 968 000 €, débit `169` 80 000 €, crédit `163` 8 048 000 € — et l'équilibre est
recalculé par le moteur, jamais cru sur parole.

Le coupon unitaire de 90 € et les frais d'émission de 100 000 € figurent bien
dans les données du cas, mais aucun exercice généré ne les exploite : le pilote
n'a produit ni calcul d'intérêts courus, ni calcul d'étalement des frais. C'est
une couverture manquante identifiée, pas une donnée perdue.

## Ces contenus sont des fixtures techniques

**Le mode mock ne produit pas du contenu validé.** Il applique des fixtures
destinées à exercer la chaîne complète — génération, validation, stockage, revue
— sans appeler de service externe. Elles restent ancrées sur le corpus réel :
chaque référence est résolue par recherche dans l'enveloppe, chaque montant est
issu d'un template, et tout élément dont la source est introuvable est omis. Mais
elles ont été écrites, pas générées.

Trois endroits le disent, pour qu'on ne puisse pas l'oublier :

- les métadonnées de chaque brouillon portent `mode: "mock"` et le modèle
  `fixture-comptabilite-approfondie.v1` ;
- l'interface de revue affiche une étiquette « Fixture (mock) » sur chaque
  contenu, dans la liste comme sur la fiche ;
- `content:report` termine par un avertissement explicite :
  « Des contenus proviennent de FIXTURES techniques (mode mock), pas d'une
  génération réelle. »

Un chiffre de couverture obtenu en mode mock mesure donc la **chaîne**, pas la
qualité pédagogique d'un générateur.

## Limites du pilote

- **Pas de corrigé, donc aucune réponse recopiée.** Tout ce qui est numérique est
  recalculé ; ce qui ne peut pas l'être n'est pas produit. Un relecteur qui
  cherche à vérifier une réponse doit refaire le calcul, pas le comparer à un
  corrigé — il n'y en a pas.
- **La page 5 n'apporte rien.** 72 caractères extraits : ce qu'elle contenait
  (probablement un tableau ou un visuel) n'est pas récupérable par l'extracteur
  texte. Le contenu qu'elle portait est absent du chapitre généré, et le restera
  tant que l'extraction ne sera pas reprise.
- **Les titres de section sont inexploitables.** Tous les fragments du chapitre
  portent `sectionTitle: "Sans titre"` : les PDF sources n'ont pas de titres
  Markdown. Le numéro de page est le seul repère transmis au générateur, ce qui
  est suffisant mais moins précis qu'un intitulé.
- **Couverture partielle des notions.** Les intérêts courus et l'étalement des
  frais d'émission sont documentés par la fiche de cours et présents dans les
  cartes et la fiche de révision, mais n'ont donné lieu à aucun exercice chiffré.

## Reproduire le pilote

Depuis la racine du dépôt, après `content:scan`, `content:extract`,
`content:pair` et `content:validate` sur le pack (voir
`docs/content-generation.md` pour l'enchaînement complet).

```powershell
corepack pnpm content:generate --chapter "Emprunts obligataires" --source-pack compta-approfondie --dry-run
```

```powershell
corepack pnpm content:generate --chapter "Emprunts obligataires" --source-pack compta-approfondie --mode mock
```

```powershell
corepack pnpm content:validate-generated --chapter "Emprunts obligataires" --source-pack compta-approfondie --verbose
```

```powershell
corepack pnpm content:report --chapter "Emprunts obligataires" --source-pack compta-approfondie
```

Les brouillons sont écrits sous
`data/generated/drafts/compta-approfondie/les-emprunts-obligataires/`, git-ignoré.
Aucun n'est publié : la publication n'existe pas dans ce lot.
