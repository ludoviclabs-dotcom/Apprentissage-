# Prompts développeur par PR pour relancer Finance Learning Hub

## Synthèse exécutive

La meilleure séquence pour accélérer un projet solo sur **Next.js 16 / React 19 / TypeScript 5.9** n’est pas de commencer par le contenu, mais par la **boucle déterministe “auth → données possédées par l’utilisateur → scoring → remédiation → accès payant”**. Next.js 16 repose sur l’App Router et sur les **Route Handlers** pour les endpoints serveur, Supabase recommande aujourd’hui le package **`@supabase/ssr`** avec **cookies** et un fichier **`proxy.ts`** pour rafraîchir les sessions côté serveur, et Stripe recommande de créer les Checkout Sessions côté serveur puis de traiter l’état réel de l’abonnement via **webhooks vérifiés** et non via la seule page de succès. citeturn6search3turn7search1turn7search4turn3view3turn6search2turn8search1

Pour un développeur solo, le chemin le plus robuste est donc :

1. **PR-00** : baseline repo, scripts, CI, env, flags, suppression des faux CTA.
2. **PR-01** : auth + ownership + RLS.
3. **PR-02** : modèle de maîtrise, niveaux, déblocages.
4. **PR-03** : évaluateurs typés et déterministes.
5. **PR-04** : révision active et remédiation.
6. **PR-05** : module core de comptabilité générale.
7. **PR-06** : Excel Finance Lab MVP.
8. **PR-07** : Stripe, entitlements, attestation, bêta payante.

Le choix d’infrastructure recommandé est **Supabase en chemin principal** pour les PR-01 à PR-07, parce que Supabase combine **Postgres, Auth, Storage et RLS** dans la même surface d’implémentation, alors que PlanetScale reste utile si tu veux un workflow MySQL avec branches et deploy requests, mais pas comme première option pour un MVP fondé sur la sécurité **row-level** côté base. Supabase documente explicitement que la RLS doit être activée sur les tables d’un schéma exposé, et PlanetScale documente surtout un workflow de branches / deploy requests pour MySQL. citeturn3view1turn3view8turn1search7turn1search11

### Vue d’ensemble des PR

| PR | Titre court | Priorité | Estimation | Dépendances | Résultat principal |
|---|---|---:|---:|---|---|
| PR-00 | Baseline repo & garde-fous | P0 | 6–10 h | Aucune | Repo stable, scripts fiables, CTA morts retirés |
| PR-01 | Supabase Auth + ownership + RLS | P0 | 16–24 h | PR-00 | Données privées réelles par utilisateur |
| PR-02 | Mastery model & unlock rules | P0 | 12–18 h | PR-01 | Progression calculée et déblocage fiable |
| PR-03 | Deterministic evaluators | P0 | 14–22 h | PR-02 | Scores testables par type d’exercice |
| PR-04 | Revision queue & remediation flow | P1 | 12–18 h | PR-03 | Révision active et remédiation auto |
| PR-05 | Compta générale v1 | P1 | 18–28 h | PR-04 | Premier parcours monétisable |
| PR-06 | Excel Finance Lab v1 | P2 | 16–24 h | PR-03 | Lab Excel MVP, sans clone Excel |
| PR-07 | Stripe billing & entitlements | P0 | 16–24 h | PR-01, PR-02 | Paiement, accès, attestation |

## Décisions d’architecture et conventions

Le point structurant avant d’écrire les prompts est le **choix du “source of truth” base de données**. Drizzle documente à la fois une approche **codebase-first** et une approche **database-first** via `drizzle-kit pull`, tandis que Supabase documente un workflow local complet avec **migrations SQL**, **seed**, **lint** et **tests pgTAP**. Pour ce projet précis, je recommande :

- **Drizzle** pour les requêtes typées dans l’application ;
- **Supabase + SQL migrations** pour tout ce qui touche à **Auth, RLS, policies, fonctions SQL et tests pgTAP** ;
- puis, si besoin, **synchronisation du schéma Drizzle** depuis la base via `drizzle-kit pull` sur les tables critiques au lieu d’essayer de faire porter à Drizzle seul toute la logique RLS. citeturn3view6turn6search1turn6search9turn3view2

Cette décision est pragmatique pour un développeur solo : la sécurité de données utilisateur est plus facile à vérifier quand les policies existent comme SQL versionné et quand les tests RLS existent dans `supabase/tests`. Supabase expose explicitement `supabase test db`, `supabase db reset`, `supabase db lint` et le support pgTAP pour valider les policies. citeturn3view2turn2search3turn2search6turn2search12

Deuxième convention importante : pour **Next.js 16**, privilégie **`proxy.ts`** et non un ancien `middleware.ts` si tu intègres Supabase SSR. Next.js documente que “Middleware” est renommé “Proxy”, et Supabase documente que les Server Components ne peuvent pas écrire les cookies, d’où la nécessité d’un **Proxy** pour rafraîchir les tokens et les repasser au serveur et au navigateur. citeturn7search4turn7search12turn7search1turn7search3

Troisième convention : les **variables d’environnement** doivent être centralisées et validées très tôt. Next.js rappelle que seules les variables préfixées par `NEXT_PUBLIC_` arrivent dans le bundle client. Vercel sépare les variables par **Preview** et **Production**, et applique les **Preview Environment Variables** aux branches non-production, ce qui est exactement ce qu’il faut pour tester auth, RLS et Stripe en préproduction sans polluer la prod. citeturn2search20turn2search2turn10search0turn10search4turn10search12

Enfin, pour les flux de paiement, Stripe recommande de créer les Checkout Sessions côté serveur, de garder les **price IDs** côté serveur pour éviter la manipulation client, et de **vérifier la signature** des webhooks. Stripe recommande également d’utiliser les webhooks pour suivre les changements de statut d’un abonnement. citeturn3view3turn6search2turn8search1turn8search5

## Tableau de bord CI, tests et variables d’environnement

### Checks CI recommandés

Next.js documente Vitest pour les tests unitaires et Playwright pour les tests E2E. Supabase documente les tests pgTAP pour la base et la RLS. Vercel crée automatiquement des Preview Deployments par branche Git, ce qui te permet d’ajouter un contrôle humain rapide par PR avant merge. citeturn9search1turn9search0turn3view2turn10search1turn10search3

| Check | Outil | PR concernés | Bloquant |
|---|---|---|---|
| Lint | ESLint | Tous | Oui |
| Typecheck | TypeScript | Tous | Oui |
| Unit tests | Vitest | Tous à partir de PR-00 | Oui |
| Build | `next build` | Tous | Oui |
| E2E smoke | Playwright | PR-00+ | Oui |
| DB policy tests | `supabase test db` | PR-01+ | Oui |
| Webhook tests | Vitest avec payloads fixtures | PR-07 | Oui |
| Preview deploy review | Vercel Preview | Tous | Fortement recommandé |

### Variables d’environnement

