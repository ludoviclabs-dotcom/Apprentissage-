# ADR 011 — Mode découverte : séparer la copie publique du diagnostic d'exploitation (PR-20)

Statut : accepté
Date : 2026-08-04
Complète : ADR-004 (planificateur de révision), ADR-009 (shells public et applicatif)

## Contexte

Le déploiement public tourne volontairement sans base, sans comptes, sans
persistance et sans facturation. Le code fonctionnait, le build était vert — et
l'interface disait la vérité **à la mauvaise personne**.

Trois symptômes, une seule cause.

`/revisions` publiait, sous chaque carte, la phrase
`Indisponible sans base de données : active FINANCE_HUB_USE_DATABASE=true et
DATABASE_URL.` Douze cartes, douze fois la même consigne d'administration, dans
une page pédagogique ouverte à tous. `/exercices` proposait un bouton
« Préparer la session » désactivé sous un badge « Bientôt disponible » : un
point d'entrée qui annonce une fonctionnalité et n'en livre aucune.
« Carnet d'erreurs » pointait vers `/revisions#carnet-erreurs`, une ancre — la
page atteinte s'appelait « Session du jour », c'est elle qui restait active dans
le menu, et le carnet n'était qu'une section en bas d'écran.

La cause commune : `FeatureState.reason` était **une seule chaîne pour deux
lecteurs**. Elle avait été écrite pour l'opérateur — c'est utile, et il en a
besoin — puis rendue au visiteur faute d'un autre endroit où la mettre.

## Décision

### 1. Un état d'indisponibilité porte deux messages, dans deux modules

`AvailabilityState` (`lib/availability.ts`) porte `code`, `publicMessage` et un
`optionalAction` facultatif. Il **n'a pas** de champ `adminDiagnostic`.

Le diagnostic vit dans `lib/availability-diagnostics.ts`, qui importe
`server-only`.

C'est le point le plus important de cette ADR, et le raisonnement est le
suivant : un champ « à ne pas afficher » finit affiché. La variante envisagée —
garder `adminDiagnostic` sur l'objet et le filtrer au rendu — reproduit
exactement le défaut corrigé, en pire : la chaîne voyage jusqu'au navigateur
dans le payload RSC et n'est masquée que visuellement. Un champ **absent du
type** ne peut pas fuiter, et un module `server-only` importé par un Client
Component casse la compilation au lieu de sérialiser.

Coût accepté : deux fichiers à tenir en cohérence plutôt qu'un. Le test
`features.test.ts` refuse tout `publicMessage` contenant un identifiant interne,
et vérifie que les diagnostics restent utiles.

### 2. Une action principale visible est implémentée, ou elle n'existe pas

La règle précédente — « désactivé plutôt que muet » — était un progrès sur un
bouton qui ne faisait rien. Elle ne suffit pas pour le CTA d'une page : un
visiteur qui arrive sur `/exercices` et trouve la seule action désactivée
n'apprend rien du produit.

« Session découverte » remplace « Session recommandée » et mène à
`/exercices/session-decouverte` : cinq exercices, correction immédiate, aucune
persistance. La règle « désactivé plutôt que muet » reste valable pour les
contrôles secondaires.

### 3. La session découverte est une liste blanche, pas un filtre

Les cinq exercices sont une constante (`DISCOVERY_SESSION_EXERCISE_IDS`), pas le
résultat d'une requête ou d'un tirage. Trois propriétés sont vérifiées par test
plutôt que supposées : aucun n'appartient à un niveau de module (sinon la
progression canonique le verrouille et le premier clic rend un 403), aucun
n'exige d'entitlement, et tous sont notés par un évaluateur typé.

La route `/api/exercises/session-decouverte` n'accepte que ces cinq
identifiants. Une notation anonyme ouverte à tout le catalogue contournerait la
barrière du lab Excel — la correction étant précisément ce qui est vendu.

Elle est **séparée** de `/api/exercises/attempts` plutôt que pilotée par un
drapeau : cette dernière corrige et enregistre dans une seule transaction,
délibérément (ADR-003, ADR-004). Un drapeau « ne rien écrire » aurait mis les
deux comportements sous un même contrôle, et une mauvaise résolution aurait fait
écrire la démonstration dans la base d'une installation privée. La route de
découverte n'importe aucun dépôt d'écriture : il n'y a rien à mal résoudre.

### 4. L'auto-évaluation publique est locale, en `sessionStorage`

Les quatre boutons fonctionnent en mode découverte. L'intervalle est calculé
dans le navigateur à partir de `REVIEW_INTERVAL_DAYS`, **importé** du domaine et
non recopié : la simulation et le planificateur réel ne peuvent pas diverger.

`sessionStorage`, jamais `localStorage`. Une progression qui survit à la
fermeture de l'onglet alors qu'aucun serveur ne la connaît est le mensonge que
ce mode doit éviter ; c'est le même principe qui interdit de présenter un jeu
seedé comme la progression du visiteur (ADR-009).

`ReviewCard` reçoit `mode: "persisted" | "local"`. Le risque introduit est réel
et nommé : un `mode` mal résolu ferait disparaître silencieusement la révision
d'un apprenant réel. `review-persisted-enabled.spec.ts` l'attaque directement,
contre PostgreSQL, en vérifiant qu'une note survit à un rechargement.

### 5. Le carnet d'erreurs est une route

`/revisions/carnet-erreurs`, avec son titre, son fil d'Ariane et son entrée de
menu. En mode public il montre trois exemples explicitement étiquetés, jamais
attribués au visiteur.

`isNavItemActive` remplace `isPathActive` dans la navigation : l'entrée active
est la plus spécifique qui couvre la route. Sans cela, `/revisions` et
`/revisions/carnet-erreurs` s'allumaient toutes deux et deux `aria-current`
coexistaient. L'ancienne ancre est honorée par une redirection **client** — un
fragment d'URL n'est jamais envoyé au serveur, donc aucune règle de redirection
serveur ne peut le voir.

## Conséquences

- `FeatureState.reason` n'existe plus : le renommage en `publicMessage` fait
  localiser par le compilateur chacun de ses points de lecture, plutôt que par
  une recherche textuelle qui en aurait manqué un.
- Le mode public sait faire trois choses de plus (corriger une session, révéler,
  s'auto-évaluer) sans qu'une seule écriture devienne possible.
- La bannière de démonstration quitte les couleurs de danger : la page
  fonctionne, elle n'est pas en panne. C'est le seul changement visuel de la PR.
- Un exercice retiré du catalogue fait échouer la page de session avec un état
  honnête, et le test unitaire avant elle.

## Ce qui n'est pas fait

- Aucune migration, aucun changement de schéma, aucune règle de notation touchée.
- Le mode découverte ne propose pas d'exporter le résultat de la session : ce
  serait une progression déguisée, sans compte pour la porter.
- Les intervalles ne grandissent toujours pas avec la maîtrise (limite d'ADR-004,
  inchangée) — la simulation publique hérite donc de la même limite, ce qui est
  cohérent avec ce qu'un compte obtiendrait réellement.
