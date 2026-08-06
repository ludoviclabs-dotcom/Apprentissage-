import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

/**
 * Magasin publié jetable du serveur principal.
 *
 * `scripts/seed-published-content.ts` y publie le chapitre pilote avant le
 * démarrage, ce qui donne à la suite un chapitre réellement consultable sans
 * jamais écrire dans `content/published/` — le magasin du dépôt reste ce qui est
 * servi en production, et une exécution de tests ne peut pas le modifier.
 */
// Résolu depuis le répertoire courant, comme `testDir: "./tests/e2e"` juste en
// dessous : ce fichier est chargé en CommonJS par Playwright, où `import.meta`
// n'existe pas.
const SEEDED_PUBLISHED_ROOT = resolve("test-results", "published-content");
const PUBLIC_DEMO_PORT = PORT + 1;
const AUTH_PORT = PORT + 2;
const externallyManagedBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externallyManagedBaseURL ?? `http://127.0.0.1:${PORT}`;
const publicDemoBaseURL = `http://127.0.0.1:${PUBLIC_DEMO_PORT}`;
const authBaseURL = `http://127.0.0.1:${AUTH_PORT}`;

/**
 * Accounts need PostgreSQL, so the `authenticated` project only exists when a
 * database is supplied. Absent it, the auth specs skip rather than fail — and CI
 * always supplies one, so the flow is genuinely covered there.
 */
const authDatabaseUrl = process.env.PLAYWRIGHT_AUTH_DATABASE_URL;

/**
 * Specs that need accounts and a database. The `*-enabled.spec.ts` suffix is the
 * convention: any project without a database must ignore them, and the
 * `authenticated` project runs nothing else.
 */
const AUTH_ENABLED_SPEC = /-enabled\.spec\.ts$/;

/**
 * Specs that need a *seeded publication store*.
 *
 * Only the private-install server gets one — `scripts/seed-published-content.ts`
 * runs before it, into a throwaway directory. The public-demo server
 * deliberately gets neither `PUBLISHED_CONTENT_ROOT` nor
 * `ALLOW_FILE_PUBLICATION_STORE`, which is exactly the production posture: no
 * database, no file store, therefore no published content. Running these specs
 * there would assert the presence of a chapter that must be absent.
 *
 * `public-demo-publication.spec.ts` covers the other half — that the demo
 * server serves nothing rather than falling back to fixtures.
 */
const SEEDED_STORE_SPEC = /compta-approfondie\.spec\.ts$/;

/**
 * Ce que le serveur de démonstration publique ignore : les specs à comptes, et
 * celles qui exigent un magasin publié.
 *
 * Une seule expression plutôt qu'un tableau, pour que tous les projets gardent
 * le même type de `testIgnore` — c'est ce qui permet à `projects` d'être inféré
 * sans transtypage supplémentaire.
 */
const PUBLIC_DEMO_IGNORED_SPEC = new RegExp(
  `(?:${AUTH_ENABLED_SPEC.source})|(?:${SEEDED_STORE_SPEC.source})`
);

const projects = [
  {
    name: "chromium",
    testIgnore: AUTH_ENABLED_SPEC,
    use: { ...devices["Desktop Chrome"], baseURL }
  }
];

if (!externallyManagedBaseURL) {
  projects.push({
    name: "public-demo",
    testIgnore: PUBLIC_DEMO_IGNORED_SPEC,
    use: { ...devices["Desktop Chrome"], baseURL: publicDemoBaseURL }
  });

  if (authDatabaseUrl) {
    projects.push({
      name: "authenticated",
      testMatch: AUTH_ENABLED_SPEC,
      use: { ...devices["Desktop Chrome"], baseURL: authBaseURL }
    } as (typeof projects)[number]);
  }
}

/**
 * Smoke coverage only. The suite boots the production build on a dedicated port
 * so it never collides with a `pnpm dev` session already running on 3000.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  // The HTML report is produced in CI too. With the list reporter alone no
  // `playwright-report/` directory existed, so the workflow's upload-on-failure
  // step had nothing to archive and a CI-only failure could not be inspected.
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "on-first-retry" },
  projects,
  webServer: externallyManagedBaseURL
    ? undefined
    : [
        {
          command: `corepack pnpm exec tsx scripts/seed-published-content.ts && corepack pnpm --filter @finance/web start --port ${PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            // Le script d'amorçage refuse de tourner sans cet aveu ; le poser
            // ici est ce qui le limite à ce serveur-là.
            ALLOW_TEST_CONTENT_SEED: "true",
            PUBLISHED_CONTENT_ROOT: SEEDED_PUBLISHED_ROOT,
            // `next start` tourne en NODE_ENV=production : sans cet aveu, le
            // magasin de fichiers serait refusé et le chapitre répondrait
            // « indisponible ». La production réelle sert la base et n'a pas
            // cette variable.
            ALLOW_FILE_PUBLICATION_STORE: "true",
            FINANCE_HUB_USE_DATABASE: "false",
            FINANCE_HUB_PUBLIC_DEMO: "false",
            LEARNING_HUB_AUTH_ENABLED: "false",
            AI_PROVIDER: "none",
            // Ouvre l'espace de relecture pour l'exercer en e2e. Sans comptes,
            // le propriétaire de l'installation privée est administrateur : le
            // serveur public-demo, lui, laisse le drapeau absent, ce qui permet
            // de vérifier que l'espace est fermé par défaut.
            CONTENT_REVIEW_ENABLED: "true",
            // `next start` tourne en NODE_ENV=production : sans cet aveu
            // explicite, le garde de `lib/env.ts` refuserait de démarrer — ce
            // qui est précisément son rôle sur un hôte joignable par d'autres.
            CONTENT_REVIEW_ALLOW_UNAUTHENTICATED: "true"
          }
        },
        {
          command: `corepack pnpm --filter @finance/web start --port ${PUBLIC_DEMO_PORT}`,
          url: publicDemoBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            FINANCE_HUB_USE_DATABASE: "false",
            FINANCE_HUB_PUBLIC_DEMO: "true",
            LEARNING_HUB_AUTH_ENABLED: "false",
            AI_PROVIDER: "none"
          }
        },
        ...(authDatabaseUrl
          ? [
              {
                command: `corepack pnpm --filter @finance/web start --port ${AUTH_PORT}`,
                url: authBaseURL,
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
                env: {
                  DATABASE_URL: authDatabaseUrl,
                  FINANCE_HUB_USE_DATABASE: "true",
                  FINANCE_HUB_PUBLIC_DEMO: "false",
                  LEARNING_HUB_AUTH_ENABLED: "true",
                  // Personne ne s'inscrit avec cette adresse : tout compte créé
                  // par la suite est non-administrateur, ce que les specs de
                  // navigation utilisent pour vérifier le masquage de
                  // l'espace Administration.
                  LEARNING_HUB_ADMIN_EMAILS: "admin-owner@example.test",
                  AI_PROVIDER: "none"
                }
              }
            ]
          : [])
      ]
});
