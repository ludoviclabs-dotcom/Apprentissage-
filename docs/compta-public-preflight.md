# Prévol — expérience publique « Comptabilité approfondie »

Audit réalisé avant toute écriture de code, sur `main` à `4d7888c` (PR #27
fusionnée). Ce document fige ce qui existe, ce qui manque, et les décisions
d'architecture prises pour combler l'écart.

## 1. Ce qui existe et sera réutilisé tel quel

| Brique | Emplacement | Rôle dans ce lot |
| --- | --- | --- |
| Machine à états éditoriale | `packages/content-generation/src/types/status.ts` | Inchangée. `published` reste absent : la publication ne s'y ajoute pas, elle vit dans une couche séparée. |
| Schémas Zod des six types de contenu | `packages/content-generation/src/types/` | Le snapshot publié réutilise `contentPayloadSchema` sans le redéfinir. |
| Moteur de contrôles déterministes | `packages/content-generation/src/validation/engine.ts` | Rejoué intégralement au moment exact de la publication. |
| Vérification des références | `packages/content-generation/src/types/source-reference.ts` | `verifyReference` fournit l'intégrité des sources exigée par l'étape 2. |
| Registre fermé de calculs | `packages/content-generation/src/calc/templates.ts` | `runTemplate` recalcule chaque réponse attendue. Aucun `eval`. |
| Évaluateurs typés | `packages/domain/src/evaluators/` | `numeric`, `journal_entry`, `multiple_choice` notent les activités publiques. Aucun second moteur. |
| Répétition espacée | `packages/domain/src/review-scheduler.ts` | Échelle 1/3/7/14 j, `ratingFromScore`, `planReviewRemediation`. Aucun second algorithme. |
| Carnet d'erreurs | `error_journal` (0001) + `getErrorJournal` | Alimenté par les échecs des activités du chapitre. |
| Remédiation | `remediation_tasks` (0007) + `planReviewRemediation` | Une remédiation ciblée par échec. |
| Interface de relecture | `apps/web/app/admin/content-review/` | Étendue, pas remplacée. |
| Garde d'administration | `apps/web/lib/auth/require-admin.ts` | `resolveAdmin` + 404 muet. Réutilisée pour les actions de publication. |
| Navigation | `apps/web/lib/navigation.ts` | Entrée « Modules » existante. Aucun second système de navigation. |
| E2E | Playwright, `tests/e2e/` | Une seule solution E2E ; les nouveaux specs s'y ajoutent. |

## 2. Écarts avec le cahier des charges

1. **Aucune couche de publication.** `content_drafts` (migration 0013) refuse
   `published` par contrainte `CHECK`, délibérément. Rien ne relie un contenu
   approuvé à une page publique.
2. **Aucun snapshot.** Un brouillon approuvé reste un fichier réécrit à chaque
   régénération. Rien ne garantit l'immutabilité de ce qu'un visiteur a lu.
3. **Aucune route publique** pour « Comptabilité approfondie ».
4. **Aucun rendu public** des six types de contenu générés : les composants
   existants servent le catalogue *authored* (`packages/domain`), pas les
   artefacts de la fabrique.
5. **La progression est adossée aux tracks canoniques** (`mastery_events`,
   `track_enrollments`) et suppose une base plus une inscription. Le chapitre
   publié n'a ni track ni niveau.
6. **Le corpus n'est pas déployable.** `data/extracted/` est git-ignoré et
   n'existe que sur le poste qui a lancé l'extraction. Le site public ne peut
   donc pas vérifier une référence à la volée — il doit lire un snapshot.

## 3. Décisions d'architecture

### 3.1 Le magasin publié est un répertoire commité

`content/published/` est **commité**, contrairement à `data/generated/drafts/`.
C'est le seul contenu du pipeline qui puisse l'être, et ce n'est pas un
relâchement : le garde de publication *prouve* qu'un snapshot ne comporte ni
chemin absolu, ni secret, ni fixture mock, ni référence morte. Ce qui interdit
de commiter un brouillon — on ne sait pas ce qu'il contient — cesse de
s'appliquer une fois cette preuve faite.

Trois propriétés en découlent, et aucune n'était atteignable avec une table
seule :

- le site public fonctionne **sans base de données**, comme le reste du
  cockpit en mode seedé, donc le déploiement Vercel sert le chapitre ;
- une publication est **relisible en diff** avant d'atteindre la production —
  c'est la revue humaine que le cahier des charges exige, exercée une seconde
  fois ;
- `pnpm build` ne touche ni base, ni réseau, ni fichier privé.

