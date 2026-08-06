# Contrôles déterministes des contenus générés

Ce que le moteur vérifie sur chaque contenu produit, avant qu'un humain puisse
seulement le lire dans la file de revue. Implémentation :
`packages/content-generation/src/validation/engine.ts`, avec les vérifications de
références dans `types/source-reference.ts` et les calculs dans
`calc/templates.ts`.

Le moteur **ne corrige jamais : il constate.** Un résultat numérique qui diverge
du recalcul est signalé avec l'écart exact, pas remplacé par la bonne valeur —
une correction silencieuse masquerait le fait que le générateur s'est trompé, et
c'est précisément l'information qu'un relecteur doit avoir.

Version courante des contrôles : `content-validation.v1`
(`VALIDATION_VERSION`), inscrite dans les métadonnées de chaque brouillon.

## Erreur ou avertissement

| | Erreur | Avertissement |
| --- | --- | --- |
| Effet sur le statut | `validation_failed` | aucun |
| Approbation | impossible | possible |
| Visible dans l'interface | oui, section « Erreurs » | oui, section « Avertissements » |
| Coût sur le score | −25 | −5 |

`passed` vaut `true` si et seulement si la liste d'erreurs est vide. C'est cette
valeur, et elle seule, qui autorise le bouton « Approuver ».

## Contrôles communs à tous les types

### Erreurs bloquantes

