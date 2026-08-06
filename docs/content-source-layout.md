# Organisation des sources de contenu

## Arborescence

```text
content-private/              ← sources privées (git-ignoré, jamais servi)
  comptabilite/
    Les titres - Fiche de cours.pdf
    Les titres - Mise en situation.pdf
    ...

data/
  extracted/                  ← artefacts du pipeline (git-ignoré)
    <packId>/
      manifest.json           ← content:scan (+ mise à jour par content:extract)
      pages/<sha12>.json      ← content:extract (un artefact par document)
      pairing.json            ← content:pair
  generated/
    drafts/                   ← futurs brouillons générés (git-ignoré)
    compta-assembly.json      ← entrée par défaut d'assemble-compta.mjs
```

Seuls les `.gitkeep` sont commités sous `data/`. Le garde-fou global `*.pdf`
dans `.gitignore` empêche tout PDF d'entrer dans Git, où qu'il soit ; un test
(`packages/ingest/test/repo-hygiene.test.ts`) le vérifie à chaque `pnpm test`.

## Conventions de nommage

Le rapprochement automatique repose sur le nom de fichier. Format recommandé :

```text
<Chapitre> - <Nature>[ <n°>][ - Corrigé].pdf
```

| Exemple | Catégorie détectée | Chapitre | Variante |
| --- | --- | --- | --- |
| `Les titres - Fiche de cours.pdf` | course | Les titres | — |
| `Les titres - Mise en situation.pdf` | exercise | Les titres | mise-en-situation |
| `La méthode ABC - Application 3.pdf` | exercise | La méthode ABC | application-3 |
| `La méthode ABC - Application 3 - Corrigé.pdf` | correction | La méthode ABC | application-3 |
| `Synthèse - Les emprunts obligataires.pdf` | synthesis | Les emprunts obligataires | — |
| `Annales 2024 - Comptabilité approfondie.pdf` | exam | Comptabilité approfondie | — |
| autre | reference | nom complet | — |

Les accents, apostrophes et majuscules sont neutralisés avant comparaison :
« Corrigé », « corrige » et « CORRIGÉ » sont équivalents. Un corrigé prime sur
un marqueur d'exercice dans le même nom (« Application 3 - Corrigé » est bien
un corrigé).

## Racine configurable

- Défaut : `content-private/` (relatif à la racine du dépôt).
- Sinon : `CONTENT_SOURCE_ROOT` dans `.env` (voir `.env.example`) ou `--root`.
- Les chemins écrits dans les artefacts sont **toujours relatifs à la racine
  scannée**, en séparateurs `/`. Le même manifeste est donc identique qu'il ait
  été produit sous Windows ou Linux, et ne révèle jamais l'arborescence machine.

## L'import se lance depuis le terminal

Aucun import ne part du navigateur. La page `/source-packs` fournit un assistant
qui rappelle les étapes et compose la commande, mais c'est vous qui l'exécutez
dans le terminal du projet — les documents sont sur votre machine, pas sur le
serveur.

```powershell
corepack pnpm content:scan --root "content-private/comptabilite"
```

Le chemin saisi dans l'interface reste **relatif au projet** et ne quitte jamais
le navigateur. Un chemin absolu, réseau ou une URL sont refusés : ils
n'auraient aucun sens pour un serveur, et les afficher laisserait croire qu'il
peut les lire.

Après le scan, enchaînez `content:extract`, `content:pair` et
`content:validate`, puis revenez actualiser la page pour voir les packs
détectés.

## Règles non négociables

1. Aucun PDF ni document source dans Git — ni dans `apps/web/public`.
2. Les artefacts extraits contiennent le texte des sources : ils restent sous
   `data/extracted/`, git-ignoré, et ne sont jamais servis par l'application.
3. Un document retiré des sources disparaît au prochain `content:scan` ; les
   artefacts orphelins sont signalés par `content:validate`.
