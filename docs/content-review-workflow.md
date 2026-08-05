# Workflow de relecture

Un contenu généré ne devient jamais utilisable tout seul. Il naît brouillon, il
subit des contrôles qu'aucune requête ne peut contourner, et il attend une
décision humaine. Ce document décrit les cinq états, les transitions autorisées,
et l'espace `/admin/content-review` qui les met en œuvre.

Machine à états : `packages/content-generation/src/types/status.ts`.
Interface : `apps/web/app/admin/content-review/`, `apps/web/components/content-review/`.
Actions serveur : `apps/web/app/api/admin/content-review/route.ts`.
Accès et lecture des brouillons : `apps/web/lib/content-review/service.ts`.

## Les cinq statuts

| Statut | Libellé affiché | Signification |
| --- | --- | --- |
| `draft` | Brouillon | Contenu produit, contrôles pas encore concluants. |
| `validation_failed` | Contrôles en échec | Au moins une erreur bloquante. Le contenu existe, il est consultable, il n'est pas approuvable. |
| `needs_review` | À relire | Tous les contrôles bloquants passent. En attente d'une décision humaine. |
| `approved` | Approuvé | Un relecteur a validé. État terminal. |
| `rejected` | Rejeté | Un relecteur a refusé, avec motif. |

## Transitions autorisées

```text
                 ┌──────────────────┐
                 │      draft       │
                 └───┬──────────┬───┘
      contrôles      │          │      contrôles
      en échec       ▼          ▼      passés
       ┌──────────────────┐  ┌──────────────────┐
       │ validation_failed│  │   needs_review   │
       └────────┬─────────┘  └────┬────────┬────┘
                │                 │        │
                │ reprise         │        │ rejet motivé
                │                 ▼        ▼
                │        ┌────────────┐  ┌──────────┐
                │        │  approved  │  │ rejected │
                │        └────────────┘  └────┬─────┘
                │           (terminal)        │ reprise
                └─────────────────┬───────────┘
                                  ▼
                               draft
```

En table, telle qu'elle est écrite dans `allowedTransitions` :

| Depuis | Vers |
| --- | --- |
| `draft` | `validation_failed`, `needs_review` |
| `validation_failed` | `draft` |
| `needs_review` | `approved`, `rejected` |
| `approved` | — (état terminal) |
| `rejected` | `draft` |

Trois conséquences voulues :

- **Aucun raccourci vers l'approbation.** `draft → approved`,
  `validation_failed → approved` et `rejected → approved` sont refusées. Un refus
  doit être suivi d'une nouvelle validation.
- **`approved` est terminal.** Un contenu approuvé ne se modifie plus ; il se
  révise, ce qui incrémente `reviewMetadata.revision` sans rien écraser.
- **Une transition vers soi-même est refusée.** Réécrire le statut courant
  masquerait une action qui n'a rien changé.

`assertTransition` lève plutôt que de renvoyer un booléen : un appelant ne peut
pas l'ignorer. L'erreur (`InvalidTransitionError`) nomme les transitions
réellement possibles depuis l'état courant.

### Qui fait bouger un statut

Deux acteurs, **un seul chemin** : tout passe par `applyTransition`, donc par
`assertTransition`. Ni l'interface ni la CLI n'écrivent un statut de leur propre
autorité, et une transition hors table est refusée — en 409 côté interface, par
une exception côté CLI.

- **Les actions humaines** de `/admin/content-review` demandent une intention
  (approuver, rejeter, rouvrir) ; le serveur décide à partir du statut qu'il lit
  sur le brouillon, jamais de celui que le navigateur annonce.
- **La validation** — `content:validate-generated` comme le bouton « Relancer la
  validation » — fait suivre le statut au verdict via `advanceAfterValidation`,
  partagé par les deux surfaces pour qu'elles ne puissent pas diverger.

Cette fonction n'emprunte que des transitions légales, ce qui a une conséquence
concrète : un contenu réparé depuis `validation_failed` remonte en **deux** pas,
`validation_failed → draft → needs_review`, tous deux inscrits à l'historique.
La seule sortie autorisée de `validation_failed` étant `draft`, un raccourci
direct vers `needs_review` serait illégal — et sans cette remontée, corriger un
contenu en échec le laissait dans une impasse, inapprouvable à jamais.

Depuis `needs_review`, un échec ne rétrograde pas le statut : la table ne
l'autorise pas, et c'est l'approbation qui refusera après avoir revalidé. Depuis
`approved` ou `rejected`, la validation ne déplace rien — seule une action
humaine sort un contenu de ces états.

## Pourquoi `published` n'existe pas

La publication est hors périmètre de ce lot. L'état n'est donc pas « interdit » :
il est **absent**.

