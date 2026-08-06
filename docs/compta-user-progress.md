# Progression sur un chapitre publié

La progression est **calculée**, jamais déclarée. Aucune constante de
démonstration, aucun pourcentage d'illustration.
`packages/content-publication/src/progress.ts` est une fonction pure : ni
horloge, ni base, ni hasard. Deux apprenants ayant le même historique voient le
même état, et le calcul est reproductible en test comme il est explicable à
l'apprenant.

## Ce qui compte comme activité

`chapter_activity_events` (migration 0014), sous RLS. Sept types :

| Type | Enregistré quand |
| --- | --- |
| `sheet_viewed` | la fiche est ouverte — **une fois**, dédoublonné côté serveur |
| `active_recall` | une question de rappel actif est traitée |
| `flashcard_reviewed` | une carte due est auto-évaluée |
| `calculation_attempt` | un calcul est soumis |
| `journal_entry_attempt` | une écriture est soumise |
| `diagnosis_attempt` | un diagnostic est soumis |
| `case_step_attempt` | une étape de mini-cas est soumise |

Une activité porte `succeeded` et, quand elle est notée, un score sur 20. Rien
d'autre : le carnet d'erreurs enregistre déjà ce qui a manqué, et dupliquer les
fautes d'un apprenant sur deux tables étalerait de la donnée personnelle sans
rien apporter.

## Les sept dimensions

Chaque type d'activité est une **dimension**, comptée séparément parce qu'elle
correspond à une chose différente que l'apprenant sait faire. Une moyenne les
aurait fondues.

Une dimension pour laquelle le chapitre ne publie **aucune** activité est
neutre : elle ne compte ni comme acquise ni comme manquante. Sans cela, un
chapitre sans mini-cas plafonnerait à six septièmes pour une raison qui ne
regarde pas l'apprenant.

### Ce qu'il faut pour acquérir une dimension

| Dimension | Réussites requises |
| --- | --- |
| Fiche consultée | 1 |
| Rappel actif | 2 |
| Cartes dues traitées | 2 |
| Calculs réussis | 1 |
| Écriture réussie | 1 |
| Diagnostic réussi | 1 |
| Mini-cas terminé | 1 |

Une seule réussite pour les activités notées : une écriture d'emprunt
obligataire réussie est une preuve, la répéter n'en est pas une meilleure. Deux
pour le rappel actif et les cartes, où une réussite isolée peut être un coup de
chance et où la répétition espacée est justement l'outil.

## Les quatre statuts

```
aucune activité                      → Non commencé
au moins un échec non rattrapé       → À revoir
toutes les dimensions disponibles OK → Maîtrisé
sinon                                → En cours
```

**Ouvrir une page n'est pas progresser.** `sheet_viewed` vaut une dimension sur
sept et ne peut à elle seule dépasser « En cours ». Réduire la maîtrise à la
consultation était précisément le reproche fait aux anciens écrans de démo.

« À revoir » l'emporte sur « Maîtrisé » : un chapitre porte d'abord ce qui reste
à reprendre. Un artefact compte comme à revoir tant que sa **dernière** tentative
connue est un échec — compter les échecs bruts ferait qu'une notion ratée puis
maîtrisée resterait à revoir indéfiniment.

## Trois cas jamais confondus

| Cas | Affichage |
| --- | --- |
| visiteur sans compte | « Non commencé » + invitation à se connecter ; la consultation n'est jamais bloquée |
| base indisponible | « Avancement indisponible » — ce n'est pas « non commencé » |
| compte sans activité | « Non commencé », qui est un fait |

## Carnet d'erreurs

Le carnet **existant** (`error_journal`, PR-03) est réutilisé tel quel : il porte
déjà catégorie, résumé, compétences et action suivante, et
`/revisions/carnet-erreurs` sait les afficher. Un second carnet propre au
chapitre aurait donné à l'apprenant deux listes d'erreurs à consulter, ce qui est
une de trop.

Une entrée est identifiée par `<artifactId>:<chapitre>-<catégorie>` : un
deuxième échec sur le même artefact met l'entrée à jour au lieu d'en empiler une
copie. Un exercice raté quatre fois est **une** chose à reprendre, pas quatre.

Rien de sensible n'y entre : ni la réponse saisie, ni de note libre — seulement
quelle notion a manqué et quoi faire ensuite.

### Catégories

Un échec est classé selon les trois natures qu'`AGENTS.md` impose de
distinguer :

| Activité | Catégorie |
| --- | --- |
| calcul hors tolérance ou mal arrondi | `calculation` |
| calcul de signe inversé | `accounting-treatment` |
| écriture fausse | `accounting-treatment` |
| diagnostic manqué | `reasoning` |
| carte non sue | `reasoning` |

## Remédiation

Un échec ouvre **une** tâche de remédiation dans `remediation_tasks` (PR-04),
datée du retest de l'échelle du domaine — un échec vaut `forgotten`, donc un
jour. Choisir une autre date ferait diverger la remédiation de la file de
révision, et l'apprenant croiserait la même notion deux jours de suite pour la
même raison.

Une seule tâche ouverte par (apprenant, artefact) : un troisième échec rafraîchit
la tâche existante.

L'action est **ciblée** — le sens d'une ligne, une règle d'arrondi, la typologie
des erreurs — et jamais « revoir le chapitre ». Renvoyer systématiquement vers
l'ensemble du chapitre est ce que le cahier des charges refuse, et c'est aussi
ce qui décourage de rouvrir le carnet.

## Répétition espacée

`packages/domain/src/review-scheduler.ts`, inchangé. Les quatre
auto-évaluations d'une carte publiée sont les quatre `ReviewRating` du domaine,
et l'intervalle vient de `REVIEW_INTERVAL_DAYS` : 1 / 3 / 7 / 14 jours. Aucun
second algorithme n'a été écrit.

## Mode invité

Sans compte, rien n'est écrit côté serveur, et ce n'est pas une panne : le
contenu public se consulte sans s'identifier ; ce qui exige un compte est la
mémoire de ce qu'on en a fait. Les écritures rendent `false` plutôt que de lever,
l'écran continue de corriger et d'afficher la correction, et il annonce que
l'avancement n'est pas conservé.

Deux états restent purement locaux et sont présentés comme tels : la position
dans une session de cartes, et les règles marquées « comprises » sur la fiche.
Aucun des deux n'alimente la maîtrise.

## Tests

```bash
pnpm vitest run packages/content-publication/test/progress.test.ts
```