Le fichier n'est jamais réécrit : une nouvelle version est un nouveau fichier,
l'ancienne bascule en `archived` dans l'index. Rien n'est supprimé.

### 3.2 La base est le registre des actes, pas la source du contenu

Migration `0014` ajoute `published_content_versions` et
`content_publication_audit`. Sur une installation qui persiste, elles
enregistrent qui a publié quoi, quand, avec quel hash, en remplacement de
quelle version. Le chemin de lecture public ne les interroge jamais : il lit le
magasin de fichiers. Deux sources de vérité pour un même fait seraient une
divergence en attente ; ici les faits sont différents — le contenu d'un côté,
l'acte de publication de l'autre.

### 3.3 Le garde revalide, il ne fait pas confiance

`validationMetadata` stocké en base date de la dernière validation. Le cahier
des charges impose de rejouer les contrôles **au moment exact de la
publication** : le garde recharge le corpus, rejoue `validateContent`,
recalcule chaque exercice par `runTemplate`, revérifie l'équilibre de chaque
écriture, et recalcule le hash du contenu revu. Un corpus absent est un refus,
jamais un succès par défaut — la même règle que l'approbation applique déjà.

### 3.4 Routes : sous `/modules`, pas un second arbre

`/apprentissage/...` créerait une deuxième arborescence concurrente de
`/modules`, ce que le cahier des charges interdit explicitement. Le parcours
s'installe donc sous l'entrée « Modules » existante :

```
/modules/comptabilite-approfondie
/modules/comptabilite-approfondie/<chapitre>?section=comprendre|fiche|entrainer|reviser|sources
```

Les sous-sections sont des paramètres de recherche : partageables,
rechargeables, rendues côté serveur, sans nouvelle entrée de navigation.

### 3.5 Progression : un calcul local au chapitre

Les `mastery_events` supposent un track canonique inscrit. Le chapitre publié
n'en a pas, et lui en inventer un pour un seul chapitre pilote serait un
contresens. La progression du chapitre est donc calculée à partir des
**activités réellement réalisées**, enregistrées dans `chapter_activity_events`
(migration 0014), et projetée par une fonction pure et documentée
(`packages/domain/src/chapter-progress.ts`). Visiteur sans compte : état local
navigateur, comme la session découverte, avec invitation explicite à se
connecter — la consultation du contenu n'est jamais bloquée.

## 4. Migrations nécessaires

`packages/db/migrations/0014_content_publication.sql`, idempotente comme 0012 et
0013 (`CREATE ... IF NOT EXISTS`, `CHECK` derrière garde `pg_constraint`) :

- `published_content_versions` — registre des versions, une seule active par
  (`artifact_type`, `chapter_slug`, `slug`), index unique partiel ;
- `content_publication_audit` — append-only : acteur, action, versions, hash ;
- `chapter_activity_events` — les activités du chapitre, sous RLS comme toute
  donnée personnelle.

## 5. Risques de régression identifiés

| Risque | Parade |
| --- | --- |
| Une requête publique lisant un brouillon | Le magasin publié est un module distinct ; aucun chemin d'import ne relie une page publique à `content-review/service.ts`. Test dédié. |
| Un chemin absolu Windows dans un snapshot commité | `no-absolute-paths.test.ts` étendu au répertoire publié ; le garde refuse la publication en amont. |
| Un PDF commité par erreur | `.gitignore` interdit déjà `*.pdf` ; contrôle `git ls-files "*.pdf"` en validation finale. |
| Le mode mock atteignant la production | Le garde refuse `mode: "mock"`. Test dédié. |
| Le cache public servant une version archivée | Invalidation par tag à la publication et à l'archivage. |
| Une progression personnelle dans un cache partagé | Les lectures de progression sont `no-store` ; seul le contenu publié est mis en cache. |
| Casser le site existant | Aucune route existante n'est modifiée ; l'entrée « Modules » gagne une carte. |

## 6. Ce qui reste hors de ce lot

Import massif des autres chapitres, accès public aux PDF, notation IA libre,
génération à la volée, publication automatique après approbation. La
généralisation aux chapitres Titres, Constitution, Variations du capital,
Contrats long terme et Travaux de clôture fait l'objet du lot suivant.

## 7. Prévol technique

| Commande | Résultat |
| --- | --- |
| `pnpm lint` | ✅ |
| `pnpm typecheck` | ✅ |
| `pnpm test` | ✅ (voir `docs/compta-public-learning-experience.md` pour le détail après lot) |
| `pnpm build` | ✅ |

Note d'environnement : le worktree exigeait `pnpm install` avant que `tsc` et
`eslint` soient résolus. Aucun code n'était en cause.