- absent de `contentDraftStatuses` — un test le vérifie explicitement, et vérifie
  aussi qu'aucune cible de transition ne le mentionne ;
- absent de la contrainte `CHECK` de la migration `0013` — la base refuse
  l'écriture ;
- absent de l'interface : aucun bouton « Publier », ce qu'un test de bout en bout
  vérifie en comptant zéro occurrence.

L'alternative aurait été d'ajouter un statut éditorial aux tables du catalogue
(`lessons`, `exercises`, `flashcards`, `concepts`) et de filtrer toutes les
lectures existantes sur `WHERE status = 'published'`. Un oubli aurait publié un
brouillon sur le site public — exactement le risque que ce lot doit rendre
impossible. Ne pas toucher à ces tables rend la fuite structurellement impossible
plutôt que dépendante d'un filtre bien placé.

L'approbation enregistre donc une **décision de relecture**, rien d'autre. La
promotion d'un contenu approuvé vers le catalogue est le travail d'un lot
ultérieur.

## L'espace `/admin/content-review`

### Accès

Deux verrous, dans cet ordre :

1. `CONTENT_REVIEW_ENABLED` doit valoir `true` (défaut : `false`) ;
2. l'appelant doit avoir le rôle administrateur (`resolveAdmin`).

Un refus répond **404**, comme le reste de l'administration : répondre
« interdit » confirmerait que l'espace existe. Les pages utilisent `notFound()`,
les routes API renvoient la même réponse en JSON.

En production, activer le drapeau **exige** `LEARNING_HUB_AUTH_ENABLED=true` :
l'espace affiche le texte extrait de supports de cours privés, et « qui est en
train de lire » doit avoir une réponse. À défaut, le démarrage échoue plutôt que
de servir ces sources à qui devine l'URL. Hors production, le drapeau reste
utilisable sans comptes — c'est le cas de l'installation locale, qui n'a qu'un
utilisateur.

Sur une instance en démonstration publique, toutes les actions d'écriture
répondent 403 avant même le contrôle de rôle.

### La file

Colonnes : titre, type, chapitre, statut, qualité, origine. Filtres : chapitre,
type, statut, qualité minimale, titre contient.

L'origine est affichée sur **chaque** contenu, dans la liste comme sur la fiche :
« Fixture (mock) » ou « Génération IA ». Un relecteur doit savoir en permanence
s'il lit une fixture technique ou une génération réelle.

L'en-tête de la page le rappelle en toutes lettres : aucun de ces contenus n'est
publié.

### La fiche d'un brouillon

Six sections :

| Section | Contenu |
| --- | --- |
| Sources citées | Les extraits réellement cités, résolus depuis le corpus. Le document source lui-même n'est **jamais servi** ; seul son texte extrait est affiché, sans chemin ni nom de fichier. Une page à extraction dégradée est signalée. |
| Aperçu | Le contenu tel qu'il serait rendu à un apprenant, pour juger sur pièce plutôt que sur du JSON. |
| Contrôles déterministes | Erreurs et avertissements, avec leur code, leur chemin et leur message, plus la version de validation. |
| Édition | Correction du contenu, revalidée avant écriture. |
| Décision | Relancer la validation, approuver, rejeter, remettre en brouillon. |
| Historique | Chaque transition, avec sa date, son acteur et son commentaire. |

L'en-tête porte le `promptId.promptVersion`, le modèle, le numéro de révision et
le score de qualité.

Quand le corpus extrait n'est pas disponible sur l'instance, les extraits ne sont
pas affichés et la page le dit : les références restent vérifiées au moment de la
validation, mais leur texte ne peut pas être montré.

## Les actions serveur

Toutes les décisions sont prises côté serveur à partir du statut **lu sur le
brouillon**, jamais de celui que le navigateur prétend. Le composant client
n'envoie qu'une intention, jamais un statut.

| Action | Ce qu'elle fait | Ce qu'elle refuse |
| --- | --- | --- |
| `saveDraft` | Revalide le contenu réécrit contre le schéma, puis contre le corpus, puis l'écrit. | **409** si le brouillon est approuvé. **400** si le contenu ne passe pas `contentPayloadSchema`, avec le chemin exact de chaque problème. |
| `validateDraft` | Rejoue les contrôles déterministes et rafraîchit le constat de validation. | — |
| `approveDraft` | **Revalide d'abord**, puis passe en `approved`. | **409** si les contrôles ne passent pas, avec les motifs bloquants. **409** si le contenu cite une page à extraction dégradée. **409** si la transition est interdite depuis l'état courant. |
| `rejectDraft` | Passe en `rejected` en enregistrant le motif. | **400** si le motif fait moins de 10 caractères (ou plus de 2 000). **409** si la transition est interdite. |
| `reopenDraft` | Ramène à `draft` un contenu en échec ou rejeté. | **409** depuis tout autre état. |