| Variable | Portée | PR | Obligatoire | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Client/serveur | PR-00+ | Oui | URL canonique locale ou preview |
| `NODE_ENV` | Système | Tous | Oui | Standard |
| `NEXT_PUBLIC_SUPABASE_URL` | Client/serveur | PR-01+ | Oui | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client/serveur | PR-01+ | Oui | Clé publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | Serveur only | PR-01+ | Oui | Jamais côté client |
| `DATABASE_URL` | Serveur only | PR-01+ | Oui | Connexion Postgres |
| `DIRECT_URL` | Serveur only | PR-01+ | Optionnel | Pour migrations si séparé |
| `STRIPE_SECRET_KEY` | Serveur only | PR-07 | Oui | Côté serveur uniquement |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client | PR-07 | Oui | Pour redirect / bouton |
| `STRIPE_WEBHOOK_SECRET` | Serveur only | PR-07 | Oui | Signature webhook |
| `STRIPE_PRICE_FOUNDER_ANNUAL` | Serveur only | PR-07 | Oui | Price ID annuel |
| `STRIPE_PRICE_PRO_MONTHLY` | Serveur only | PR-07 | Optionnel | Si mensuel activé |
| `VERCEL_ENV` | Système Vercel | Tous | Auto | Preview / production |
| `VERCEL_URL` | Système Vercel | Tous | Auto | URL de preview utile |
| `SENTRY_DSN` | Client/serveur | Optionnel | Non | Observabilité si ajoutée |

### Template de PR recommandé

```md
## Résumé
- Pourquoi ce PR existe
- Ce qui change
- Ce qui ne change pas

## Checklist
- [ ] Lint
- [ ] Typecheck
- [ ] Vitest
- [ ] Playwright
- [ ] Build
- [ ] Migrations appliquées
- [ ] ENV documentées
- [ ] Rollback documenté

## Risques
- …

## Vérification manuelle
1.
2.
3.

## Captures / Preview URL
- Vercel Preview:
```

### Convention Git

| PR | Branche suggérée | Commits suggérés |
|---|---|---|
| PR-00 | `chore/pr-00-baseline-hardening` | `chore(repo): align scripts and env validation` |
| PR-01 | `feat/pr-01-supabase-auth-rls` | `feat(auth): add supabase ssr auth and rls ownership` |
| PR-02 | `feat/pr-02-mastery-unlocks` | `feat(progress): add mastery snapshots and unlock rules` |
| PR-03 | `feat/pr-03-deterministic-evaluators` | `feat(evaluators): add numeric mcq and journal evaluators` |
| PR-04 | `feat/pr-04-revision-remediation` | `feat(review): add spaced review queue and remediation flow` |
| PR-05 | `feat/pr-05-compta-generale-v1` | `feat(module): ship accounting core track v1` |
| PR-06 | `feat/pr-06-excel-finance-lab` | `feat(excel): add finance lab mvp` |
| PR-07 | `feat/pr-07-stripe-entitlements` | `feat(billing): add checkout webhooks and entitlements` |

## Prompts PR-00 et PR-01

### PR-00 — Baseline repo & garde-fous

**Titre PR**  
`PR-00 — Stabiliser le repo, aligner la stack réelle et supprimer les faux CTA`

**Description courte**  
Nettoyer la baseline du projet pour qu’elle soit exécutable, documentée, testable et non trompeuse : scripts homogènes, validation d’ENV, `.env.example`, conventions Node, README à jour, flags de fonctionnalités, suppression ou désactivation explicite des CTA non implémentés, smoke tests Playwright.

**Définition of Done**

| Critère | Attendu |
|---|---|
| Stack documentée | README reflète Next.js 16 / React 19 / TS 5.9 |
| Scripts | `lint`, `typecheck`, `test`, `build`, `test:e2e` présents et documentés |
| ENV | `.env.example` et validation runtime ajoutés |
| UX honnête | Tout CTA cassé est retiré ou désactivé avec label explicite |
| CI | Tous les checks passent sur la PR |
| Smoke | Accueil + navigation principale validés en Playwright |

**Tests à faire passer**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm playwright test tests/e2e/smoke.spec.ts`

**Tâches d’implémentation**

1. Mettre à jour la documentation :
   - `README.md`
   - `docs/adr/000-baseline.md`
   - `docs/dev/setup.md`

2. Ajouter les garde-fous local/dev :
   - `.nvmrc`
   - `.env.example`
   - `lib/env.ts` ou `src/lib/env.ts`
   - `package.json` → `engines`, scripts homogènes

3. Créer une validation d’ENV minimale, par exemple :

```ts
// lib/env.ts
const required = [
  'NEXT_PUBLIC_APP_URL',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL!,
  vercelEnv: process.env.VERCEL_ENV ?? 'development',
};
```

4. Ajouter un fichier de flags :
   - `lib/features.ts`

```ts
export const features = {
  authEnabled: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  billingEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
  uploadsEnabled: false,
  examTimerEnabled: false,
};
```

5. Dans l’UI, remplacer les CTA morts par :
   - bouton disabled ;
   - tooltip ;
   - badge “Bientôt disponible” ;
   - ou suppression pure si trompeur.

6. Ajouter Playwright smoke :
   - `tests/e2e/smoke.spec.ts`
   - vérifier `/`, navigation, présence d’un CTA principal non cassé.

7. Ajouter script agrégé :
   - `pnpm check` → lint + typecheck + unit tests + build.

**Infra / ENV**

- Créer `.env.example` avec placeholders.
- Ajouter la documentation Vercel Preview / Production.
- Si tu utilises Vercel, charge les variables localement avec `vercel pull` si besoin ; Vercel documente le cache local des variables de projet et la séparation preview/production. citeturn10search14turn10search0turn10search4

**Git workflow**

- Branche : `chore/pr-00-baseline-hardening`
- Commits :
  - `chore(repo): align scripts and env validation`
  - `chore(ui): disable unfinished ctas`
  - `test(e2e): add smoke coverage`

**Risque / rollback**

- Risque principal : casser le boot local par validation d’ENV trop stricte.
- Rollback : garder une validation progressive, avec variables réellement obligatoires limitées à ce PR.
- Vérification manuelle :
  1. `pnpm install`
  2. `pnpm dev`
  3. ouvrir accueil, navigation, pages principales
  4. vérifier que chaque action visible est soit fonctionnelle, soit explicitement désactivée

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-00 du projet Finance Learning Hub.

Objectif:
Stabiliser la baseline du repo sans re-architecturer l’application. Je veux un repo exécutable, honnête côté UX, et prêt pour les PR suivantes.

Contraintes:
- Stack réelle: Next.js 16, React 19, TypeScript 5.9, Vercel, GitHub
- Ne pas introduire de dépendance lourde inutile
- Ne pas changer le design system sans raison
- Préserver les routes existantes
- Toute action visible dans l’UI doit être soit fonctionnelle, soit explicitement désactivée

Fais dans cet ordre:
1) Inspecte l’arborescence réelle et adapte les chemins proposés si nécessaire.
2) Mets à jour README + docs dev pour refléter la stack réelle et les scripts.
3) Ajoute .nvmrc, .env.example, et une validation d’ENV minimale centralisée.
4) Ajoute un module de feature flags pour désactiver proprement les fonctions encore incomplètes.
5) Retire ou désactive les CTA morts / trompeurs.
6) Uniformise package.json: scripts lint, typecheck, test, build, check, test:e2e.
7) Ajoute un smoke test Playwright minimal sur l’accueil et la navigation principale.
8) Lance les commandes de validation.
9) Retourne un résumé structuré.

Commandes à exécuter:
- pnpm install || npm install
- pnpm lint || npm run lint
- pnpm typecheck || npm run typecheck
- pnpm test || npm run test
- pnpm build || npm run build
- pnpm playwright test tests/e2e/smoke.spec.ts || npm run test:e2e -- tests/e2e/smoke.spec.ts

Artifacts à me retourner:
- liste des fichiers modifiés
- résumé des décisions
- commandes exécutées + résultats
- TODO résiduels éventuels
- diff logique des CTA désactivés/supprimés
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-00 après un premier passage de Claude Code.

Mission:
Faire une revue d’implémentation et durcir le résultat sans élargir le scope.

Ce que je veux:
1) Vérifie que les scripts package.json sont cohérents et non redondants.
2) Vérifie que la validation d’ENV ne bloque pas inutilement les environnements de preview.
3) Vérifie que les CTA non disponibles sont impossibles à cliquer en production publique.
4) Améliore le smoke test Playwright si une route critique manque.
5) Corrige les types, imports, lint warnings, messages d’erreur peu clairs.
6) Re-lance toute la suite de checks.

Commandes à exécuter:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts à retourner:
- résumé des corrections ajoutées
- liste des checks passés
- recommandations très courtes pour PR-01
- risques restants avant merge
```

