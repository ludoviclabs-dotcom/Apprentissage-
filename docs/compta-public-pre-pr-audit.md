# Audit de sécurité et de production-readiness — avant Pull Request

Branche `feat/compta-public-learning-experience`, auditée contre `main` à
`4d7888c`. Aucun commit n'a été créé.

## 1. Synthèse du diff

78 fichiers, **14 679 insertions**, 49 suppressions. Répartition :

| Catégorie | Lignes | Détail |
| --- | --- | --- |
| Composants pédagogiques | ~2 950 | 12 fichiers sous `components/compta-approfondie/` + `publication-actions.tsx` |
| Paquet `content-publication` | ~2 400 | types, hash, garde, snapshot, magasin, notation, progression, projections, taxonomie |
| Tests | ~2 900 | 8 fichiers unitaires, 1 spec E2E, 1 fichier de fixtures |
| Documentation | ~1 100 | 7 documents |
| CSS | 800 | `compta-approfondie.css` (652) + `print.css` (148) |
| `lib/publication/` | ~950 | magasin, service, chapitre, activité |
| Base de données | ~830 | migration 0014 (284) + repository (~490) + schéma |
| Routes API | ~610 | publication (190) + activités (420) |
| Pages publiques | ~450 | module + chapitre |
| Scripts | 154 | amorçage e2e |
| Lockfile | 53 | ajout du workspace `@finance/content-publication` |

**Nouvelles dépendances externes : aucune.** Le seul ajout au lockfile est le
paquet interne. Rien ne tire de bibliothèque supplémentaire.

### Volumétrie — verdict

La taille vient des composants et des tests, dans cet ordre, ce qui est le
profil attendu d'un lot qui construit une expérience complète. Aucun fichier
généré, aucun snapshot de test, aucun artefact.

- **Fichiers volumineux** : `compta-approfondie.css` (652 lignes) est une
  feuille de style de section, monolithique par nature — la découper par
  composant irait contre l'organisation existante (`module.css`, `learn.css`).
  `grading.ts` (556) tient quatre familles de notation dont les entêtes se
  ressemblent mais dont les corps ne partagent rien ; les séparer produirait
  quatre fichiers et un cinquième pour leurs types communs.
  `fixtures.ts` (498) est une fixture, et sa longueur est du contenu.
- **Duplications** : la table des libellés de catégorie d'erreur apparaît trois
  fois (grading, error-diagnosis, progressive-case). C'est délibéré : la
  version du domaine ne peut pas franchir la frontière client sans embarquer le
  module de notation. Ce n'est pas de la duplication de logique.
