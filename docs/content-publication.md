# Publication des contenus

La fabrique éditoriale (`docs/content-generation.md`) produit des **brouillons**.
Ce document décrit ce qui les transforme en pages publiques, et surtout ce qui
l'empêche.

## Le principe

Le site public ne lit **jamais** un brouillon, un contenu `needs_review`,
`rejected`, une sortie de fournisseur IA, un PDF privé, un chemin local ni une
fixture mock. Il lit uniquement une **version publiée**, c'est-à-dire un
instantané immuable d'un contenu approuvé.

```
draft → needs_review → approved → [action humaine explicite] → published
```

La transition `approved → published` n'est déclenchée par rien d'autre qu'un
clic de relecteur. Approuver ne publie pas : ce sont deux actions, deux routes,
deux boutons.

## Où vit le contenu publié

`content/published/` — **commité**.

Ce n'est pas un relâchement de la règle qui interdit de commiter
`data/generated/drafts/`. Cette règle existe parce que personne ne sait ce qu'un
brouillon contient : du texte recopié d'un PDF privé, un chemin de poste, une
fixture. Un instantané publié, lui, a passé `inspectForPublication`, qui refuse
précisément ces trois choses. La preuve faite, l'interdiction n'a plus d'objet.

Trois propriétés en découlent, et aucune n'était atteignable autrement :

- le chapitre fonctionne **sans base de données**, donc le déploiement Vercel
  le sert ;
- une publication se **relit en diff** avant d'atteindre la production ;
- `pnpm build` ne touche ni réseau, ni base, ni fichier privé.

```
content/published/
├── index.json              # quelles versions sont actives
└── versions/
    └── pub-<type>-<chapitre>-<slug>-v<n>.json
```

Un fichier de version n'est **jamais réécrit**. Publier une nouvelle version
écrit un nouveau fichier ; archiver l'ancienne modifie l'index, pas
l'instantané. Aucun chemin de code ne rouvre un instantané en écriture, et
`readVersion` recalcule son empreinte à chaque lecture — une retouche manuelle
fait échouer la lecture au lieu d'atteindre un visiteur.

## Ce que la base enregistre

Migration `0014` ajoute trois tables :

| Table | Contenu | RLS |
| --- | --- | --- |
| `published_content_versions` | registre des versions sur une installation qui persiste | non — contenu partagé, sans donnée personnelle |
| `content_publication_audit` | qui a publié quoi, quand, en remplacement de quoi | non, même raison ; append-only |
| `chapter_activity_events` | ce qu'un apprenant a fait sur un chapitre | **oui** — c'est la seule donnée personnelle du lot |

Le chemin de lecture public n'interroge aucune de ces tables. Elles enregistrent
les **actes**, pas le contenu : un fichier n'a pas d'auteur, et « qui a publié
ceci » est exactement ce que la revue doit pouvoir répondre.

Un index unique partiel garantit **une seule version active** par
(`artifact_type`, `chapter`, `slug`). La contrainte est dans la base, pas dans le
code : une règle appliquée seulement en TypeScript est à une transaction oubliée
d'être fausse.

## Le garde de publication

`packages/content-publication/src/guard.ts`. Il **ne fait pas confiance au
verdict stocké** : `validationMetadata` dit ce que les contrôles ont conclu le
jour où ils ont tourné. Le garde recharge le corpus et rejoue tout, au moment
exact de la publication.

Il refuse un contenu qui :

| Refus | Code |
| --- | --- |
| n'est pas `approved` | `statut-non-approuve` |
| a été généré en mode `mock` | `mode-mock` |
| porte un type non supporté | `type-non-supporte` |
| a un champ porteur vide | `contenu-vide` |
| comporte un chemin absolu | `chemin-prive` |
| comporte un lien vers un fichier source, `CONTENT_SOURCE_ROOT` ou Dropbox | `url-fichier-prive` |
| comporte ce qui ressemble à une clé | `secret-detecte` |
| ne correspond plus à l'empreinte relue | `hash-divergent` |
| cite un document, une page ou un fragment introuvable | `document-inconnu`, `page-inexistante`, `chunk-inconnu`… |
| s'appuie sur une page dont l'extraction est dégradée | `page-degradee` |
| ne passe plus les contrôles déterministes | `controle-deterministe` |
| ne cite aucune source | `aucune-source` |

**Un corpus absent est un refus**, jamais un succès par défaut : ne pas pouvoir
vérifier n'est pas vérifier.

Le rapport rendu porte `passed`, `errors`, `warnings`, `sourceIntegrity`,
`deterministicValidation`, `contentHash` et `publicationVersion`.

## Le snapshot

Ce qui est recopié : contenu, métadonnées de génération, de validation et de
revue, références de sources.

Ce qui **ne l'est pas** : le texte des extraits (`excerpt`) et leur empreinte.
Les extraits viennent de PDF privés ; les recopier dans un fichier commité les
publierait, ce qu'aucune approbation n'autorise. Le panneau « Sources » affiche
donc une **désignation** vérifiable — titre, nature, section, pages — jamais une
citation.

## Actions administratives

`/admin/content-review/<draftId>`, section « Publication ». Elles sont servies
par `/api/admin/content-publication`, distincte de la route de relecture : la
seule route qui écrit dans le magasin public est celle-là, et elle ne sait rien
faire d'autre.

| Action | Condition |
| --- | --- |
| Prévisualiser | toujours |
| Publier | `approved`, mode `live`, contrôles passés, droits administrateur |
| Publier une nouvelle version | idem, quand une version est déjà active |
| Archiver | une version active existe |
| Historique | toujours |

Le bouton masqué n'est **pas** la sécurité : la route refuse de toute façon, et
rejoue les contrôles. La confirmation est une étape du protocole — la route
exige `confirmed: true` — et affiche titre, type, chapitre, version, nombre de
sources, avertissements, URL publique cible et la mention que la publication crée
un instantané immuable.

## Procédure

### Publier

```bash
pnpm content:scan && pnpm content:extract
pnpm content:generate --chapitre "Emprunts obligataires" --mode live
pnpm dev
```

Puis dans `/admin/content-review` : relire, approuver, publier. Enfin :

```bash
git add content/published && git commit -m "publish(compta): emprunts obligataires v1"
```

La publication écrit sur disque ; le commit est ce qui la met en production.
C'est volontairement deux gestes : le premier est réversible d'un `git checkout`.

### Revenir en arrière

Trois niveaux, du plus doux au plus radical :

1. **Archiver** depuis l'administration — le contenu quitte le site public,
   l'instantané reste. Puis commiter `content/published/index.json`.
2. **Republier la version précédente** — regénérer, approuver, publier : une v3
   qui reprend la v1 archive la v2.
3. **Annuler le commit** — `git revert` sur le commit de publication. L'index et
   l'instantané disparaissent ensemble, ce qui est cohérent puisqu'ils ont été
   ajoutés ensemble.

Aucun de ces chemins ne supprime physiquement une ancienne version publiée.

## Environnement

| Variable | Rôle |
| --- | --- |
| `CONTENT_REVIEW_ENABLED` | ouvre `/admin/content-review` et les actions de publication |
| `PUBLISHED_CONTENT_ROOT` | racine du magasin, pour qu'un test e2e publie dans un dossier jetable |

## Tests

```bash
pnpm vitest run packages/content-publication/test
pnpm vitest run apps/web/test/compta-approfondie.test.ts
pnpm exec playwright test --project=chromium tests/e2e/compta-approfondie.spec.ts
```