### PR-01 — Supabase Auth + ownership + RLS

**Titre PR**  
`PR-01 — Ajouter Supabase SSR Auth, ownership utilisateur et policies RLS`

**Description courte**  
Introduire l’authentification réelle, la possession des données par utilisateur et les policies RLS nécessaires pour empêcher toute fuite croisée. Utiliser le pattern officiel Supabase SSR avec `@supabase/ssr`, `createBrowserClient`, `createServerClient` et `proxy.ts`. citeturn6search0turn7search1turn6search8

**Définition of Done**

| Critère | Attendu |
|---|---|
| Auth | Sign-up / sign-in / sign-out fonctionnent |
| SSR | Session disponible côté server via cookies |
| Proxy | `proxy.ts` gère le refresh des tokens |
| Ownership | Les tentatives / révisions / erreurs sont reliées à `user_id` |
| RLS | Un utilisateur ne peut pas lire/modifier les données d’un autre |
| Tests DB | pgTAP prouve au moins 3 scénarios RLS |
| UI | Une vue “Mon compte” ou “Session” utile existe |

**Tests à faire passer**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `supabase db lint`
- `supabase test db`
- Playwright :
  - sign-up ou sign-in
  - accès page protégée
  - données d’un user A invisibles pour user B

**Tâches d’implémentation**

1. Installer dépendances :
   - `@supabase/supabase-js`
   - `@supabase/ssr`

2. Créer clients Supabase :
   - `lib/supabase/client.ts`
   - `lib/supabase/server.ts`

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

```ts
// lib/supabase/server.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}
```

3. Ajouter `proxy.ts` conforme à Next.js 16 / Supabase SSR.
   - vérifier session
   - rafraîchir token au besoin
   - matcher seulement sur routes qui nécessitent l’auth

4. Créer pages et route handlers :
   - `app/login/page.tsx`
   - `app/signup/page.tsx`
   - `app/auth/callback/route.ts`
   - `app/account/page.tsx`
   - éventuel `app/(protected)/layout.tsx`

5. Ajouter modèle SQL :
   - `profiles`
   - `organizations`
   - `memberships`
   - colonnes `user_id` sur :
     - `attempts`
     - `review_queue`
     - `error_journal`
     - `exam_sessions`
     - `business_case_runs`
   - si possible `created_by`, `updated_by`

6. Ajouter policies RLS :
   - lecture / écriture uniquement par propriétaire
   - lecture org si membership actif, si tu veux préparer le B2B
   - service role exclu des flux applicatifs normaux

7. Ajouter tests pgTAP :
   - `supabase/tests/rls_attempts.sql`
   - `supabase/tests/rls_review_queue.sql`
   - `supabase/tests/rls_profiles.sql`

8. Ajouter tests Playwright :
   - user A crée une tentative
   - user B ne la voit pas
   - page protégée redirige quand non connecté

**Infra / migrations**

Supabase documente le workflow local avec `supabase start`, `supabase db reset`, `supabase db lint` et `supabase test db`. Pour ce PR, active le stack local Supabase si possible. citeturn3view2turn6search9turn6search13

**Étapes proposées**

1. `supabase init`
2. `supabase start`
3. créer migrations dans `supabase/migrations`
4. `supabase db reset`
5. `supabase db lint`
6. `supabase test db`

