# Expérience publique — Comptabilité approfondie

Le premier parcours public alimenté par la fabrique éditoriale. Il rend
consultables les contenus **publiés**, et seulement eux.

## Routes

```
/modules                                                        carte du module
/modules/comptabilite-approfondie                               page du parcours
/modules/comptabilite-approfondie/<chapitre>                    chapitre
/modules/comptabilite-approfondie/<chapitre>?section=<onglet>   onglet
```

Sous `/modules`, et non sous un `/apprentissage` parallèle : le cahier des
charges interdit deux systèmes de navigation concurrents, et l'entrée
« Modules » de `apps/web/lib/navigation.ts` existe déjà. Aucune route existante
n'a changé.

Les onglets sont des **paramètres de recherche**, pas un état React : `?section=fiche`
se partage, se recharge et se rend côté serveur. Une section inconnue retombe sur
« Comprendre » plutôt que de produire un 404.

| Onglet | Contenu |
| --- | --- |
| `comprendre` (défaut) | objectif, prérequis, vocabulaire, règles, chronologie, comptes, formules, exemple, erreurs fréquentes |
| `fiche` | la fiche 2.0 complète, imprimable |
| `entrainer` | calculs, écritures, diagnostics, mini-cas |
| `reviser` | flashcards en mode focus |
| `sources` | ce sur quoi le chapitre s'appuie |

## Ce que chaque onglet lit

`lib/publication/chapter.ts` ne charge **que ce que l'onglet demande**.
L'index du magasin suffit à savoir ce que le chapitre propose ; les instantanés
ne sont ouverts que par type. Un chapitre complet — une fiche, quinze cartes,
six exercices, un mini-cas — n'est jamais chargé d'un bloc pour rendre un seul
onglet.

Seul « Sources » ouvre tous les instantanés, et c'est sa raison d'être.

## Comprendre

Chaque section est rendue **si et seulement si** l'instantané la renseigne. Une
chronologie absente donne une section absente, pas une chronologie type. La
tentation inverse est réelle — « un emprunt obligataire comporte toujours une
souscription » — et c'est exactement ce que le cahier des charges interdit :
ajouter une étape que les sources ne portent pas revient à inventer du cours.

Sommaire collant au-delà de 1000 px, sections repliables natives (`<details>`,
donc utilisables sans JavaScript et au clavier), tableaux défilant dans leur
conteneur.

## Fiche 2.0

Onze sections dans l'ordre imposé : objectif, prérequis, règles, comptes,
formules, frise, exemple résolu, erreurs fréquentes, rappel actif, synthèse,
sources.

Interactions : masquer/afficher une réponse de rappel actif, copier une formule,
marquer une règle comme comprise (marque-page **local**, explicitement non
comptabilisé — cocher une case n'est pas une preuve d'apprentissage), lancer les
activités, imprimer.

### Impression

`apps/web/app/styles/print.css`. Elle ne fait pas que masquer : elle **déplie**.
Navigation, onglets, sommaire et boutons disparaissent ; les réponses de rappel
actif apparaissent, parce qu'une fiche papier sur laquelle on ne peut pas cliquer
doit porter ses réponses. Règles, formules, étapes de frise et lignes de tableau
ne se coupent pas entre deux pages, et les en-têtes de tableau se répètent.

**Aucun PDF n'est produit.** `pdf-lib` sert les attestations, dont la mise en
page est fixe et connue ; porter une fiche de longueur variable dessus serait un
lot en soi.

## Flashcards en mode focus

Une carte à la fois. Le **verso n'est pas dans la page** : il est demandé à
`/api/apprentissage/activites` au moment où le lecteur le réclame — la même
règle que `POST /api/revisions/reveal` applique aux cartes du catalogue, et elle
vaut d'autant plus ici que la carte est notée.

Quatre auto-évaluations — Pas su / Partiel / Su / Très facile — qui sont les
quatre `ReviewRating` du domaine. **Aucun second algorithme de répétition
espacée** : l'intervalle affiché vient de `REVIEW_INTERVAL_DAYS`
(1 / 3 / 7 / 14 jours).

Raccourcis : espace pour révéler, 1 à 4 pour noter — ignorés quand le focus est
dans un champ. Le focus revient sur « Afficher la réponse » à chaque carte. Le
changement de carte est annoncé (`aria-live="polite"`). La position est
mémorisée localement, donc une session interrompue se reprend.

## Activités notées

Toutes corrigées **côté serveur**, par les évaluateurs typés du domaine. Aucun
appel de modèle.

| Activité | Évaluateur | Ce qui est vérifié |
| --- | --- | --- |
| Calcul | `numericEvaluator` | valeur, tolérance, arrondi, unité, signe |
| Écriture | `journalEntryEvaluator` | comptes, sens, montants, équilibre — séparément |
| Diagnostic | catégorie seule | la justification libre est enregistrée, jamais notée |
| Mini-cas | selon l'étape | dépendances, indices gradués |

Voir `docs/compta-deterministic-grading.md`.

## Sources publiques

Titre du document, nature (cours / référence officielle / note / énoncé),
section, intervalle de pages, contenus qui la citent.

Jamais : chemin absolu, `CONTENT_SOURCE_ROOT`, nom d'utilisateur, URL Dropbox,
lien vers le PDF, fragment brut. Ce n'est pas un filtrage à l'affichage : le
snapshot **ne contient pas** ces informations, retirées à sa construction. Un
composant ne peut pas divulguer ce qu'il n'a pas reçu.

## États vides et erreurs

| Situation | Réponse |
| --- | --- |
| chapitre inconnu de la taxonomie | 404 |
| chapitre au programme mais rien de publié | 404 |
| type d'activité non publié | état vide nommé, les autres onglets restent |
| version archivée pendant la session | l'API répond 404 « contenu introuvable ou retiré » |
| progression illisible | « Avancement indisponible », le contenu reste lisible |
| visiteur sans compte | « Non commencé » + invitation à se connecter |

**Jamais un brouillon en remplacement d'un contenu publié manquant.**

## Accessibilité

Structure de titres respectée, navigation clavier complète, focus visible,
labels sur chaque champ, erreurs annoncées (`role="alert"`), retours en
`aria-live`, aucun état porté par la seule couleur (l'issue d'un critère double
sa teinte d'un libellé masqué), tableaux avec `<caption>` et `scope`, boutons de
révélation nommés (`aria-expanded` / `aria-controls`), `prefers-reduced-motion`
respecté par `styles/motion.css`, pas de débordement horizontal à 390 px.

## Performance

Pages dynamiques — elles affichent l'avancement du lecteur, donc **aucune entrée
de cache partagée ne peut contenir une progression personnelle**. Le contenu
publié est relu du disque à chaque rendu, à quelques kilo-octets par chapitre, et
`cache()` de React dédoublonne les lectures d'un même rendu. Une publication ou
un archivage appelle `revalidatePath(..., "layout")` sur le module et le
chapitre.