| Code | Règle |
| --- | --- |
| `schema-invalide` | Le contenu ne respecte pas son schéma Zod (`contentPayloadSchema`, union discriminée par `contentType`). Une erreur par problème de schéma, avec son chemin. **Le contrôle s'arrête là** : score 0, motif unique « le contenu ne respecte pas son schéma ». Inutile de recalculer un exercice dont les champs n'ont pas la bonne forme. |
| `chemin-absolu` | Le contenu comporte un chemin de fichier absolu (`C:\…`, `/home/…`, `/Users/…`, UNC `\\serveur\`). Les sources privées ne doivent jamais atteindre le navigateur. |
| `secret-detecte` | Le contenu comporte ce qui ressemble à une clé ou un jeton (`sk-…`, `api_key = …`, `Bearer …`). |
| `aucune-source` | Le contenu ne cite aucune source. Les références sont collectées récursivement, à tous les niveaux — une fiche cite au niveau de chaque règle, de chaque compte, de chaque formule ; un mini-cas au niveau de chaque étape. |
| `source-malformee` | Une référence ne passe pas `sourceReferenceSchema` : page inférieure à 1, intervalle décroissant, aucun `chunkId`, `excerptHash` qui n'est pas un SHA-256 hexadécimal, extrait de plus de 1 200 caractères. |

### Vérification des références contre le corpus

Le schéma ne prouve rien : il garantit la forme. C'est `verifyReference` qui
prouve l'existence, en confrontant chaque référence au corpus réellement extrait
(`CorpusIndex`, construit depuis `data/extracted/`).

| Code | Sévérité | Règle |
| --- | --- | --- |
| `document-inconnu` | erreur | Le `documentId` cité n'existe pas dans le corpus extrait. |
| `page-inexistante` | erreur | Une page de l'intervalle cité n'existe pas dans ce document. Le message rappelle le nombre de pages disponibles. |
| `chunk-inconnu` | erreur | Le fragment cité n'appartient pas au document cité. |
| `chunk-hors-intervalle` | erreur | Le fragment cité couvre des pages hors de l'intervalle annoncé par la référence. |
| `hash-divergent` | erreur | L'`excerptHash` ne correspond à aucun des fragments référencés : la source a changé depuis la génération. Le message le dit — **régénérer le contenu plutôt que le corriger**. |
| `page-degradee` | avertissement **bloquant à l'approbation** | La page citée existe, mais son extraction est dégradée. La référence est exacte ; c'est le matériau qui est douteux. Le contenu reste modifiable et relisable, mais `approveDraft` le refuse en 409 : le texte qui l'étaye est justement celui dont on sait qu'il est incomplet. Citer une autre page, ou corriger la source et ré-extraire. |

Une référence peut citer plusieurs fragments d'un même document ; l'extrait, lui,
ne provient que de l'un d'eux. Le hash doit donc correspondre à **un** des
fragments référencés, pas à tous.

## Fiche de révision

Une fiche n'a que des avertissements propres : ses champs facultatifs peuvent
être vides *uniquement* parce que les sources ne permettent pas de les
renseigner. Mieux vaut une fiche honnêtement incomplète qu'une fiche complétée de
mémoire — mais jamais en silence.

| Code | Sévérité | Règle |
| --- | --- | --- |
| `carte-comptes-vide` | avertissement | Aucun compte relevé — vérifier que les sources n'en citent pas. |
| `formules-vides` | avertissement | Aucune formule relevée. |
| `chronologie-vide` | avertissement | Aucune étape de chronologie relevée. |
| `erreurs-frequentes-vides` | avertissement | Aucune erreur fréquente relevée. |
| `exemple-incomplet` | avertissement | L'exemple résolu ne comporte pas d'étape `data` ou pas d'étape `result`. Un exemple sans données ni résultat n'est pas un exemple. |

Le reste est tenu par le schéma : au moins une règle essentielle (« une fiche sans
règle essentielle n'enseigne rien »), au moins une question de rappel, au moins
trois étapes dans l'exemple résolu, un numéro de compte au format PCG (2 à
8 chiffres), et une référence de source sur *chaque* règle, compte, formule et
étape.

## Flashcards

| Code | Sévérité | Règle |
| --- | --- | --- |
| `carte-non-atomique` | erreur | Deux déclenchements distincts : la carte **déclare** tester plus d'une connaissance (`atomicityCheck.testedFactCount > 1` ou `singleFocus` faux) ; ou le recto pose plus d'un « ? ». Le second est une contre-vérification indépendante de ce que le générateur a annoncé. |
| `reponse-dans-question` | erreur | Le verso n'apporte **aucun** terme absent du recto : la question contient déjà sa réponse. |
| `recto-verso-identiques` | erreur | Recto et verso identiques après normalisation. |
| `doublon-exact` | erreur | Une carte de même recto *et* même verso existe déjà parmi les contenus retenus. |
| `recouvrement-fort` | avertissement | Le recto reprend au moins **70 %** des mots significatifs du verso, sans pour autant l'épuiser. La question guide peut-être trop. |
| `doublon-probable` | avertissement | Le recto partage au moins **85 %** de ses mots avec celui d'une autre carte (similarité de Jaccard). |
| `type-incoherent` | avertissement | Carte de type `formula` dont le verso ne comporte aucune expression (`= + − × / *`) ; ou carte de type `account` sans numéro de compte. |

### Pourquoi deux mesures de fuite plutôt qu'une

Le seul ratio ne suffisait pas. « Quel compte reçoit les intérêts courus ? » /
« Le compte 16883 » partage la plupart de ses mots avec sa question tout en
apportant la seule chose qui compte, le numéro de compte. Le critère bloquant est
donc **qualitatif** — le verso n'apporte-t-il *rien* de nouveau ? — et le ratio
n'est qu'un signal. Les nombres sont traités comme des termes à part entière :
c'est souvent eux qui portent la réponse en comptabilité.

### Portée de la détection de doublons

Une carte n'est comparée qu'aux contenus **retenus** : ceux qui ont déjà passé
les contrôles au cours de la même exécution, plus ceux qui existaient déjà sur
disque en statut autre que `validation_failed` ou `rejected`. Un contenu déjà en
échec ne doit pas faire échouer son voisin.

## Exercices de calcul

| Code | Sévérité | Règle |
| --- | --- | --- |
| `calcul-impossible` | erreur | Le recalcul a échoué. Le message porte la raison exacte rendue par le registre. |
| `resultat-divergent` | erreur | L'écart entre la réponse annoncée et la réponse recalculée dépasse la tolérance déclarée. Le message donne les deux valeurs, l'écart au dix-millième et la tolérance, et rappelle qu'**aucune correction automatique n'est appliquée**. |
| `entree-incoherente` | erreur | Une entrée du calcul ne vaut pas la même chose que la variable homonyme de l'énoncé. Le message donne les deux valeurs. |
| `bareme-nul` | erreur | Le barème totalise zéro point. |
| `entree-hors-enonce` | avertissement | Une entrée du calcul ne correspond à aucune variable déclarée dans l'énoncé : la donnée sort de nulle part pour l'apprenant. |

Un `formulaTemplateId` absent du registre est refusé **dès le schéma**
(`calculationExerciseSchema`), avec la liste des identifiants autorisés en
message : il ne parvient donc jamais au moteur.

## Écritures comptables

| Code | Sévérité | Règle |
| --- | --- | --- |
| `ecriture-desequilibree` | erreur | Total des débits ≠ total des crédits, après arrondi au centime. |
| `total-declare-faux` | erreur | `expectedTotalDebit` ou `expectedTotalCredit` ne correspond pas à la somme réelle des lignes. Une erreur par total fautif. |
| `compte-requis-absent` | erreur | Un compte listé dans `requiredAccounts` ne figure ni dans les lignes attendues, ni dans `allowedAlternativeAccounts`. |
| `bareme-nul` | erreur | Le barème totalise zéro point. |
| `ligne-dupliquee` | avertissement | Deux lignes identiques (même compte, même débit, même crédit). |

Le schéma tient le reste : au moins deux lignes, un numéro de compte PCG par
ligne, et une ligne qui porte un montant au débit **ou** au crédit, jamais les
deux ni aucun des deux.

## Diagnostics d'erreur

| Code | Sévérité | Règle |
| --- | --- | --- |
| `diagnostic-incoherent` | erreur | La réponse attendue est « aucune erreur » alors que l'écriture proposée ne s'équilibre pas. |

C'est le seul cas réellement contradictoire, et le contrôle s'y limite
délibérément. Une écriture équilibrée peut parfaitement porter un montant faux
(reporté des deux côtés) ou un mauvais compte : l'équilibre ne prouve rien dans
les autres cas, et un contrôle plus large produirait des faux positifs.

Le schéma exige par ailleurs qu'un diagnostic propose soit une réponse, soit une
écriture à examiner ; que la catégorie attendue figure parmi les choix offerts ;
et que ces choix — au moins deux — ne comportent pas de doublon.

## Mini-cas progressifs

| Code | Sévérité | Règle |
| --- | --- | --- |
| `etape-dupliquee` | erreur | Deux étapes portent le même identifiant. |
| `prerequis-inconnu` | erreur | Une étape dépend d'une étape qui n'existe pas. |
| `dependance-circulaire` | erreur | Une étape dépend d'une étape de rang supérieur ou égal au sien. Une étape ne peut dépendre que d'une étape antérieure. |
| `specification-incoherente` | erreur | `answerSpecification.kind` diffère de `exerciseType` : une étape de calcul ne peut pas décrire sa réponse comme une écriture comptable. |
| `ecriture-desequilibree` | erreur | Une étape attend une écriture qui ne s'équilibre pas. |
| `bareme-nul` | erreur | Une étape totalise zéro point. |
| `ordre-non-croissant` | avertissement | Les étapes ne sont pas listées dans l'ordre de leur rang. |
| `indices-dupliques` | avertissement | Une étape porte deux indices de même niveau. |

## Le registre de templates de calcul

`packages/content-generation/src/calc/templates.ts` contient un registre **fermé
et versionné** de calculs autorisés, chacun étant une fonction TypeScript pure.
Le générateur ne peut que désigner un `formulaTemplateId` et fournir des entrées
nommées ; il ne peut pas exprimer une opération arbitraire.

**Pourquoi cela remplace un parseur.** Un parseur sûr laisse au générateur une
surface d'expression, si étroite soit-elle, et cette surface doit être sécurisée,
testée et maintenue. Ici la surface est **nulle** : il n'y a ni `eval`, ni
`Function`, ni exécution dynamique, parce qu'il n'y a rien à parser. Ajouter un
calcul est une modification de code, relue comme telle.

Le dépôt possède par ailleurs un moteur de formules (`packages/domain/src/spreadsheet/`),
mais il est orienté cellules A1 : il sert à noter une grille Excel. Faire transiter
un nominal, un taux et un prorata par des références de cellules rendrait l'énoncé
illisible. Ce moteur reste la solution du lab Excel et n'est pas dupliqué ici.

### Les onze calculs autorisés

Tous en version `v1` ; l'identifiant complet est `<id>.v1`.

| Identifiant | Calcul |
| --- | --- |
| `coupon-annuel-unitaire` | valeur nominale × taux d'intérêt |
| `coupon-annuel-total` | coupon unitaire × nombre d'obligations |
| `prime-remboursement-unitaire` | prix de remboursement − prix d'émission |
| `prime-remboursement-totale` | (prix de remboursement − prix d'émission) × nombre d'obligations |
| `montant-emission-total` | prix d'émission × nombre d'obligations |
| `dette-remboursement-totale` | prix de remboursement × nombre d'obligations |
| `prorata-temporis-mois` | montant annuel × mois écoulés ÷ 12 |
| `interets-courus` | coupon annuel total × mois écoulés ÷ 12 |
| `amortissement-lineaire-periode` | montant à étaler × mois écoulés ÷ durée en mois |
| `amortissement-prorata-interets` | montant à étaler × intérêts courus ÷ intérêts totaux |
| `frais-emission-nets-encaisses` | montant d'émission − frais d'émission |

### Ce que `runTemplate` refuse

Avant d'appeler la fonction de calcul :

- un identifiant absent du registre — le message liste les identifiants
  autorisés ;
- une entrée **non déclarée** par le template : c'est un échec, pas un paramètre
  ignoré silencieusement ;
- une entrée manquante ;
- une valeur non numérique ou infinie ;
- une valeur hors des bornes déclarées (`tauxInteret` entre 0 et 1, `moisEcoules`
  entre 0 et 12, nombre d'obligations positif…).

Et après :

- un échec propre au calcul (`moisEcoules` supérieur à la durée de l'emprunt,
  `interetsCourus` supérieur aux intérêts totaux) ;
- une division par zéro, refusée plutôt que rendue sous forme d'infini ;
- un résultat non fini.

### Arrondi

`applyRounding` accepte quatre règles : `none` (aucun arrondi), `unit` (à
l'unité), `cent` et `two-decimals` (au centime, identiques). L'arrondi au centime
passe par l'entier avant division, pour éviter qu'un flottant comme `1.005`
s'arrondisse vers le bas par accident de représentation.

### Versionner un template

Modifier le comportement d'un template existant impose de publier une `v2` : les
brouillons déjà générés continuent de désigner la `v1` et gardent le sens qu'ils
avaient au moment de leur validation. La règle est celle des prompts — voir
`docs/content-generation-prompts.md`.

## Le score de qualité

```text
score = 100 − (25 × nombre d'erreurs) − (5 × nombre d'avertissements)
        borné à l'intervalle [0, 100]
```

Ce score est **indicatif**. Il sert à trier la file de revue et à filtrer
(`Qualité minimale` dans l'interface), jamais à autoriser une approbation :
celle-ci exige `passed`, c'est-à-dire zéro erreur. Un contenu à 95 avec une
erreur reste inapprouvable ; un contenu à 60 sans erreur est approuvable.

Le schéma le dit dans ses propres termes : « 0 à 100. Indicatif pour trier la
file de revue, jamais un droit à publier. »

## Seuils nommés

Ils sont exportés, pas enfouis dans une condition.

| Constante | Valeur | Ce qu'elle décide |
| --- | --- | --- |
| `MAX_ATOMIC_FACTS` | `1` | Au-delà, une carte teste probablement plus d'une chose. |
| `ANSWER_LEAK_THRESHOLD` | `0.7` | Au-delà, le recto reprend trop du verso — avertissement. |
| `DUPLICATE_SIMILARITY_THRESHOLD` | `0.85` | Au-delà, deux cartes sont des quasi-doublons — avertissement. |

La similarité est une similarité de Jaccard sur les mots, sans dépendance
extérieure : simple, explicable, et suffisante pour repérer deux formulations
quasi identiques. Elle ne prétend pas comprendre le sens, et les contrôles qui
l'utilisent la traitent comme un signal, jamais comme une preuve.

## Aucune correction silencieuse

C'est la règle qui gouverne tout le fichier. Le moteur dispose souvent de la
bonne valeur — il vient de la calculer — et il ne l'écrit pas. Trois exemples :

- un `expectedAnswer` faux est signalé avec l'écart, il n'est pas remplacé ;
- un `expectedTotalDebit` faux est signalé, il n'est pas recalculé en place ;
- une référence dont le hash a divergé n'est pas « rattachée » au fragment le
  plus proche : le message demande de **régénérer**, parce que la source a bougé
  sous le contenu et que personne ne sait plus ce que le générateur avait lu.

Corriger sur place transformerait une erreur de génération en contenu propre, et
ferait disparaître la seule information qui permet de décider si le générateur —
ou le prompt, ou la source — est en cause.

## Rejouer les contrôles

```powershell
corepack pnpm content:validate-generated --chapter "Emprunts obligataires" --source-pack compta-approfondie --verbose
```

La commande met à jour les statuts, liste chaque brouillon avec ses erreurs et
ses avertissements, et sort en code 1 s'il reste un contenu en échec. Depuis
l'interface de revue, le bouton « Relancer la validation » rejoue les mêmes
contrôles sur un seul brouillon.