**ENV à ajouter**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL` si besoin
- `NEXT_PUBLIC_APP_URL`

Supabase recommande des cookies sécurisés pour SSR ; la session côté serveur dépend de ce flux. citeturn6search12turn6search0

**Git workflow**

- Branche : `feat/pr-01-supabase-auth-rls`
- Commits :
  - `feat(auth): add supabase ssr clients and proxy`
  - `feat(db): add ownership columns and rls policies`
  - `test(db): add pgtap policy coverage`

**Risque / rollback**

- Risque principal : casser l’app publique si toutes les routes deviennent protégées d’un coup.
- Mitigation : protéger seulement les routes utilisateur privées dans un premier temps.
- Rollback :
  - garder la démo publique en lecture seule ;
  - encapsuler l’accès auth dans un layout `(protected)` ;
  - behind feature flag `authEnabled`.
- Vérification manuelle :
  1. créer 2 comptes
  2. user A accomplit une action persistée
  3. user B ne voit pas cette donnée
  4. logout puis accès route protégée → redirection login

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-01 du projet Finance Learning Hub.

Objectif:
Ajouter une authentification réelle avec Supabase SSR, l’ownership des données utilisateur, et des policies RLS testées. Je veux une base robuste pour toutes les PR suivantes.

Contraintes fortes:
- Utiliser le pattern moderne officiel: @supabase/ssr + createBrowserClient + createServerClient + proxy.ts
- Ne pas utiliser les anciens auth-helpers
- Préserver la démo publique si possible
- Les données pédagogiques globales peuvent rester publiques en lecture
- Les données utilisateur (attempts, review queue, error journal, exam runs, etc.) doivent être privées par défaut
- Tout accès sensible doit être possible à tester automatiquement

Plan demandé:
1) Inspecte le schéma existant et repère les tables/session stores à rattacher à user_id.
2) Ajoute l’intégration Supabase SSR.
3) Ajoute login/signup/callback/signout et une page account minimale.
4) Ajoute proxy.ts pour le refresh de session.
5) Crée ou mets à jour le schéma SQL/migrations pour:
   - profiles
   - organizations
   - memberships
   - colonnes user_id sur les tables de données utilisateur
6) Ajoute les policies RLS minimales mais strictes.
7) Ajoute des tests pgTAP qui prouvent qu’un user ne peut pas lire les données d’un autre.
8) Ajoute des tests Playwright auth + route protégée + isolation utilisateur.
9) Lance tous les checks.

Commandes à exécuter si disponibles:
- supabase start
- supabase db reset
- supabase db lint
- supabase test db
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts à retourner:
- liste des migrations
- liste des policies RLS créées
- tables touchées avec user_id
- fichiers modifiés
- commandes exécutées + résultats
- points de vigilance pour PR-02
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-01 après un premier passage de Claude Code.

Mission:
Durcir la sécurité et la testabilité de l’implémentation Supabase Auth + RLS, sans élargir le scope produit.

Checklist de revue:
1) Vérifie que le projet utilise bien @supabase/ssr et non les auth-helpers dépréciés.
2) Vérifie que proxy.ts est cohérent avec Next.js 16.
3) Vérifie que les pages protégées ne s’appuient pas sur getSession pour l’autorisation si getUser/getClaims est plus sûr dans le flow retenu.
4) Vérifie que le service role n’est jamais exposé au client.
5) Vérifie que les politiques RLS couvrent SELECT/INSERT/UPDATE/DELETE là où nécessaire.
6) Renforce les tests pgTAP si un scénario de fuite de données manque.
7) Vérifie toute fuite potentielle de données via route handlers ou chargement serveur.
8) Re-lance toute la suite.

Commandes:
- supabase db lint
- supabase test db
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts:
- corrections ajoutées
- liste des risques résiduels
- scénario manuel de vérification le plus critique
- recommandations ultra courtes pour PR-02
```

## Prompts PR-02 et PR-03

### PR-02 — Mastery model & unlock rules

**Titre PR**  
`PR-02 — Ajouter le modèle de maîtrise, les niveaux et les règles de déblocage`

**Description courte**  
Implémenter un modèle de progression calculé et testable : niveaux 1→4 par thématique, score de passage à 75 %, compétences critiques, snapshots de maîtrise, événements de progression, déblocage/verrouillage.

**Définition of Done**

| Critère | Attendu |
|---|---|
| Niveaux | 4 niveaux par parcours supportés par le modèle |
| Score | pondération configurable |
| Unlock | niveau suivant bloqué tant que seuil non atteint |
| Snapshot | maîtrise par compétence stockée |
| Event log | événements de progression enregistrés |
| UI | état visuel “verrouillé / en cours / prêt / acquis” |
| Tests | formule de maîtrise et unlock couverts |

**Tests à faire passer**

- Unit :
  - calcul de score pondéré
  - règles de passage
  - compétences critiques
  - idempotence des snapshots
- Playwright :
  - finir N1 avec score insuffisant → N2 bloqué
  - finir N1 avec score suffisant → N2 débloqué

**Tâches d’implémentation**

1. Ajouter modèle :
   - `curriculum_versions`
   - `module_levels`
   - `enrollments`
   - `mastery_events`
   - `mastery_snapshots`
   - `unlock_events`

2. Créer service :
   - `lib/progress/mastery.ts`
   - `lib/progress/unlocks.ts`

3. Définir une formule simple et déterministe :

```ts
type ScoreWeights = {
  direct: number;       // ex 0.40
  retention: number;    // ex 0.25
  caseStudy: number;    // ex 0.20
  explanation: number;  // ex 0.15
};

export function computeLevelScore(input: {
  direct: number;
  retention: number;
  caseStudy: number;
  explanation: number;
  weights: ScoreWeights;
}) {
  const total =
    input.direct * input.weights.direct +
    input.retention * input.weights.retention +
    input.caseStudy * input.weights.caseStudy +
    input.explanation * input.weights.explanation;

  return Math.round(total * 100) / 100;
}
```

4. Règles d’unlock :
   - score global niveau `>= 75`
   - compétence critique min `>= 60`
   - diagnostic final terminé
   - si échec : création d’une remédiation

5. Ajouter UI :
   - badges de niveau
   - verrou visuel
   - bouton “Passer au niveau suivant” seulement si règles satisfaites

6. Ajouter fixtures :
   - un parcours test avec 4 niveaux
   - au moins 2 compétences critiques

7. Ajouter tests unitaires et snapshot state tests.

**Infra / migrations**

- Pas d’infra externe nouvelle.
- Migration SQL pour nouvelles tables.
- RLS sur `enrollments`, `mastery_events`, `mastery_snapshots`, `unlock_events`.

**Git workflow**

- Branche : `feat/pr-02-mastery-unlocks`
- Commits :
  - `feat(progress): add mastery schema and services`
  - `feat(ui): add level lock states`
  - `test(progress): cover unlock rules`

**Risque / rollback**

- Risque : logique métier dispersée entre UI et serveur.
- Mitigation : toutes les décisions d’unlock doivent vivre côté serveur ou service partagé testable.
- Vérification manuelle :
  1. créer un user
  2. accomplir activités N1
  3. observer statut N2 avant/après seuil

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-02 du projet Finance Learning Hub.

Objectif:
Mettre en place un vrai modèle de maîtrise et de déblocage des niveaux, entièrement déterministe et testable.

Contraintes:
- Pas de logique produit importante cachée uniquement dans des composants client
- Les décisions “niveau débloqué / non débloqué” doivent être calculées dans des services testables
- Conserver le scope MVP: progression fiable avant sophistication pédagogique
- Les règles doivent être versionnables

Ce que tu dois implémenter:
1) Schéma pour enrollments, module_levels, mastery_events, mastery_snapshots, unlock_events.
2) Service de calcul de score pondéré.
3) Service de règles d’unlock:
   - score global >= 75
   - compétence critique min >= 60
   - diagnostic final complété
4) UI: états verrouillé/en cours/disponible/acquis.
5) Tests unitaires sur les formules.
6) Tests E2E/Playwright minimaux sur le déblocage.
7) Migrations + RLS si nécessaire sur nouvelles tables.

Commandes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts:
- formules retenues
- fichiers modifiés
- cas de test couverts
- limites assumées de cette première version
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-02 après un premier passage de Claude Code.

Mission:
Durcir la cohérence métier, la versionnabilité et les tests du mastery model.

Points à vérifier/corriger:
1) Les pondérations sont-elles configurables et sérialisables ?
2) Les snapshots sont-ils recalculables de manière idempotente ?
3) Les conditions d’unlock sont-elles centralisées dans un seul service ?
4) Les composants client affichent-ils seulement l’état déjà calculé ?
5) Les tests couvrent-ils le seuil 74.99 / 75.00 / 75.01 ?
6) Les compétences critiques sont-elles bien traitées indépendamment du score global ?
7) Re-lance toute la suite.

