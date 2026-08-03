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
| `styles/base.css` | Reset, éléments nus, `:focus-visible` global, états `disabled`. |
| `styles/layout.css` | Shell : sidebar, topbar, drawer mobile, workspace. |
| `styles/components.css` | Panneaux, cartes, formulaires, tableaux, variantes PR-10. |
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
