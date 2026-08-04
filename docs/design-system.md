# Système visuel

PR-10. Une interface sérieuse et financière : fonds froids clairs, encre
sombre, un seul accent bleu, états sémantiques discrets. Aucune animation
décorative.

## Feuilles de style

`apps/web/app/globals.css` n'est qu'une liste d'imports ; l'ordre est la
cascade :

| Fichier | Contenu |
|---|---|
| `styles/tokens.css` | Tous les tokens (`:root`). La seule source des valeurs. |
| `styles/fonts.css` | `@font-face` des polices auto-hébergées de `public/fonts/`. |
| `styles/base.css` | Reset, éléments nus, `:focus-visible` global, états `disabled`. |
| `styles/layout.css` | Shell : sidebar, topbar, drawer mobile, workspace. |
| `styles/components.css` | Panneaux, cartes, formulaires, tableaux, variantes PR-10. |
| `styles/learn.css` | Habillage de `/apprendre`, entièrement sous `.learn-page`. |
| `styles/utilities.css` | Helpers transverses (`.muted`, `.table-scroll`, skip link). |
| `styles/motion.css` | Le système de mouvement et la politique reduced-motion. |

Règle : une nouvelle valeur de couleur, d'espace, de rayon, d'ombre, de
hauteur de contrôle, de z-index ou de durée passe par `tokens.css` d'abord.

## Tokens

- **Surfaces** : `--bg`, `--surface`, `--surface-muted`, `--surface-raised`
  (carte sur panneau), `--surface-subtle` (zones calmes).
- **Textes** : `--text`, `--text-strong`, `--text-secondary`,
  `--text-tertiary`, `--muted`, `--text-on-accent`, `--ink`.
- **États** : familles `--accent*`, `--success*`, `--warning*`, `--danger*`,
  `--info*` (teinte, variante forte, fond doux, surface, bordure).
- **Géométrie** : `--space-1..8`, `--radius-sm/-/lg/full`,
  `--shadow-sm/-/menu`, `--control-height(-sm/-lg)`.
- **Typo** : `--font-sans`, `--font-mono`, tailles `--font-size-*`, graisses
  `--font-weight-*`.
- **Couches** : `--z-topbar`, `--z-menu`, `--z-drawer`, `--z-skip-link`.
- **Motion** : `--motion-fast|base|slow` (150/200/240 ms), `--ease-out`,
  `--ease-in-out`.
- **Apprendre** : famille `--learn-*` (canvas minéral, navy, indigo, teal,
  ambre, rayons 10–16 px, hauteurs de contrôle 36/44/48) et les trois piles
  typographiques `--learn-font-sans|serif|mono`.

## Refonte Apprendre

`/apprendre` porte une hiérarchie bento : canvas minéral `--learn-canvas`,
un panneau navy pour la prochaine action, du blanc réservé aux espaces
pédagogiques (leçon, tuteur, bibliothécaire) et des surfaces teintées
`--learn-surface-tinted` partout ailleurs. Les six blocs de la leçon sont
lisibles au premier coup d'œil : indigo pour la conduite (concept, règle,
raisonnement), teal pour l'application (exemple, exercice lié), ambre pour
l'erreur fréquente.

Règles : tout est sous `.learn-page`, jamais au-dessus. Les composants
partagés (`LearningCard`, `SourceReference`, `.primary-action`) gardent leur
apparence sur les autres écrans ; `LearningCard` n'affiche la sortie vers
l'exercice lié que si `showExerciseAction` est passé.

Typographie : Schibsted Grotesk pour l'interface, Lora pour les titres,
Spline Sans Mono pour les chiffres et les identifiants. Les trois familles
sont **auto-hébergées** dans `public/fonts/` (woff2 variables, latin et
latin-ext, ~196 Ko au total) et déclarées dans `styles/fonts.css` : aucune
requête vers un CDN de polices, ni au build ni à l'exécution, donc
l'engagement offline tient. Provenance, licence OFL et procédure de mise à
jour : `apps/web/public/fonts/README.md`.

## Variantes de composants (`components/ui/`)

| Composant | Rôle |
|---|---|
| `PageHeader` | Entête de page ; variante `hero` avec bande d'accent. |
| `StatCard` | Chiffre-clé, bordure latérale teintée par `tone`. |
| `NextActionCard` | Le CTA dominant de l'accueil (fond encre, flèche). |
| `ModuleCard` | Carte de module, bordure supérieure accent, marqueur Premium. |
| `EmptyState` | État vide : vignette centrée, cause et action de sortie. |
| `LockedState` | État verrouillé : condition écrite, jamais stylé en erreur. |
| `Feedback` | Résultat d'action : icône + préfixe + couleur, `aria-live`. |
| `SourceReference` | Panneau de sources repliable (`details`), compte annoncé. |

`FeatureNotice`, `CorrectionSummary` (CorrectionPanel), `LearningCard`,
`ExercisePanel` (ExerciseCard) conservent leurs classes et bénéficient des
tokens.

## Motion

Défini entièrement dans `styles/motion.css` :

- durées 150–240 ms, `opacity`/`transform` seulement, hover ≤ 2 px ;
- une animation accompagne un **changement réel** (soumission, révélation,
  ouverture) — jamais un simple rendu de page, jamais en boucle ;
- classes : `.feedback-appear`, `.reveal-appear`, drawer (`drawer-in`),
  `.search-pending-icon` (seul mouvement répétitif, il signale un travail en
  cours et disparaît avec lui) ;
- `@media (prefers-reduced-motion: reduce)` écrase tout : durées quasi
  nulles, translations de hover supprimées, `scroll-behavior: auto`.
  L'information ne dépend jamais du mouvement.

## Accessibilité

- `:focus-visible` global via `--focus-ring` ; aucun `outline: none` sans
  remplacement ;
- skip link vers `#contenu` dans les deux shells ;
- erreurs : `role="alert"`, icône et préfixe textuel — jamais couleur seule ;
- corrections : région `role="status"` persistante (sr-only) qui passe de
  « Correction en cours » au score reçu ;
- drawer mobile : dialogue modal, piège à focus, Échap, focus restauré ;
- tableaux : `caption` sr-only, `scope="col"`, conteneur `.table-scroll`
  focusable (`role="region"` + label) pour le défilement clavier ;
- contrastes AA : textes sur `--surface` ≥ 4.5:1 (`--muted` inclus).

## Responsive

Points vérifiés par `tests/e2e/design.spec.ts` : 360, 390, 768, 1024, 1440
et 1920 px, sans débordement horizontal global. Les tableaux financiers
larges défilent dans `.table-scroll` avec voile de bord ; rien ne déborde de
la page.
