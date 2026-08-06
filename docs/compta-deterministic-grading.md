# Notation déterministe des contenus publiés

Aucune activité publiée n'est notée par un modèle. Tout passe par les
évaluateurs typés de `packages/domain/src/evaluators/`, introduits en PR-03 et
réutilisés tels quels : un second moteur, même « juste pour les contenus
générés », voudrait dire deux définitions de « l'écriture est juste » et donc,
tôt ou tard, deux réponses.

`packages/content-publication/src/grading.ts` ne fait que traduire un instantané
publié en la spécification que ces évaluateurs attendent.

## Pourquoi la notation est serveur

La réponse attendue n'atteint jamais le navigateur avant la tentative — voir les
projections publiques de `src/public/projection.ts`. Elle ne pouvait donc pas y
être comparée. Trois conséquences :

- deux apprenants obtiennent la même correction pour la même réponse ;
- un apprenant ne peut pas lire la réponse dans le source de la page ;
- un test peut recalculer une note sans navigateur.

Un test d'étanchéité (`apps/web/test/compta-approfondie.test.ts`) vérifie
qu'aucun composant de `components/compta-approfondie/` n'**importe** un grader.

## Exercice de calcul

`numericEvaluator`, avec `toleranceAbs` = la tolérance de l'énoncé.

La saisie est parsée par `parseNumericAnswer` : virgule décimale et espaces de
milliers acceptés, `12,5 %` refusé plutôt que coercé.

Cinq issues distinctes, parce que ce sont cinq remédiations différentes :

| Issue | Détection |
| --- | --- |
| `aucune` | écart ≤ tolérance |
| `non-numerique` | la saisie ne donne aucun nombre |
| `arrondi` | la valeur, une fois la règle d'arrondi de l'énoncé appliquée, tombe dans la tolérance |
| `signe` | la valeur absolue est juste, le signe est inversé |
| `hors-tolerance` | tout le reste |

L'ordre des tests n'est pas indifférent : une réponse juste *avant* arrondi est
une erreur d'arrondi, pas une erreur de calcul, et le dire est la seule chose
utile à en dire.

Le cas `arrondi` n'existe que lorsque la granularité d'arrondi est **plus
grossière que la tolérance**. Un énoncé arrondi au centime avec une tolérance de
0,01 € ne laisse aucun écart qui soit hors tolérance et rattrapé par l'arrondi ;
un énoncé arrondi à l'unité, si.

Une inversion de signe est classée en **erreur de traitement comptable**, pas en
erreur de calcul : inverser un débit et un crédit n'est pas une faute
d'arithmétique.

## Écriture comptable

`journalEntryEvaluator`, qui vérifie **quatre choses séparément** : comptes
utilisés, sens de chaque ligne, montants, équilibre. L'écriture entière n'est
jamais comparée à une chaîne attendue — cela mettrait au même niveau une
inversion débit/crédit et une faute de frappe.

`allowedAlternativeAccounts` du schéma est réparti en `alsoAccept` sur **chaque**
ligne : « ce plan de comptes emploie 6161 là où le nôtre emploie 616 » vaut
partout où le compte apparaît.

`allowExtraLines: false` — une ligne en trop est une erreur, c'est le double
comptage que le chapitre enseigne à éviter.

### Une écriture déséquilibrée n'est jamais réussie

L'équilibre ne pèse que 2 points sur 13 dans le barème de l'évaluateur : bons
comptes, bon sens et un seul montant faux suffisaient à franchir la barre des
12/20 avec un journal qui ne s'équilibre pas. La note reste celle de
l'évaluateur ; c'est la **réussite** qui exige en plus que le critère `balance`
soit acquis. Cette règle a été ajoutée parce qu'un test l'a mise en défaut, pas
par précaution.

Les totaux affichés pendant la saisie sont une aide, pas un verdict : une
écriture parfaitement équilibrée sur les mauvais comptes reste fausse.

## Diagnostic d'erreur

Noté sur la **seule catégorie** choisie, parmi les neuf du schéma. C'est
déterministe, et c'est tout ce que ce lot prétend savoir évaluer.

La justification libre est enregistrée et rendue à côté de la correction, sans
note. Le schéma d'origine l'annonçait déjà ; l'écran le répète à l'apprenant
plutôt que de laisser croire à une évaluation qui n'existe pas.

## Mini-cas progressif

Chaque étape est notée contre **sa propre** spécification, du type que son
`exerciseType` déclare. Une réponse d'un autre type est refusée plutôt que
convertie.

Une étape `short_answer` n'est **pas notée** : ses `expectedPoints` sont de la
prose, et les comparer à la prose de l'apprenant demanderait la notation libre
que ce lot exclut. Elle est rendue « déposée, corrigée à la lecture », ce que
l'écran annonce.

Les indices sont demandés **un par un** au serveur : `hintCount` voyage avec la
page, leur texte non. Les charger tous d'avance aurait rendu la gradation
décorative.

Une étape s'ouvre quand ses prérequis sont réussis, ou quand l'apprenant décide
de passer la dépendance. Le verrou est pédagogique, pas sécuritaire : l'énoncé
d'une étape ne révèle pas la réponse de la précédente, et interdire le
franchissement aurait bloqué un apprenant coincé sur l'étape 2 d'un cas qui en
compte six.

## Barre de réussite

`ACTIVITY_PASS_SCORE = 12` sur 20, plus la contrainte d'équilibre pour une
écriture. Un échec alimente le carnet d'erreurs et ouvre une remédiation ; voir
`docs/compta-user-progress.md`.

## Tests

```bash
pnpm vitest run packages/content-publication/test/grading.test.ts
```
