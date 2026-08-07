# Activation du pilote — Emprunts obligataires

Ce lot ne construit pas de machinerie : elle existe depuis
`docs/content-pilot-emprunts-obligataires.md` (génération) et
`docs/compta-pilot-emprunts-obligataires.md` (publication). Il **branche** cette
machinerie sur le corpus réel et consigne ce que le branchement a révélé.

Aucun contenu de cours n'est reproduit ici.

## 1. Le prévol

```bash
corepack pnpm content:pilot:preflight --chapter "Emprunts obligataires"
```

Neuf contrôles : configuration, racine des sources, documents du chapitre,
corrigé, base de données, migrations, mode de génération, interface de revue,
fichiers privés suivis par Git, propreté de l'espace de travail. Rapport lisible,
code de sortie `1` dès qu'un contrôle bloque, `2` sur une erreur d'usage.

Deux règles de discrétion, tenues par des tests :

- **aucun chemin absolu complet** — `maskPath` réduit un chemin à son dernier
  segment, si bien que ni le nom de compte ni le fournisseur de synchronisation
  n'apparaissent dans un rapport ;
- **aucun secret** — la cible de base est nommée `hôte:port/base`, jamais par sa
  chaîne de connexion, et les variables sont rapportées présentes ou absentes,
  jamais imprimées.

La commande ne modifie rien. Elle lit, et rend un avis.

## 2. `.env` est enfin lu par les commandes

`CONTENT_SOURCE_ROOT` était documenté dans `.env.example` comme « la racine
scannée par `pnpm content:scan` ». Ce n'était pas vrai : Next.js charge `.env`,
`tsx` ne le charge pas. La commande retombait donc silencieusement sur
`content-private/` — un dossier vide sur une installation qui range ses sources
ailleurs — et rendait un manifeste sans signaler qu'elle n'avait rien vu.

`packages/ingest/src/local-config.ts` corrige cela pour `content:scan`,
`content:extract`, `content:pair`, `content:validate`, les commandes de la
fabrique et le prévol. **Le shell l'emporte toujours sur le fichier**, pour
qu'un essai ponctuel reste possible sans éditer quoi que ce soit.

Le prévol utilise la **même** fonction : il ne peut donc pas déclarer une
configuration valide que le pipeline ne verrait pas.

## 3. `.gitignore` couvrait trop peu

La règle ne visait que `data/generated/drafts/`. Un dossier voisin — par exemple
les charges utiles du mode assisté — se serait retrouvé suivi par Git sans que
personne l'ait décidé. La règle porte désormais sur `data/generated/` entier.

## 4. La page 5, et ce qu'elle était vraiment

Le lot précédent la signalait `degraded-extraction — texte trop court
(72 caractères)` et concluait « probablement un tableau ou un visuel non
récupérable ».

**Constat contraire, établi en rendant la page en image** (`getScreenshot` de
`pdf-parse`, déjà présent — aucune dépendance OCR ajoutée) :

| Sonde | Résultat |
| --- | --- |
| texte extrait | 72 caractères, une consigne complète et bien formée |
| images | 0 |
| tableaux détectés | 0 |
| rendu visuel | une consigne, puis un **formulaire de journal vierge** (traits vectoriels), le reste de la page blanc |

L'extraction est donc **fidèle et complète**. Ce qui est en défaut est
l'heuristique de qualité : `MIN_TEXT_LENGTH = 200` traite une page légitimement
peu dense comme une extraction ratée.

**Décision de ce lot : ne rien reclasser silencieusement.** Le marquage était
conservé tel quel, faute de pouvoir distinguer « page vide de texte parce que
l'extraction a échoué » de « page vide de texte par construction » — un
changement du pipeline d'extraction, et non de ce pilote.

### Résolu depuis, dans le pipeline

Cette distinction existe désormais. Le pipeline sonde les images des seules pages
trop courtes (`getImage()`, toujours sans dépendance nouvelle) et en tire deux
codes distincts : `sparse-page`, non bloquant, pour une page peu dense dont le
texte est complet ; `degraded-extraction`, bloquant, quand une image significative
porte le contenu manquant. Voir `docs/content-quality-gates.md`, « Page mal
extraite ou page peu dense ? ».

Ce que cela change pour la page 5, mesuré sur le pack :

- elle porte `sparse-page` au lieu de `degraded-extraction` ; le constat reste
  dans l'artefact, motivé (« sans image : le texte extrait est complet »), et
  `content:extract` comme `content:validate` continuent de le remonter ;
- « Les emprunts obligataires - Mise en situation » repasse en `extracted` ;
- le garde de publication ne la refuse plus : `verifyReference` sur cette page
  rend `valid: true` sans avertissement. **Un contenu peut donc la citer** — la
  consigne y est complète et fidèlement extraite.

Le sondage a aussi corrigé le constat dans l'autre sens : les pages 2 de « Les
titres - Fiche de cours » et 3 de « Les titres - Mise en situation », que ce lot
rangeait avec la page 5, sont de **vrais** positifs — leur contenu (un arbre de
décision, deux avis de débit porteurs des montants) est bien là, en image, hors
d'atteinte du texte. Elles restent bloquantes, et ces deux documents restent en
`needs-review`.