Artifacts:
- patchs de durcissement
- zones encore perfectibles
- checklist rapide pour PR-03
```

### PR-03 — Deterministic evaluators

**Titre PR**  
`PR-03 — Introduire des évaluateurs typés et déterministes par famille d’exercice`

**Description courte**  
Remplacer la logique trop générique par un moteur d’évaluation typé : QCM, numérique, écriture comptable, texte guidé. Les endpoints d’évaluation restent en Route Handlers ou services serveur Next.js. Next.js documente les Route Handlers comme le mécanisme standard de gestion de requêtes HTTP dans l’App Router. citeturn6search3turn6search7

**Définition of Done**

| Critère | Attendu |
|---|---|
| Évaluateurs | `multiple_choice`, `numeric`, `journal_entry`, `short_text_rubric` |
| Versioning | chaque exercice pointe vers une version d’évaluateur |
| Résultats | score par critère + feedback structuré |
| Legacy | ancien correcteur conservé derrière `legacy_rubric` |
| Tests | fixtures couvrent bons/mauvais cas et bords |
| API | endpoint stable pour soumission d’une tentative |

**Tests à faire passer**

- Unit :
  - numeric ± tolérance
  - MCQ simple/multi-réponse
  - journal entry équilibre débit/crédit
  - texte guidé avec critères analytiques
- E2E :
  - soumission exercice
  - score affiché
  - remédiation créée si échec

**Tâches d’implémentation**

1. Créer contrat d’évaluateur :
   - `lib/evaluators/types.ts`
   - `lib/evaluators/index.ts`

```ts
export type EvaluationType =
  | 'multiple_choice'
  | 'numeric'
  | 'journal_entry'
  | 'short_text_rubric'
  | 'legacy_rubric';