- **Composants monolithiques** : `progressive-case.tsx` (410) porte la vue du
  cas *et* le formulaire d'étape. Le second est indissociable du premier
  (il dépend du type d'étape) ; l'extraire déplacerait le couplage sans le
  réduire.
- **Fichiers générés accidentellement** : aucun.
- **Hors périmètre** : aucune route existante modifiée. `/modules` gagne une
  carte, `/admin/content-review` une section, `review-actions.tsx` une phrase.

## 2. Problèmes détectés et corrigés

| # | Problème | Gravité | Correction |
| --- | --- | --- | --- |
| 1 | La source de vérité de production était `content/published/` (fichiers commités) | **Bloquant** | La base est désormais la source ; le magasin de fichiers est réservé au développement et aux tests |
| 2 | Le seed s'exécutait sans aucune condition | **Bloquant** | Trois verrous : `ALLOW_TEST_CONTENT_SEED=true`, refus de `NODE_ENV=production`, cible confinée à `test-results/` |
| 3 | Aucun filtre `mock` à la **lecture** | Élevé | Troisième barrière : `isLiveVersion` filtre à la lecture, en plus des refus de publication et d'écriture |
| 4 | Le garde n'inspectait que `content`, pas l'instantané complet | Élevé | Balayage **récursif** de tout l'instantané, clés comprises, avant écriture |
| 5 | `RevisionSheetView` recevait l'entité complète (prompt, modèle, relecteur) | Élevé | DTO `PublicSheetView` : fiche, version, sources — rien d'autre |
| 6 | Identifiants de fixture indiscernables de contenu réel | Moyen | Préfixe `e2e-` sur tout, titres marqués `[Fixture e2e]` |
| 7 | Une base injoignable donnait le même écran que « rien de publié » | Moyen | État `unavailable` distinct, 503 plutôt que 404, cause journalisée sans détail d'infrastructure |
| 8 | Publication concurrente → 500 « erreur interne » | Faible | Violation d'unicité traduite en 409 « Publication concurrente » |
| 9 | Motif de secret trop étroit | Faible | `secret`, `token`, `password` ajoutés ; `data/extracted`, `data/generated` ajoutés aux chemins privés |
| 10 | Le miroir fichier écrivait toujours | Faible | `MIRROR_PUBLICATION_TO_FILES`, absent par défaut |
| 11 | `/api/apprentissage/activites` répondait **500** quand aucun magasin n'est configuré | Élevé | 503 explicite, message sans détail d'infrastructure, cause journalisée séparément |
| 12 | La spec du chapitre tournait aussi sur le serveur de démonstration, qui n'a pas de magasin | Moyen | `SEEDED_STORE_SPEC` ignorée par le projet `public-demo` ; `public-demo-publication.spec.ts` couvre l'autre moitié |
| 13 | `content-review.spec.ts` affirmait « aucune action de publication n'existe » | Moyen | Spec mise à jour : la publication existe, et reste une action distincte |

**Aucun fichier supprimé** : l'audit n'a trouvé ni artefact généré, ni fichier
à ne pas versionner.

## 3. Source de vérité de production

```
canUseDatabase()                 → magasin « database »   (production)
sinon, hors production           → magasin « file »       (développement)
sinon, ALLOW_FILE_PUBLICATION_STORE=true → magasin « file » (serveur e2e)
sinon                            → aucun magasin : « indisponible »
```

L'ordre compte : une installation qui a les deux sert **toujours** la base.

Le quatrième cas est un échec bruyant, jamais un chapitre vide. Une production
mal configurée doit se voir plutôt que se déguiser en « rien n'est publié
encore ».

Ce que la production ne lit jamais : `content/published/index.json`,
`test-results/`, `data/generated/`, `data/extracted/`, une fixture TypeScript,
un repli codé en dur.

### Conséquence opérationnelle à trancher

**Le déploiement Vercel actuel n'a pas de base de données.** Avec cette
architecture, `/modules/comptabilite-approfondie` y répondra « contenu
momentanément indisponible » tant que `FINANCE_HUB_USE_DATABASE=true` et
`DATABASE_URL` ne sont pas fournis. C'est le prix — assumé — de la règle « la
source de vérité est la base » ; la note est ici pour qu'il soit payé sciemment.

Deux options, au choix du mainteneur :

1. provisionner une base (Neon via le marketplace Vercel) et appliquer les
   migrations — c'est la voie normale ;
2. poser `ALLOW_FILE_PUBLICATION_STORE=true` sur le déploiement, ce qui rétablit
   le magasin de fichiers commité. L'aveu est nominatif et documenté.

## 4. Isolation des fixtures et du seed

`scripts/seed-published-content.ts` :

- **exige** `ALLOW_TEST_CONTENT_SEED=true` — aucune valeur par défaut, aucune
  déduction ; `1`, `yes`, `TRUE` sont refusés ;
- **refuse** `NODE_ENV=production` sans échappatoire ;
- **refuse** toute cible hors de `test-results/` — il ne peut pas écrire dans
  `content/published/` ;
- est **idempotent** : il remet la cible à zéro, donc se rejoue ;
- ne lit **aucun** PDF, aucun corpus privé, aucun fichier ;
- produit des identifiants préfixés `e2e-` et des titres `[Fixture e2e]` ;
- écrit dans `test-results/`, git-ignoré : il ne peut pas laisser d'artefact
  suivi.

Un seul chemin d'exécution y mène — `playwright.config.ts` — et un test le
vérifie sur l'ensemble des fichiers suivis. Aucun script npm de cycle de vie ne
l'appelle ; `pnpm build` ne le mentionne pas.

## 5. Contenu mock — trois barrières indépendantes

1. **Publication** : `inspectForPublication` refuse `mode: "mock"`, à partir des
   métadonnées **persistées sur le brouillon**, jamais d'un payload client. Le
   navigateur n'envoie qu'un `draftId`.
2. **Écriture** : `publishVersion` refuse un instantané mock, archivé, ou dont
   l'empreinte ne correspond plus.
3. **Lecture** : `isLiveVersion` écarte toute version non `live`, ce qui couvre
   le cas qu'aucune autre ne couvre — une ligne insérée à la main, une base
   restaurée depuis une recette, un magasin de test monté par erreur.

Passer un brouillon en `approved` à la main ne suffit pas : le garde recharge le
corpus, rejoue le moteur de validation, recalcule chaque montant et revérifie
chaque équilibre au moment exact de la publication.

**Aucune variable n'autorise le mock en production**, et il n'y en aura pas.

## 6. Audit de la migration 0014

Docker n'étant pas disponible sur cette machine, **la migration n'a pas été
appliquée à une base**. L'audit est structurel, automatisé par
`packages/db/test/migration-0014.test.ts` (21 tests).

| Point | Verdict |
| --- | --- |
| Compatibilité moteur | PostgreSQL 16 (pgvector), mêmes constructions que 0012/0013 |
| Clés primaires | `TEXT` et `UUID DEFAULT gen_random_uuid()` |
| Clés étrangères | **Aucune**, délibérément : une version publiée doit survivre à la suppression de son brouillon ; l'audit doit survivre à la version |
| Unicité | Index unique **partiel** sur (`artifact_type`, `chapter`, `slug`) `WHERE status='published'` — l'invariant est dans la base |
| Index | 3 sur les versions, 2 sur l'audit, 1 sur l'activité |
| Colonnes JSON | `JSONB` sur les cinq instantanés |
| Valeurs par défaut | `now()`, `'published'`, `gen_random_uuid()` |
| Horodatage | `TIMESTAMPTZ` partout — vérifié par test |
| Destructif | **Rien** : aucun `DROP`, `DELETE`, `TRUNCATE`, `ALTER COLUMN ... TYPE` |
| Données existantes | Trois tables neuves ; aucune table préexistante touchée |
| Anciennes versions | Conservées : `archived` est le seul retrait, aucune cascade |
| RLS | `chapter_activity_events` seule, quatre politiques par opération sur `app_current_user_id()` |
| Idempotence | `IF NOT EXISTS` partout, contraintes derrière garde `pg_constraint`, politiques précédées de `DROP IF EXISTS` |

### Rollback

**Le projet n'a pas de mécanisme de rollback** : `migrate.ts` rejoue
`migrationFiles` en avant, sans migrations descendantes. Ce n'est pas une
régression de ce lot, mais il faut le savoir. Le retour arrière d'une
publication ne passe pas par la migration (voir `docs/content-publication.md`).

### Appliquer 0014 plus tard

```bash
docker compose up -d postgres
```

```bash
DATABASE_ADMIN_URL=postgres://finance:finance_dev_password@localhost:5432/finance_hub pnpm db:migrate
```

```bash
pnpm db:configure-app-role
```

Vérification manuelle recommandée après application :

```bash
psql "$DATABASE_URL" -c "\d published_content_versions" -c "\di published_content_versions*"
```

Puis, avec l'interface : publier un contenu, publier une seconde version,
vérifier que la première passe en `archived`, et que `content_publication_audit`
porte deux lignes.

## 7. Protection de l'administration

| Contrôle | État |
| --- | --- |
| Authentification serveur | `resolveAdmin()` → session → `getViewerRole()` |
| Autorisation serveur | Rôle `admin` exigé ; refus avant lecture du corps |
| Confiance au client | **Nulle** : aucun rôle, acteur ou droit n'est lu de la requête |
| Acteur d'audit | `caller.actor`, résolu côté serveur |
| Validation des payloads | Zod, union discriminée, `confirmed: z.literal(true)` |
| Double publication | Idempotence par empreinte + index unique partiel + 409 sur violation |
| Transaction | Archivage, insertion et audit dans une seule transaction |
| Démo publique | Écritures refusées en amont |
| Fermé par défaut | `CONTENT_REVIEW_ENABLED` absent ⇒ 404 ; refus de démarrer en production sans comptes |

### Divergence assumée sur les codes de refus

Le cahier des charges demande **401** puis **403**. Le dépôt répond **404** aux
deux, et le justifie dans `require-admin.ts` : *« an administration endpoint
that answers "forbidden" confirms it exists »*.

Cette convention est **strictement plus fermée** que la demande : un 403
apprendrait à un compte non administrateur que la route existe et mérite d'être
attaquée ; un 404 ne lui apprend rien. Elle a été retenue lors d'un lot
antérieur, appliquée uniformément à toute l'administration, et la changer pour
la seule route de publication créerait une incohérence tout en affaiblissant la
posture.

**Elle est conservée, et signalée ici pour être tranchée en revue.** Le point de
changement est unique : `requireReviewApiAccess` dans
`apps/web/lib/content-review/service.ts`.

## 8. DTO publics

Ce que l'instantané porte et qui **ne franchit jamais** la frontière :
`promptId`, `promptVersion`, `provider`, `model`, `inputHash`, `sourcePackId`,
`documentIds`, `reviewedBy`, `reviewNote`, `revision`, `qualityScore`,
`validationVersion`, `sourceArtifactId`, `contentHash`, `excerpt`,
`excerptHash`, `chunkIds`, `pack`.

Ce que les projections conservent : l'énoncé, les consignes de forme (unité,
tolérance, arrondi), les choix offerts, et une désignation de source — titre,
nature, section, pages.

