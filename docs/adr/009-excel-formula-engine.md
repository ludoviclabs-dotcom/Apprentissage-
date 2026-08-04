# ADR 009 — Un moteur de formules borné pour le lab Excel (PR-12b)

Statut : accepté
Date : 2026-08-04
Remplace en partie : ADR-006 (la décision « aucun moteur » ; le reste de l'ADR-006 tient toujours pour N1/N2)

## Contexte

L'ADR-006 a construit le lab Excel *sans* moteur de calcul, et documentait sa
limite principale en toutes lettres : « un motif ne peut pas reconnaître une
formulation équivalente que son auteur n'a pas anticipée ». Sa section « v2 »
recommandait déjà la sortie : un vrai évaluateur d'expressions sur une grammaire
bornée, et des données perturbées pour distinguer une formule d'un résultat
recopié. PR-12b est cette v2.

Le danger nommé par l'ADR-006 n'a pas disparu : un tableur à moitié
fonctionnel est pire que pas de tableur, parce que le candidat ne sait plus si
l'erreur vient de lui ou de l'outil. La réponse de ce PR n'est pas « faire
Excel », c'est **fermer la grammaire** : tout ce que le moteur accepte est
entièrement spécifié, testé, et affiché ; tout le reste est refusé avec un
message en français et une position.

## Décision

### Un moteur écrit ici, pas une dépendance

`packages/domain/src/spreadsheet/` : tokenizer, parseur descendant,
normalisation, évaluateur, graphe de dépendances. Zéro dépendance npm — le
package `@finance/domain` en avait zéro avant, il en a toujours zéro.

Les alternatives ont été examinées et écartées :

| Option | Licence | Verdict |
|---|---|---|
| HyperFormula | GPLv3 / licence commerciale | incompatible avec ce dépôt privé non-GPL sans achat de licence |
| Luckysheet | MIT mais **archivé** | interdit par le brief, et un moteur mort est une dette |
| formulajs | MIT | une bibliothèque de fonctions, pas un parseur ni un graphe |
| fast-formula-parser | MIT | surface énorme (380+ fonctions) dont il faudrait *retirer* ; la sécurité par soustraction est le mauvais sens |

Écrire ~900 lignes bornées est moins risqué qu'en adopter 50 000 dont il
faudrait désactiver l'essentiel. Et le moteur qui note est le moteur qui
affiche : la grille du navigateur et l'évaluateur serveur exécutent la même
fonction pure, il n'existe pas de deuxième implémentation qui pourrait diverger.

### La grammaire, fermée et en entier

- opérateurs : `+ - * /`, unaires, parenthèses, comparaisons (`= <> < <= > >=`) ;
- références A1, absolues (`$B$2`) ou relatives — mêmes cellules pour le
  graphe, distinction préservée à l'affichage ;
- plages (`B2:B10`, coins normalisés) ;
- sept fonctions : SUM, AVERAGE, MIN, MAX, IF, SUMIF, SUMIFS — et leurs noms
  français SOMME, MOYENNE, MIN, MAX, SI, SOMME.SI, SOMME.SI.ENS, normalisés
  vers une représentation canonique commune au parsing ; `;` et `,` sont le
  même séparateur d'arguments ; le séparateur décimal des formules est le
  point (la virgule serait ambiguë avec le séparateur d'arguments) ;
- erreurs-valeurs : `#DIV/0!`, `#REF!`, `#VALUE!`, `#NAME?`, plus deux erreurs
  propres au moteur : `#CYCLE!` (Excel affiche 0 derrière un avertissement ;
  un 0 silencieux est exactement ce qu'un apprenant ne doit jamais recevoir)
  et `#LIMIT!` (calcul interrompu par le budget — un calcul avorté ne doit
  jamais ressembler à un résultat).

Ce qui n'y est **pas**, volontairement : puissance (`^`), concaténation (`&`),
pourcentage suffixe, jokers dans les critères, LET, RECHERCHEV, dates. Un DCF
s'enseigne sans opérateur puissance : les coefficients d'actualisation sont des
*données* du plan, et leur provenance (1/(1+WACC)^n arrondi) est affirmée par
un test, pas par le moteur.

### Cycles détectés statiquement, recalcul total

Le graphe de dépendances est construit sur le *texte* des formules — les deux
branches d'un SI comprises, comme Excel le signale — et les composantes
fortement connexes (Tarjan itératif) deviennent `#CYCLE!` sur chaque cellule de
la boucle, avec la liste des cellules dans le message. Le recalcul est total à
chaque évaluation : à l'échelle du lab (dizaines de cellules), un recalcul
complet coûte moins d'une milliseconde et supprime toute la classe de bugs
« propagation périmée ». L'ordre d'évaluation est trié ligne-colonne, donc
reproductible à l'octet près.

### Aucune exécution arbitraire — par construction, et par test

Interdits par la grammaire elle-même : il n'existe aucun chemin du texte d'une
formule vers `eval`, `new Function`, le réseau, le système de fichiers ou
l'horloge. Un identifiant hors de la table des sept fonctions vaut `#NAME?`,
point. Les limites sont des constantes nommées (`limits.ts`) : longueur 512,
profondeur 32, 64 arguments, feuille 64×9999, plage 4096 cellules, classeur
2000 cellules, budget de 200 000 pas *comptés* (pas de minuterie murale : le
même classeur est accepté ou refusé identiquement sur toute machine).

`spreadsheet-engine.test.ts` épingle les deux faces : comportementale
(`=EVAL("1")` → `#NAME?`, clé `__proto__` refusée, budget → `#LIMIT!`) et
textuelle — le test lit les sources du moteur et affirme qu'aucune primitive
d'exécution dynamique ou d'E/S n'y apparaît, la même discipline que le test
anti-dérive des CSV : affirmer l'artefact, pas l'intention.

### L'évaluation ne compare plus du texte : `spreadsheet_formula`

Le nouvel évaluateur exécute la formule du candidat, quatre fois plutôt qu'une :

1. **Résultat** (60 %) — la valeur calculée sur les données de l'énoncé ;
2. **Méthode** (40 %) — la formule doit *survivre au changement des données* :
   chaque spec déclare des perturbations (« les ventes passent à 500 000 ») avec
   la valeur qu'une méthode juste produit alors. Un `=600000` en dur passe la
   base et échoue à toutes les perturbations : c'est la définition d'une erreur
   de méthode, sans aucun motif textuel. S'y ajoutent des propriétés de
   structure que la perturbation ne peut pas exprimer : références attendues
   (`requiredRefs: ["B2:B14"]` — la plage, pas ses membres énumérés) ou
   interdites (la ligne de subventions dans un CA), fonctions attendues ou
   interdites.

La couverture est **forcée** : une cellule notée qu'aucune perturbation ne
couvre est un spec invalide — refusé au seed et par les tests, parce qu'un
résultat en dur y passerait inaperçu.

Chaque cellule est notée **en isolation** : pour noter B13 qui lit B12, B12
vaut sa valeur *attendue*, pas celle du candidat. Une erreur en B12 coûte les
points de B12 une fois ; B13 garde les siens si sa propre formule est juste —
le « follow-through » qu'un correcteur humain accorde, et ce qui rend les
attentes sous perturbation définissables.

L'ancien évaluateur `spreadsheet` reste tel quel pour N1/N2 : il note des
résultats saisis, pas des formules exécutées, et ces exercices n'ont pas changé
de contrat.

### Niveaux N3/N4, et ce qu'ils promettent exactement

- **N3 — Données propres, modèles et prévisions** : diagnostic d'un export ERP
  (doublons, montants en texte, casse) présenté comme *diagnostics guidés* —
  ce que Power Query automatise, sans exécuter Power Query ; sommes
  conditionnelles sur les données fiabilisées ; compte de résultat
  prévisionnel ; prévision pilotée par hypothèse ; trésorerie à treize
  semaines ; contrôle de cohérence calculé. LET est présenté en lecture,
  jamais évalué.
- **N4 — Modélisation, DCF et audit** : du résultat au flux disponible, WACC,
  actualisation (coefficients fournis), valeur terminale, échéancier de dette,
  sensibilité, audit de modèle, et lecture d'une macro VBA.

**VBA : affiché, téléchargeable, jamais exécuté.** Le module
`datasets/excel/vba/export_tresorerie.bas` est committé, affiché dans Monaco
Editor en lecture seule, et téléchargeable en Blob local pour un usage dans
Excel sur le poste de l'apprenant. Rien ne l'exécute — ni sur Vercel, ni dans
le navigateur — et les énoncés le disent. Monaco (`monaco-editor`,
`@monaco-editor/react`, tous deux MIT) est **bundlé localement** :
`loader.config({ monaco })` remplace le chargement CDN par défaut, qui aurait
violé le local-first ; un `<pre>` affiche le même code tant que l'éditeur
n'est pas monté, donc le contenu ne dépend jamais de Monaco, seulement sa
coloration.

### La grille du navigateur

`FormulaGridView` exécute `evaluateWorkbook` à chaque frappe (via
`useDeferredValue` — l'écart entre la saisie et l'affichage *est* l'état
« recalcul en cours », annoncé dans une région de statut). Barre de formule
liée à la cellule sélectionnée ; flèches/Entrée/Échap entre cellules
éditables ; cellules données focusables mais protégées ; précédents de la
cellule sélectionnée surlignés ; erreurs affichées par code dans la cellule et
en clair dans la ligne de statut ; référence circulaire annoncée en `alert`
avec la liste des cellules.

### Sauvegarde : un brouillon, pas une tentative

Base active et compte identifié : la grille en cours s'enregistre (débouncé)
dans `lab_workbooks` — une ligne par (user, exercice), RLS complète, migration
0011 — et se restaure à l'ouverture. On stocke les *saisies brutes*, jamais de
valeur calculée : un résultat stocké pourrait contredire ce que le moteur
calcule après une mise à jour de contenu. La notation ne lit jamais cette
table. En mode seedé, la grille repart vide, ce qui est l'état honnête de
cette configuration.

### Deux case studies, sur le modèle PR-12a

`tresorerie-13-semaines` (N3) et `dcf-aster-industrie` (N4) : des étapes qui
*sont* des exercices du niveau, soumises avec `activityContext: "case_study"`,
la dernière étape faisant office de diagnostic du niveau. La règle no-leak des
dossiers compta s'applique : le dossier montre les pièces brutes, jamais un
chiffre qui est la réponse d'une étape (le flux de l'année 1 et le WACC sont
masqués sur la page du dossier Aster ; les tests e2e lisent les octets de la
réponse pour l'affirmer).

## Conséquences

### Limites assumées, à dire à l'utilisateur comme au relecteur

- Sept fonctions. Pas de `^`, `&`, jokers, LET exécuté, dates, formats de
  cellule. Les taux se saisissent en décimal (0,069), les pourcentages
  d'écart en décimal signé.
- Pas de recopie de formule ni de fill-down : les références absolues sont
  acceptées et enseignées, mais leur effet à la recopie est expliqué, pas
  simulé.
- Power Query n'est pas exécuté ; il est enseigné par diagnostics guidés.
- VBA n'est pas exécuté ; il est lu, compris, téléchargé.
- Le moteur borne tout : une formule légitime mais énorme (plage > 4096
  cellules) est refusée avec un message — c'est un choix, la borne est le
  produit.
- `renderSubmission` matérialise toujours chaque cellule dans
  `attempts.user_answer` : le plafond de 40 cellules par soumission demeure.

### Ce que la v2 de cette v2 pourrait ajouter

1. Recopie de formule et plages dynamiques — ce qui donnerait enfin son sens
   opérationnel au `$`.
2. Un treizisme complet en une grille (13 colonnes de positions chaînées),
   qui n'attend que le fill-down.
3. L'import CSV par l'apprenant (ADR-006, point 5, toujours vrai).
4. `#LIMIT!` par cellule plutôt que par recalcul, si un contenu légitime
   approche un jour le budget.