export interface Evaluator<Input, Output> {
  type: EvaluationType;
  evaluate(input: Input): Output;
}
```

2. Implémenter :
   - `lib/evaluators/multiple-choice.ts`
   - `lib/evaluators/numeric.ts`
   - `lib/evaluators/journal-entry.ts`
   - `lib/evaluators/short-text-rubric.ts`

3. Numeric evaluator :

```ts
export function isWithinTolerance(
  actual: number,
  expected: number,
  tolerancePct = 0.0001,
) {
  const diff = Math.abs(actual - expected);
  const base = Math.max(Math.abs(expected), 1);
  return diff / base <= tolerancePct;
}
```

4. Journal entry evaluator :
   - valider comptes attendus
   - valider sens débit/crédit
   - valider montants
   - valider équilibre total
   - accepter variantes configurable

5. Ajouter schéma :
   - `exercise_versions`
   - `exercise_criteria`
   - `exercise_test_cases`

6. Basculer le submit flow vers un service commun :
   - `lib/exercises/submit-attempt.ts`
   - ou `app/api/attempts/route.ts`

7. Stocker résultat détaillé :
   - score global
   - score par critère
   - erreurs détectées
   - normalized payload

8. Ajouter fixtures :
   - `tests/fixtures/evaluators/*.json`

**Infra / migrations**

- Migrations SQL pour critères et versions.
- Pas d’infra externe nouvelle.

**Git workflow**

- Branche : `feat/pr-03-deterministic-evaluators`
- Commits :
  - `feat(evaluators): add evaluation contracts and versions`
  - `feat(evaluators): add numeric and journal evaluators`
  - `test(evaluators): add fixtures and edge cases`

**Risque / rollback**

- Risque : casser les anciens exercices existants.
- Mitigation : fallback `legacy_rubric`.
- Vérification manuelle :
  1. soumettre exercice numérique correct/incorrect
  2. soumettre écriture équilibrée / déséquilibrée
  3. vérifier feedback et scores

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-03 du projet Finance Learning Hub.

Objectif:
Introduire un moteur d’évaluation déterministe, typé par famille d’exercice, afin de réduire les faux positifs/faux négatifs du correcteur actuel.

Contraintes:
- Préserver temporairement l’ancien correcteur derrière un type legacy_rubric
- Les nouveaux évaluateurs doivent être purs, testables, et indépendants de l’UI
- Les exercices doivent pointer vers une version d’évaluateur
- Le résultat doit inclure score global + score par critère + feedback structuré

À implémenter:
1) Contrat d’évaluateur + registry.
2) Evaluateurs:
   - multiple_choice
   - numeric
   - journal_entry
   - short_text_rubric
   - legacy_rubric (adaptateur de l’existant si besoin)
3) Tables ou structures exercise_versions / exercise_criteria / exercise_test_cases.
4) Service de soumission commun côté serveur.
5) Fixtures de tests.
6) Tests unitaires complets sur cas nominaux et edge cases.
7) Au moins un test E2E de soumission d’exercice.

Commandes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts:
- cartographie ancien correcteur -> nouveau moteur
- liste des types d’exercices supportés
- fichiers modifiés
- cas non encore couverts pour une prochaine PR
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-03 après un premier passage de Claude Code.

Mission:
Densifier les tests, vérifier la pureté des évaluateurs, et réduire tout couplage inutile à l’UI.

Checklist:
1) Vérifie que les évaluateurs sont purs et testables sans base de données.
2) Vérifie les bords de tolérance numérique.
3) Ajoute des tests de variantes pour journal_entry si le système les supporte.
4) Vérifie la sérialisation des critères/version d’exercice.
5) Vérifie qu’aucune logique métier centrale n’est dupliquée dans les composants.
6) Re-lance lint/typecheck/unit/E2E/build.

Artifacts:
- bugs corrigés
- paris de conception encore ouverts
- mini-plan conseillé pour PR-04
```

## Prompts PR-04 et PR-05

### PR-04 — Revision queue & remediation flow

**Titre PR**  
`PR-04 — Ajouter la révision active, la file de révisions et la remédiation automatique`

**Description courte**  
Transformer les révisions en système actif : question masquée, révélation volontaire, auto-évaluation, file de révisions dues, génération de remédiation après échec, puis retest différé.

**Définition of Done**

| Critère | Attendu |
|---|---|
| Flashcards | réponse cachée par défaut |
| Reveal | action explicite nécessaire |
| Review queue | items dus triés par date |
| Scheduling | intervalles déterministes |
| Remédiation | création automatique après échec |
| Retest | activité différée générée |
| Tests | scheduler + UI review flow couverts |

**Tests à faire passer**

- Unit :
  - planification J+1 / J+3 / J+7 / J+14
  - stabilité si re-review
  - transition échec → remédiation
- Playwright :
  - reveal answer
  - noter “je ne savais pas”
  - item replanifié et remédiation visible

**Tâches d’implémentation**

1. Ajouter modèle :
   - `review_queue`
   - `review_attempts`
   - `remediation_tasks`

2. Implémenter scheduler simple :

```ts
const intervals = {
  fail: 1,
  hard: 3,
  good: 7,
  easy: 14,
} as const;
```

3. UI révisions :
   - `app/revisions/page.tsx`
   - question visible
   - réponse cachée
   - boutons : “Pas su”, “Partiel”, “Su”, “Très facile”

4. Remédiation :
   - rattacher un exercice isomorphe ou une micro-leçon
   - créer au moins 1 tâche de remédiation quand note insuffisante

5. Dashboard :
   - compteur de révisions dues
   - CTA “Réviser 5 min”

6. Tests unitaires sur planification et création de file.

**Infra / migrations**

- Migrations SQL nouvelles tables.
- RLS sur queue, attempts, remediation.

**Git workflow**

- Branche : `feat/pr-04-revision-remediation`
- Commits :
  - `feat(review): add due queue and reveal flow`
  - `feat(remediation): enqueue remediation after failure`
  - `test(review): add scheduling coverage`

**Risque / rollback**

- Risque : faire du scheduler trop “smart” trop tôt.
- Mitigation : rester sur des intervalles fixes et lisibles.
- Vérification manuelle :
  1. ouvrir révisions
  2. révéler réponse
  3. choisir “pas su”
  4. vérifier date due + remédiation

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-04 du projet Finance Learning Hub.

Objectif:
Implémenter une vraie révision active avec file d’items dus, reveal volontaire, auto-évaluation et remédiation automatique.

Contraintes:
- Rester simple et déterministe
- Pas d’algorithme opaque
- La réponse d’une flashcard doit toujours être cachée avant l’action de l’utilisateur
- Le système doit réutiliser autant que possible les entités déjà créées en PR-02 / PR-03

À faire:
1) Schéma review_queue / review_attempts / remediation_tasks.
2) Scheduler déterministe avec intervalles fixes.
3) UI de révision active avec reveal answer.
4) Action serveur pour enregistrer le résultat de révision et replanifier.
5) Création de remédiation après échec.
6) Tests unitaires du scheduler.
7) Test Playwright du flow complet.

Commandes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts:
- logique de planification
- fichiers modifiés
- scénarios de review couverts
- limites assumées de l’algorithme v1
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-04 après un premier passage de Claude Code.

Mission:
Améliorer la robustesse UX et la logique du scheduler sans augmenter le scope.

Vérifications:
1) Les réponses sont-elles bien cachées avant reveal sur tous les écrans ?
2) Le scheduler est-il testable et purement déterministe ?
3) Les remédiations sont-elles idempotentes ou risque-t-on des doublons ?
4) L’UI indique-t-elle clairement ce qui est dû aujourd’hui ?
5) Ajouter/renforcer les tests edge cases.
6) Re-lancer tous les checks.

Artifacts:
- corrections
- risques restants
- recommandations très courtes pour PR-05
```

### PR-05 — Compta générale v1

**Titre PR**  
`PR-05 — Livrer le premier parcours monétisable de comptabilité générale`

**Description courte**  
Créer un parcours v1 réellement utilisable en comptabilité générale : niveaux N1/N2 minimaux, quelques exercices déterministes, un mini-case de clôture, un journal interactif simple, progression liée aux services PR-02/03/04.

**Définition of Done**

| Critère | Attendu |
|---|---|
| Parcours | module visible avec niveaux et prérequis |
| Contenu | au moins 12–15 exercices utiles |
| Exercices | saisie simple, TVA, achats/ventes, banque, immobilisation |
| Case | mini-case “mois comptable” ou “clôture simple” |
| Évaluation | journal entry + numeric utilisés réellement |
| Révisions | contenu injecté dans queue |
| Tests | 1 smoke E2E sur parcours |

**Tests à faire passer**

- Unit :
  - fixtures de 5 exercices compta
- Playwright :
  - entrer dans module
  - faire un exercice
  - recevoir score
  - voir progression bouger

**Tâches d’implémentation**

1. Ajouter contenus seed / fixtures :
   - `content/modules/compta-generale-v1/*.json` ou `content/.../*.mdx`
   - `datasets/compta/*.json`

2. Créer routes :
   - `app/modules/comptabilite-generale/page.tsx`
   - `app/modules/comptabilite-generale/[level]/page.tsx`
   - `app/modules/comptabilite-generale/exercises/[id]/page.tsx`

3. Ajouter UI “journal simple” :
   - date
   - compte
   - libellé
   - débit
   - crédit

4. Mapper exercices à évaluateurs :
   - journal_entry pour écritures
   - numeric pour TVA / marge / solde
   - short_text pour justification courte

5. Ajouter un mini-case :
   - 10 pièces
   - 8 écritures
   - balance équilibrée en sortie

6. Intégrer avec :
   - mastery
   - unlock
   - review queue
   - remediation

**Infra / migrations**

- Pas d’infra nouvelle.
- Données versionnées dans le repo ou base seedée.

**Git workflow**

- Branche : `feat/pr-05-compta-generale-v1`
- Commits :
  - `feat(module): add accounting v1 routes and content`
  - `feat(exercises): add journal ui and case study`
  - `test(module): add accounting flow coverage`

**Risque / rollback**

- Risque : créer trop de contenu avant de valider la boucle.
- Mitigation : 12–15 exercices de qualité > 50 exercices faibles.
- Vérification manuelle :
  1. faire le parcours N1 complet
  2. tester au moins une écriture fausse et une juste
  3. observer progression + remédiation

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-05 du projet Finance Learning Hub.

Objectif:
Livrer un premier parcours réellement utilisable et vendable de comptabilité générale, connecté aux briques déjà construites (auth, mastery, evaluators, review).

Contraintes:
- Scope MVP: peu d’exercices mais de bonne qualité
- Réutiliser les évaluateurs déterministes existants
- Ne pas inventer un éditeur comptable complexe
- Le module doit être faisable en local et testable par Playwright

À implémenter:
1) Routes et UI du module de comptabilité générale v1.
2) Niveaux N1/N2 minimum.
3) 12 à 15 exercices:
   - écritures simples
   - TVA
   - achats/ventes
   - banque
   - immobilisation simple
4) Journal interactif simple.
5) Un mini-case comptable.
6) Intégration complète avec score, progression, révisions et remédiation.
7) Un test E2E sur le flow principal.

Commandes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts:
- inventaire des exercices ajoutés
- fichiers modifiés
- captures/logique du mini-case
- points à améliorer plus tard sans les implémenter maintenant
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-05 après un premier passage de Claude Code.

Mission:
Rendre le module plus cohérent, plus testable et plus fluide sans ajouter trop de contenu.

À vérifier:
1) Les exercices sont-ils bien mappés aux bons évaluateurs ?
2) Le mini-case est-il faisable sans ambiguïté ?
3) La difficulté N1/N2 est-elle progressive ?
4) Les erreurs fréquentes mènent-elles à une remédiation utile ?
5) Ajouter ou corriger les tests si le flow principal est fragile.
6) Re-lancer tous les checks.

Artifacts:
- améliorations faites
- risques restants côté contenu
- recommandation rapide vers PR-06
```

## Prompts PR-06 et PR-07

### PR-06 — Excel Finance Lab v1

**Titre PR**  
`PR-06 — Ajouter un Excel Finance Lab MVP, sans clone Excel`

**Description courte**  
Créer un laboratoire Excel/finance exploitable rapidement : datasets CSV, grille éditable simple, exercices numériques, contrôles de formules/résultats, un cas “P&L / cash forecast” et un parcours N1/N2. Ce PR ne doit pas recréer Excel ; il doit créer une **expérience pédagogique testable**.

**Définition of Done**

| Critère | Attendu |
|---|---|
| Lab | page de lab fonctionnelle |
| Datasets | CSV/JSON versionnés |
| Exercices | au moins 8–10 exercices |
| Contrôle | validation de cellules/résultats clés |
| Cas | P&L ou cash forecast MVP |
| Progression | connectée aux PR précédentes |
| Tests | numeric + Playwright flow |

**Tests à faire passer**

- Unit :
  - parsers de datasets
  - validateurs de cellules clés
- Playwright :
  - ouvrir dataset
  - entrer valeurs
  - soumettre
  - voir score et feedback

**Tâches d’implémentation**

1. Créer datasets :
   - `datasets/excel/monthly_pnl.csv`
   - `datasets/excel/cash_forecast.csv`
   - `datasets/excel/assumptions.json`

2. Créer lab simple :
   - `app/modules/excel-finance/page.tsx`
   - `components/excel/grid.tsx`
   - `components/excel/formula-bar.tsx` si très léger
   - sinon simple tableau éditable contrôlé

3. Définir payload d’exercice :
   - cellules éditables
   - cellules attendues
   - tolérances
   - messages d’erreur

```ts
type CellCheck = {
  cell: string;
  expectedValue?: number | string;
  tolerancePct?: number;
  requiredFormulaPattern?: string;
};
```

4. Supporter deux modes :
   - `value_check`
   - `formula_pattern_check`

5. Ajouter 8–10 exercices :
   - marge brute
   - EBE
   - variation BFR simplifiée
   - cash forecast court terme
   - budget vs réel

6. Intégrer progression, review, remediation.

**Infra / migrations**

- Pas d’infra externe nouvelle.
- Stockage repo suffisant pour MVP.

**Git workflow**

- Branche : `feat/pr-06-excel-finance-lab`
- Commits :
  - `feat(excel): add finance datasets and lab shell`
  - `feat(excel): add deterministic cell validators`
  - `test(excel): add lab flow coverage`

**Risque / rollback**

- Risque : dériver vers un vrai tableur trop tôt.
- Mitigation : grille contrôlée minimale.
- Vérification manuelle :
  1. charger dataset
  2. remplir cellules
  3. soumettre
  4. vérifier score

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-06 du projet Finance Learning Hub.

Objectif:
Créer un Excel Finance Lab MVP utile pédagogiquement, sans tenter de répliquer Excel.

Contraintes:
- Pas de dépendance lourde ni composant “tableur complet” dans ce PR
- Expérience déterministe et testable d’abord
- Le scope couvre surtout des résultats et patterns de formule, pas un moteur Excel complet
- Le lab doit s’intégrer à la progression existante

À implémenter:
1) Route/module Excel Finance Lab.
2) Datasets CSV/JSON versionnés dans le repo.
3) Grille éditable légère.
4) Schéma d’exercice avec checks de cellules/résultats.
5) 8 à 10 exercices MVP:
   - P&L
   - marge brute
   - EBE
   - cash forecast
   - budget vs réel
6) Intégration avec score/progression/review.
7) Tests unitaires + au moins un test Playwright.

Commandes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test

Artifacts:
- liste des datasets
- liste des exercices
- limites assumées de la grille MVP
- points recommandés pour une V2
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-06 après un premier passage de Claude Code.

Mission:
Polir le lab et renforcer la validabilité sans élargir le scope.

Checklist:
1) Vérifie que la grille est accessible et pas trop fragile.
2) Vérifie que les validateurs de cellules sont purs et bien testés.
3) Vérifie les tolérances numériques et les messages d’erreur.
4) Vérifie que les datasets et fixtures sont cohérents.
5) Ajoute un test Playwright si le flow “ouvrir -> éditer -> soumettre” est sous-couvert.
6) Re-lance tous les checks.

Artifacts:
- corrections
- risques restants
- préparation courte pour PR-07
```

### PR-07 — Stripe billing & entitlements

**Titre PR**  
`PR-07 — Ajouter Stripe Checkout, webhooks vérifiés, entitlements et attestation`

**Description courte**  
Monétiser le MVP avec un flux propre : création de Checkout Session côté serveur, stockage des price IDs côté serveur, traitement **via webhooks vérifiés**, mise à jour des abonnements/entitlements, page succès, attestation PDF simple ou HTML-to-PDF, et gate d’accès payant sur les parcours premium. Stripe recommande la création de session côté serveur, la conservation des informations sensibles côté serveur, et la vérification de la signature des webhooks. citeturn3view3turn6search2turn8search1turn8search7

**Définition of Done**

| Critère | Attendu |
|---|---|
| Checkout | session créée côté serveur |
| Price IDs | jamais codés côté client |
| Webhook | signature vérifiée |
| Entitlements | accès premium mis à jour par webhook |
| Billing state | statut local cohérent avec Stripe |
| Gate | parcours premium bloqué si pas entitlement |
| Success page | message de confirmation clair |
| Tests | handler webhook testé sur fixtures |

**Tests à faire passer**

- Unit :
  - mapping `checkout.session.completed`
  - mapping `customer.subscription.updated`
  - mapping `customer.subscription.deleted`
  - éventuellement `invoice.paid`
- E2E / manual assisté :
  - bouton checkout
  - redirection Stripe
  - retour success
- Manual avec Stripe CLI :
  - `stripe listen --forward-to localhost:3000/api/stripe/webhook`
  - `stripe trigger checkout.session.completed`
  - `stripe trigger customer.subscription.updated`

Stripe documente le CLI pour forwarder les événements vers un endpoint local et pour tester les webhooks en sandbox. citeturn8search0turn8search2turn8search4turn8search15

**Tâches d’implémentation**

1. Installer Stripe :
   - `stripe`
   - éventuellement `@stripe/stripe-js` si besoin client

2. Ajouter modèle :
   - `billing_customers`
   - `subscriptions`
   - `entitlements`
   - `products`
   - `prices`
   - `certificates`

3. Route handlers :
   - `app/api/stripe/checkout/route.ts`
   - `app/api/stripe/webhook/route.ts`
   - `app/billing/success/page.tsx`
   - `app/billing/cancel/page.tsx`

4. Créer la Checkout Session côté serveur avec `mode: "subscription"` et des **price IDs serveur**.

5. Ajouter `client_reference_id` ou `metadata.userId` pour réconcilier l’utilisateur interne avec Stripe ; Stripe documente `client_reference_id` comme référence interne utile pour rapprocher une session avec tes systèmes. citeturn2search10

6. Côté webhook :
   - vérifier signature
   - traiter :
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid` si tu veux verrouiller l’accès au paiement confirmé

Stripe indique que les changements de statut d’abonnement doivent être suivis par webhooks et que `invoice.paid` ou un statut `active` sont des signaux sûrs d’activation. citeturn8search1turn8search5

7. Gate d’accès :
   - helper `hasEntitlement(userId, feature)`
   - middleware d’interface ou guard serveur sur pages premium

8. Ajout attestation :
   - page ou API générant un document simple
   - seulement si parcours terminé et entitlement actif ou historique de complétion valide

**Infra / ENV**

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_FOUNDER_ANNUAL`
- `STRIPE_PRICE_PRO_MONTHLY` optionnel
- `NEXT_PUBLIC_APP_URL`

Vercel permet d’isoler ces variables par Preview et Production, ce qui est utile pour Stripe sandbox vs live. citeturn10search0turn10search15

**Git workflow**

- Branche : `feat/pr-07-stripe-entitlements`
- Commits :
  - `feat(billing): add stripe checkout session route`
  - `feat(billing): add verified webhook and entitlements`
  - `feat(certificates): add completion certificate`

**Risque / rollback**

- Risque : accorder l’accès depuis la page succès sans confirmation réelle du paiement.
- Mitigation : **n’accorder les entitlements que depuis webhook vérifié**.
- Rollback :
  - feature flag `billingEnabled`
  - laisser le bouton en “liste d’attente” si webhook cassé
- Vérification manuelle :
  1. créer session checkout
  2. simuler événement Stripe
  3. vérifier abonnement local
  4. vérifier accès premium
  5. tester annulation ou suppression d’abonnement

#### Prompt à donner à Claude Code

```text
Tu travailles sur PR-07 du projet Finance Learning Hub.

Objectif:
Ajouter un flux de paiement Stripe propre et minimal, avec Checkout server-side, webhooks vérifiés, entitlements et attestation.

Contraintes fortes:
- Utiliser Route Handlers Next.js pour les endpoints Stripe
- Garder les price IDs côté serveur seulement
- Ne jamais accorder un accès premium uniquement sur la page success
- Les entitlements doivent être pilotés par webhook vérifié
- Rester minimal et fiable: pas de sur-ingénierie B2B dans ce PR

À implémenter:
1) Schéma billing_customers / subscriptions / entitlements / certificates.
2) Helper hasEntitlement(userId, feature).
3) Endpoint create checkout session.
4) Endpoint webhook Stripe avec vérification de signature.
5) Gestion des événements:
   - checkout.session.completed
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.paid si pertinent dans l’activation retenue
6) Pages success/cancel.
7) Gate d’accès premium à au moins une route/module.
8) Génération simple d’attestation de complétion.
9) Tests unitaires du webhook handler avec fixtures.
10) Documentation setup local avec Stripe CLI.

Commandes:
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
- pnpm playwright test
- stripe listen --forward-to localhost:3000/api/stripe/webhook
- stripe trigger checkout.session.completed

Artifacts:
- liste des variables d’environnement Stripe
- événements Stripe réellement gérés
- logique d’activation/révocation d’entitlement
- fichiers modifiés
- instructions de test local pas à pas
```

#### Prompt à donner à Codex après Claude Code

```text
Tu reprends PR-07 après un premier passage de Claude Code.

Mission:
Rendre l’intégration Stripe plus sûre et plus maintenable sans élargir le scope.

Checklist:
1) Vérifie que les price IDs et clés secrètes ne fuient jamais côté client.
2) Vérifie que le webhook utilise bien la vérification de signature officielle.
3) Vérifie que l’accès premium est accordé/révoqué uniquement depuis un état Stripe fiable.
4) Vérifie les cas:
   - active
   - canceled/deleted
   - payment failed / statut non actif
5) Vérifie que la success page ne fait qu’afficher, pas accomplir la logique business critique.
6) Renforce les tests unitaires du handler.
7) Re-lance toute la suite.

Artifacts:
- correctifs appliqués
- risques restants avant bêta
- check-list de lancement bêta avec Stripe sandbox
```

## Recommandations finales d’exécution

Le meilleur usage de tes deux assistants par PR est le suivant :

| Assistant | Rôle optimal | Quand l’utiliser |
|---|---|---|
| Claude Code | Premier passage de construction | exploration du repo, gros patch cohérent, nouvelles structures |
| Codex | Deuxième passage de durcissement | revue des types, edge cases, tests, polishing, réduction du scope |

Pour garder un rythme soutenable en solo, impose à chaque PR une **règle d’arrêt** :

> si le flow principal n’est pas démontrable localement avec tests + vérification manuelle, le PR n’est pas “done”.

Et impose à chaque assistant un **artéfact de sortie standard** :

1. liste des fichiers changés ;  
2. migrations créées ;  
3. variables d’environnement ajoutées ;  
4. commandes exécutées ;  
5. tests passés/échoués ;  
6. risques résiduels ;  
7. recommandation pour la PR suivante.

### Ordre d’exécution conseillé

| Ordre | PR | Pourquoi |
|---:|---|---|
| 1 | PR-00 | Évite de bâtir sur une base trompeuse |
| 2 | PR-01 | Rend enfin les données utilisateur réelles |
| 3 | PR-02 | Permet un vrai produit pédagogique progressif |
| 4 | PR-03 | Rend les scores fiables et défendables |
| 5 | PR-04 | Active rétention et remédiation |
| 6 | PR-05 | Premier module vendable |
| 7 | PR-07 | Monétisation dès que la boucle core est crédible |
| 8 | PR-06 | Excel Lab ensuite, car plus visible mais moins critique que billing |

Je place volontairement **PR-07 avant PR-06** dans l’ordre business recommandé : dès que la boucle core “auth + progression + évaluation + module compta” est crédible, tu peux lancer une **bêta payante** avec un seul parcours premium. Le lab Excel ajoute de la valeur d’acquisition et de différenciation, mais il n’est pas aussi critique que la capacité à **authentifier, protéger, scorer et vendre**. Stripe Checkout, les webhooks vérifiés et les Preview Deployments Vercel rendent ce lancement bêta très faisable dans une stack Next.js/Vercel moderne. citeturn3view3turn6search2turn8search1turn10search1turn10search4

### Check-list de merge par PR

```text
1. Vercel preview ouverte et relue
2. lint/typecheck/unit/build verts
3. Playwright vert sur le flow principal
4. pgTAP vert si le PR touche la base sécurisée
5. ENV documentées dans .env.example + README
6. rollback documenté
7. capture ou note de vérification manuelle ajoutée au PR
```

Si tu suis ces prompts dans l’ordre, tu transformes progressivement Finance Learning Hub d’une démo structurée en **SaaS éducatif testable, sécurisé et monétisable**.