Les réponses attendues sont retirées de la charge utile, ce qui rend la notation
dans le navigateur **impossible** plutôt que déconseillée. Un test vérifie
qu'aucun composant n'importe un grader, ni ne manipule `PublishedContentVersion`.

## 9. Tests ajoutés par cet audit

| Fichier | Tests |
| --- | --- |
| `packages/db/test/migration-0014.test.ts` | 21 |
| `packages/content-publication/test/hardening.test.ts` | 13 |
| `apps/web/test/publication-isolation.test.ts` | 17 |
| `apps/web/test/publication-public-surface.test.ts` | 13 |
| `apps/web/test/publication-admin-guard.test.ts` | 19 |
| `tests/e2e/public-demo-publication.spec.ts` | 6 (E2E) |
| **Total** | **89** |

Les 20 points exigés au §11 du cahier des charges sont couverts ; la table de
correspondance figure au rapport de la conversation.

## 10. Contrôles Git

| Commande | Résultat |
| --- | --- |
| `git ls-files "*.pdf"` | vide |
| `git ls-files "data/extracted/**"` | `.gitkeep` seul (préexistant) |
| `git ls-files "data/generated/**"` | `.gitkeep` seul (préexistant) |
| `git ls-files "test-results/**"` | vide |
| `git grep "C:\Users\"` | documentation et tests de détection uniquement |
| `git grep "AppData"` | un test de détection |
| `git grep "CONTENT_SOURCE_ROOT" apps/web` | tests de détection uniquement |
| `git grep "ALLOW_TEST_CONTENT_SEED"` | script, configuration Playwright, son test |

Aucune occurrence n'atteint le bundle public ni une donnée de production.

## 11. Risques restants

1. **Le déploiement Vercel n'a pas de base** — voir §3. Décision à prendre avant
   de considérer le module comme visible en production.
2. **Migration non appliquée** : l'audit est structurel. Un `pnpm db:migrate`
   sur une base éphémère reste à faire quand Docker est disponible.
3. **Codes 401/403** : divergence assumée, à trancher (§7).
4. **Pilote non publié** : inchangé, et normal — le corpus est local et les
   brouillons sont en `mock`.
5. **Deux tests préexistants sensibles à la charge machine** :
   `packages/db/test/production-mode.test.ts` (budget 10 s) et
   `packages/ingest/test/content-extract.test.ts` (5 s). Vérifiés indépendants
   de ce lot — ils échouent à l'identique sur un worktree qui n'en contient
   rien. Non modifiés : hors périmètre.
6. **`content/published/index.json` reste commité** avec un index vide. Il
   documente la forme du magasin et sert le mode développement. Il n'est plus la
   source de production.
