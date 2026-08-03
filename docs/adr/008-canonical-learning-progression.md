# ADR 008 — Progression pédagogique canonique

Statut : accepté
Date : 2026-08-03

## Contexte

Trois représentations de la progression coexistaient sans contrat commun :

1. `curriculum_versions`, `module_levels`, `enrollments`, `mastery_events`,
   `mastery_snapshots` et `unlock_events`, introduits par l'ADR 002 ;
2. les curricula de modules `compta-generale-v1` et `excel-finance-lab`, chacun
   avec deux niveaux publiés et ses propres pages ;
3. `learningPath`, `learningDays` et `learningModules`, dont les statuts, scores,
   « jour courant » et pourcentages sont des valeurs de seed globales.

Les pages n'interrogeaient pas la même source. L'accueil et la progression
affichaient les forces et journées seedées, `/parcours` affichait l'ancien track
à quatre niveaux, tandis que chaque module recalculait son propre modèle. Les
liens de niveaux étaient créés sans consulter le statut calculé et les routes
dynamiques ne contrôlaient pas l'accès. Un visiteur pouvait donc voir un score
personnel fictif, un niveau verrouillé mais cliquable, ou « termine le niveau 0 ».

## Inventaire des anciennes sources

| Source | Nature | Ancien usage | Décision |
| --- | --- | --- | --- |
| `packages/domain/src/learning.ts` | Seeds de contenus, `learningPath`, `learningModules` | Accueil, Apprendre, Parcours, Progression | Contenus conservés ; statuts, scores et jour courant exclus de la progression canonique |
| `learning_paths`, `learning_days`, `modules` | Copie SQL des seeds | Même affichage lorsque PostgreSQL est actif | Conservées pour compatibilité et planification ; jamais utilisées pour autoriser ou scorer |
| `curriculumVersions` / `moduleLevels` | Catalogue versionné | Définition des niveaux et règles | Source canonique des niveaux publiés et des règles |
| `enrollments` | État possédé par l'utilisateur | Version épinglée par track | Source canonique de l'inscription ; créée uniquement lors d'une première preuve persistée |
| `mastery_events` | Preuves notées append-only | Composantes de maîtrise | Source canonique du score ; provenance corrigée et clé d'idempotence obligatoires pour les nouveaux événements |
| `mastery_snapshots` | Cache recalculable | Score, blockers, statut | Cache canonique, jamais une autorité autonome |
| `unlock_events` | Journal monotone | Niveau acquis | Autorité canonique d'un passage déjà obtenu ; unicité utilisateur/niveau |
| `comptaGeneraleV1Levels` | Deux niveaux et exercices typés | Module Compta | Track canonique publié |
| `excelLabLevels` | Deux niveaux et exercices tableur | Module Excel | Track canonique publié ; son badge source nomme ce curriculum |
| ancien `track-compta-generale` | Quatre niveaux sans contenu de module raccordé | `/parcours` | Conservé comme catalogue historique, retiré des pages principales et des prochaines actions |
| diagnostic auto-déclaré | Niveaux saisis par l'utilisateur | Recalibrage du parcours 30 jours | Outil d'orientation uniquement ; ne produit aucune preuve de maîtrise |

## Décision

### Une seule frontière de lecture

`apps/web/lib/learning-progression.ts` est le repository de lecture des pages.
Il retourne, pour chaque track publié :

- curriculum et version épinglée ou active ;
- niveaux réellement publiés ;
- mode `demo`, `new` ou `enrolled` ;
- statut `available`, `in_progress`, `passed`, `locked` ou `planned` ;
- score pondéré et quatre composantes ;
- compétences critiques et minimum requis ;
- diagnostic final, blockers et prochaine action ;
- liens autorisés, construits côté serveur.

Accueil, Parcours, Progression et les pages Compta/Excel consomment ce même
objet. Une page ne lit plus `learningPath.status`, `learningModules.progress` ou
une force seedée pour afficher une progression personnelle.

### États explicites et contrôle serveur

Le premier niveau **publié** d'un track est `available` sans événement. Un niveau
suivant est `locked` jusqu'au passage monotone de son prédécesseur. `planned` est
réservé à une définition de curriculum non publiée et n'est jamais déblocable
par un score. Seuls `available`, `in_progress` et `passed` produisent un lien.

Les routes de niveau, d'exercice et de cas pratique appellent le même garde
serveur. Le mode démonstration peut ouvrir le premier exercice publié déclaré
comme démonstration ; il ne contourne jamais un verrou d'un utilisateur connecté.

### Démonstration neutre

Sans utilisateur, les snapshots sont calculés sur un ensemble de preuves vide :
N1 est disponible, les suivants sont verrouillés et aucun score n'est présenté
comme personnel. Aucun appel de lecture ne crée d'enrollment. Les corrections
peuvent être exécutées en mémoire, mais aucun événement, enrollment ou unlock
n'est écrit. Les libellés `Terminé`, `Aujourd'hui` et les pourcentages seedés ne
sont pas utilisés.

### Maîtrise et provenance

La formule versionnée reste :

```text
score = 40 % exercices directs
      + 25 % rétention
      + 20 % cas pratique ou diagnostic corrigé
      + 15 % explication/méthode
```

Un nouvel événement est accepté uniquement après une correction serveur. Il
porte l'utilisateur, le niveau, la version d'exercice, le type de source, la
référence métier, l'identifiant immuable de la preuve et l'heure de correction.
L'unicité `(user_id, kind, source_event_id)` rend le replay idempotent. L'API
publique qui acceptait un score fourni par le client est fermée.

Les tentatives typées alimentent les exercices directs ; une méthode corrigée
alimente l'explication ; une tentative faite dans le mini-cas alimente le cas
pratique ; le dernier item corrigé déclaré par le curriculum alimente le
diagnostic final. Une révision d'exercice révélée et enregistrée alimente la
rétention. Une réponse non corrigée ou une simple auto-évaluation n'alimente
aucune de ces composantes.

### Parcours 30 jours

Le parcours 30 jours est retiré des pages principales. Ses tables et seeds sont
préservés : ils restent disponibles pour une future planification facultative
dérivée du curriculum, mais ne constituent plus un moteur de score, de statut ou
d'autorisation.

### Version et compatibilité

La migration ajoute la provenance et l'idempotence sans supprimer ni réécrire
les événements existants. Les anciens statuts de snapshot sont adaptés
(`in-progress` vers `in_progress`, `acquired` vers `passed`) ; les snapshots
restent des caches recalculables.

Cette PR ne change pas la structure pédagogique des curricula publiés : elle
centralise leur lecture et leurs invariants. Toute future création de N3/N4,
modification de l'ordre, des compétences ou des poids doit publier un nouvel
identifiant de `curriculum_version`. Les inscriptions existantes restent
épinglées à leur version ; aucun événement utilisateur n'est supprimé.

## Conséquences

- Les scores visibles sont cohérents parce qu'ils proviennent tous du même
  snapshot canonique.
- L'ancien contenu reste disponible sans exposer ses états seedés comme travail
  personnel.
- La sécurité ne dépend plus d'un bouton désactivé.
- Une base migrée mais non seedée échoue explicitement au lieu de substituer un
  catalogue mémoire à un état persistant.
- Ajouter un nouveau module exige une entrée de catalogue, des niveaux publiés,
  une preuve de démonstration et une stratégie de diagnostic — pas du code dans
  chaque page.