Quatre règles méritent d'être explicites :

1. **On ne peut pas approuver un `validation_failed`.** Ni par l'interface, où le
   bouton n'apparaît que sur un `needs_review` et reste désactivé tant que
   `passed` est faux, ni par la route, qui revalide et refuse. L'absence du bouton
   n'est pas la sécurité : la sécurité est le refus serveur.
2. **On revalide avant d'approuver.** Le corpus a pu bouger depuis la génération,
   et une approbation doit porter sur l'état actuel du contenu et de ses sources.
3. **Un rejet exige un motif.** Un refus sans motif est inexploitable pour celui
   qui reprendra le contenu. Le motif est stocké dans `reviewMetadata.reviewNote`
   et dans le commentaire de la transition.
4. **Un contenu approuvé n'est plus modifiable.** L'éditeur affiche un message au
   lieu du formulaire, et la route répond 409 si la requête est envoyée
   malgré tout.

La double soumission est empêchée côté client : tant qu'une action est en vol,
les boutons sont désactivés et un second envoi est ignoré. Un second envoi
produirait deux transitions pour une seule intention.

## L'historique

Chaque transition inscrit `fromStatus`, `toStatus`, la date, l'acteur et un
commentaire facultatif. L'acteur est un compte humain, ou une origine machine :
`cli:generate` à la création, `validator` au verdict initial,
`cli:validate-generated` à la revalidation en ligne de commande.

Le premier événement d'un brouillon a `fromStatus: null` : un contenu qui vient
d'être généré ne vient d'aucun état, et écrire `draft` là inventerait un état
qu'il n'a jamais eu.

Sur les installations qui persistent en base, l'historique vit dans
`content_draft_transitions` : table distincte, en ajout seul, jamais mise à jour.
Un historique qui peut être modifié n'est pas un historique — et il doit survivre
à toute réécriture du brouillon.

## La garantie de non-écrasement

`saveDrafts` applique trois règles, dans cet ordre :

1. un contenu `approved` n'est **jamais** écrasé, `--force` compris — c'est la
   garantie qu'une régénération ne détruit pas un travail de relecture ;
2. sans `--force`, un brouillon existant est laissé tel quel, pour ne pas effacer
   une revue en cours ;
3. avec `--force`, il est remplacé par une **nouvelle révision** : le numéro de
   révision est incrémenté, la date de création d'origine et l'historique complet
   sont conservés.

Le récapitulatif de `content:generate` compte séparément les créations, les
révisions, les approuvés préservés et les existants conservés — on sait toujours
ce qui a été touché.

Les deux premières règles sont couvertes par des tests : régénérer un contenu
approuvé avec `--force` le laisse intact, titre compris.

## Corriger un contenu

Deux voies, selon l'ampleur.

### Correction ponctuelle, dans l'interface

Un compte, un montant, une formulation. Le contenu s'édite en JSON — choix
délibéré pour ce lot : six formulaires spécialisés seraient six surfaces à
maintenir en parallèle des schémas, alors que la correction attendue ici est
ponctuelle. Le serveur revalide intégralement avant d'écrire, donc une saisie
fautive est refusée avec l'emplacement exact du problème.

Après enregistrement, le constat de validation est rafraîchi et affiché. Si le
brouillon était en `validation_failed`, il faut rejouer les contrôles en ligne de
commande pour qu'il revienne en `needs_review` :

```powershell
corepack pnpm content:validate-generated --chapter "Emprunts obligataires" --source-pack compta-approfondie
```

### Correction de fond, par régénération

Quand c'est le prompt, le corpus ou le calcul qui est en cause, on régénère :

```powershell
corepack pnpm content:generate --chapter "Emprunts obligataires" --source-pack compta-approfondie --mode mock --force
```

Les contenus approuvés restent intacts ; les autres sont remplacés par une
nouvelle révision qui conserve leur date de création et leur historique.

Un cas particulier mérite d'être connu : quand `hash-divergent` est signalé, la
source a changé sous le contenu. Il ne faut pas corriger la référence, mais
régénérer — personne ne sait plus ce que le générateur avait réellement lu.

### Un approuvé qui ne passe plus

`content:validate-generated` ne rétrograde pas un contenu approuvé : il le
signale, et c'est tout. Seule une action humaine peut le sortir de son état, et
la machine à états ne le permet pas — il faut le régénérer, ce qui produit une
nouvelle révision plutôt qu'une réécriture.
