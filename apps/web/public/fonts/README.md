# Polices auto-hébergées

Trois familles, servies par l'application depuis ce dossier. Aucun appel à
`fonts.googleapis.com` ni à `fonts.gstatic.com` : ni au build, ni à
l'exécution. C'est ce qui permet à l'engagement offline du produit
(`CLAUDE.md`, `docs/architecture.md`) de tenir tout en gardant la typographie
de la refonte.

| Famille | Rôle | Fichiers |
|---|---|---|
| Schibsted Grotesk | Texte d'interface | `schibsted-grotesk-latin{,-ext}.woff2` |
| Lora | Titres éditoriaux | `lora-latin{,-ext}.woff2` |
| Spline Sans Mono | Chiffres, montants, identifiants | `spline-sans-mono-latin{,-ext}.woff2` |

Ce sont les fichiers **variables** : un woff2 par famille et par sous-ensemble
couvre toute la plage de graisses (400–800 pour Schibsted Grotesk, 400–700 pour
Lora, 300–700 pour Spline Sans Mono). Utiliser une graisse de plus ne coûte
aucun octet. Les italiques ne sont pas embarquées : aucune interface n'en
utilise, et les inclure doublerait le poids.

Total : ~196 Ko, dont ~120 Ko de `latin` seul — `unicode-range` fait que
`latin-ext` n'est téléchargé que si la page contient un caractère étendu.

Les déclarations `@font-face` vivent dans `app/styles/fonts.css`.

## Licence

SIL Open Font License 1.1 pour les trois familles — voir `OFL.txt`, qui
regroupe les trois mentions de copyright et le texte de la licence (identique
pour les trois). Redistribution autorisée, y compris embarquée dans une
application.

## Rafraîchir les fichiers

Les woff2 viennent de l'API Google Fonts v2, sous-ensembles `latin` et
`latin-ext`, style romain uniquement :

```sh
curl -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Lora:wght@400..700&family=Schibsted+Grotesk:wght@400..800&family=Spline+Sans+Mono:wght@300..700&display=swap"
```

La réponse liste une URL `fonts.gstatic.com` par famille et par sous-ensemble ;
télécharger celles annotées `/* latin */` et `/* latin-ext */`, les renommer
selon le tableau ci-dessus, puis reporter les `unicode-range` dans
`app/styles/fonts.css`. L'ancien `User-Agent` compte : sans navigateur moderne
déclaré, l'API renvoie du TTF au lieu du woff2 variable.