## 5. Le mode `manual-assisted`

Aucun fournisseur live n'est configuré sur cette installation
(`CONTENT_AI_ENABLED` absent, `AI_PROVIDER=none`, aucune clé). L'ordre de
préférence du cahier des charges donne alors le mode assisté.

### Ce qu'il est

Le rédacteur lit les extraits validés et écrit lui-même la charge utile JSON,
dans un fichier hors Git. Le provider la relit, la passe **par le schéma Zod du
mode live**, et la rend à l'orchestrateur — qui applique ensuite **les mêmes**
contrôles déterministes et **la même** approbation humaine. Rien n'est allégé ;
seule la plume change.

```text
data/generated/manual/<pack>/<chapitre>/<promptId>.json     (git-ignoré)
```

| `promptId` | Forme attendue |
| --- | --- |
| `smart-revision-sheet` | l'objet fiche |
| `flashcard-atomic` | `{ "cards": [ … ] }` |
| `calculation-exercise` | `{ "exercises": [ … ] }` |
| `journal-entry` | `{ "exercises": [ … ] }` |
| `error-diagnosis` | `{ "exercises": [ … ] }` |
| `progressive-case` | l'objet mini-cas |

```bash
corepack pnpm content:generate --chapter "Emprunts obligataires" \
  --source-pack compta-approfondie --mode manual-assisted --author "<nom>"
```

`--author` est **exigé** : un brouillon publiable nomme son rédacteur, et une
valeur par défaut ne nommerait personne.

### Ce qu'il n'est pas

Un `mock` renommé. La distinction n'est pas déclarative — trois différences
structurelles, chacune couverte par un test :

1. **La source du contenu.** Une fixture est choisie par `promptId` dans un
   catalogue compilé dans le dépôt, disponible pour tout chapitre qui en a une.
   Une charge utile assistée est lue d'un fichier écrit pour *ce* chapitre.
2. **L'absence est un échec.** Sans fichier, le provider refuse et nomme le
   chemin attendu. Il ne retombe sur aucune fixture — un repli silencieux
   publierait de la démonstration en croyant publier du cours.
3. **La traçabilité.** Le modèle rapporté porte l'empreinte du fichier lu
   (`manual-assisted:<auteur>:<sha12>`), donc deux rédactions ne peuvent pas se
   confondre dans les métadonnées d'un brouillon.

Le mode assisté ne répare rien non plus, contrairement au mode live : une sortie
de modèle est un texte qu'on peut redemander, une rédaction est un fichier qu'on
corrige. Deviner ce que l'auteur voulait écrire serait la correction silencieuse
que ce lot interdit.

### La frontière de publication

Elle est désormais énoncée par ce qui est **accepté**, pas par ce qui est refusé :

```ts
publishableGenerationModes = ["live", "manual-assisted"]
```

Tester `mode === "mock"` laissait passer tout mode ajouté plus tard sans que
personne ait décidé qu'il était publiable. La liste blanche oblige la décision à
être prise au moment où le mode est créé, et un mode inconnu est refusé par
défaut.

Les trois barrières indépendantes citent toutes cette même liste — le garde
(`guard.ts`), l'écriture du magasin (`store.ts`), la lecture publique
(`apps/web/lib/publication/store.ts`) — parce que trois barrières ne valent que
si elles disent la même chose.

`mock` reste impubliable, définitivement, quelle que soit la personne qui
cliquerait « approuver ». L'interface de revue affiche les trois origines sous
trois étiquettes distinctes : **Fixture (mock)**, **Génération IA**,
**Rédaction assistée**.

## 6. Ce que ce lot n'a pas fait

- **Aucune migration appliquée.** Voir ci-dessous.
- **Aucun contenu réel rédigé.** Le mode assisté est en place et testé ; les
  charges utiles du chapitre restent à écrire.
- **Aucune publication.** Elle vient après la revue humaine, qui vient après la
  rédaction.

## 7. Le blocage : il n'y a pas de base de données

`docker`, `psql`, un service PostgreSQL, un runtime de conteneur : aucun n'est
présent sur cette installation, et `localhost:5432` ne répond pas. La migration
`0014` ne peut donc être appliquée nulle part, et le prévol le rapporte comme un
blocage plutôt que de l'ignorer.

Ce qui en dépend :

| Étape | Base requise |
| --- | --- |
| pipeline d'extraction | non |
| génération des brouillons | non |
| contrôles déterministes | non |
| revue humaine dans `/admin/content-review` | non |
| **publication** | **oui** — la base est la source de vérité des contenus publiés |

La revue humaine est donc atteignable sans base. La publication ne l'est pas, et
c'est voulu : `apps/web/lib/publication/store.ts` refuse de publier sans magasin
configuré plutôt que d'écrire quelque part au hasard.

Pour débloquer, sur une installation qui a Docker :

```bash
docker compose up -d postgres
corepack pnpm db:migrate
corepack pnpm content:pilot:preflight --chapter "Emprunts obligataires"
```

Le prévol doit alors passer au vert sur `base de données` et `migrations`.

**La base de production Vercel n'est pas une cible de ce lot.** Le prévol
avertit dès qu'une cible n'est pas une boucle locale, et ce lot n'applique
aucune migration à distance.
