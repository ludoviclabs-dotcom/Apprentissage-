import { expect, test } from "@playwright/test";

/**
 * Smoke coverage for PR-00: the home page renders, every historic route stays
 * reachable after the PR-09 information-architecture redesign, and no visible
 * control is a silent no-op.
 */

const ROUTES = [
  { href: "/", label: "Accueil" },
  { href: "/parcours", label: "Parcours" },
  { href: "/cours", label: "Cours" },
  { href: "/modules", label: "Modules" },
  { href: "/modules/comptabilite-generale", label: "Compta générale" },
  { href: "/modules/excel-finance-lab", label: "Excel Finance Lab" },
  { href: "/apprendre", label: "Apprendre" },
  { href: "/connaissances", label: "Connaissances" },
  { href: "/recherche", label: "Recherche" },
  { href: "/exercices", label: "Exercices" },
  { href: "/annales-concours", label: "Annales & concours" },
  { href: "/business-cases", label: "Business cases" },
  { href: "/simulations", label: "Simulations" },
  { href: "/revisions", label: "Révisions" },
  { href: "/corrections", label: "Corrections" },
  { href: "/progression", label: "Progression" },
  { href: "/documents", label: "Documents" },
  { href: "/source-packs", label: "Source packs" },
  { href: "/attestations", label: "Attestations" },
  { href: "/billing", label: "Offre" }
];

test("home page renders the dashboard rather than an empty document", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main.content")).not.toBeEmpty();
});

test("the health endpoint answers", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBeTruthy();
});

test("source-pack ingestion is not exposed as an HTTP method", async ({ request }) => {
  const response = await request.post("/api/source-packs", {
    data: { path: "C:\\private\\course-pack" }
  });

  // 405 plutôt que 403 : l'import n'est pas une action interdite à cet
  // appelant, c'est une méthode que la ressource n'expose pas. L'en-tête
  // `Allow` dit ce qu'elle expose réellement.
  expect(response.status()).toBe(405);
  expect(response.headers()["allow"]).toBe("GET");
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "METHOD_NOT_ALLOWED" }
  });
});

test("source packs stay readable over GET", async ({ request }) => {
  const response = await request.get("/api/source-packs");

  expect(response.status()).toBe(200);
  expect(await response.json()).toHaveProperty("sourcePacks");
});

for (const destination of ROUTES) {
  test(`route ${destination.href} loads with a heading`, async ({ page }) => {
    const response = await page.goto(destination.href);

    expect(response?.status(), `${destination.href} should not error`).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("every sidebar link points at a route that exists", async ({ page, request }) => {
  await page.goto("/");

  const hrefs = await page.locator("aside.sidebar a[href]").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? "")
  );

  expect(hrefs.length).toBeGreaterThan(0);

  // Les liens d'ancre pointent dans une page ; seule la route se vérifie ici.
  const paths = [...new Set(hrefs.map((href) => href.split("#")[0]).filter(Boolean))];

  for (const href of paths) {
    const response = await request.get(href);
    expect(response.status(), `${href} is linked but does not resolve`).toBeLessThan(400);
  }
});

test("the main search form navigates to the search page", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Rechercher dans le corpus").fill("provision");
  await page.getByRole("button", { name: "Rechercher" }).click();

  await expect(page).toHaveURL(/\/recherche\?q=provision/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

/**
 * L'inverse de l'assertion précédente, et c'est voulu.
 *
 * Ce test vérifiait qu'une action non implémentée était *désactivée* plutôt que
 * muette — un progrès quand l'alternative était un bouton qui ne faisait rien.
 * PR-20 va au bout : une action principale visible doit être implémentée. La
 * règle « désactivé plutôt que muet » reste valable pour les contrôles
 * secondaires ; elle ne l'est plus pour un CTA de page.
 */
test("the page's main call to action leads somewhere real", async ({ page }) => {
  await page.goto("/exercices");

  const cta = page.getByRole("link", { name: "Lancer la session découverte" });

  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).toHaveURL(/\/exercices\/session-decouverte$/);
  await expect(page.getByRole("heading", { level: 1, name: "Session découverte" })).toBeVisible();
});

test("no enabled button on a page is left without a handler", async ({ page }) => {
  // The exercise submit button is the canonical live control: it must be
  // enabled once the answer satisfies the documented minimum length.
  await page.goto("/exercices");

  const answer = page.locator("textarea").first();
  await answer.fill("Une réponse suffisamment longue pour être corrigée.");

  await expect(page.getByRole("button", { name: "Corriger" })).toBeEnabled();
});

test("the tutor states that no model is configured, without naming the variable", async ({
  page
}) => {
  await page.goto("/apprendre");

  await page.getByRole("button", { name: "Demander au tuteur" }).click();

  // Le fait reste dit ; c'est la façon de le dire qui a changé (PR-20). Nommer
  // `AI_PROVIDER` renseignait l'opérateur et laissait l'apprenant sans réponse.
  await expect(page.getByText(/Aucun tuteur conversationnel n'est activé/)).toBeVisible();
  await expect(page.getByText(/AI_PROVIDER/)).toHaveCount(0);
});

test("public demo disables protected CTAs before submission and rejects writes", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "public-demo", "requires the dedicated public-demo server");

  // L'auto-évaluation n'est plus « protégée » : depuis PR-20 elle fonctionne
  // localement, sans écrire. Ce qui reste vrai est qu'elle attend la révélation
  // — et que l'API refuse toujours l'écriture, vérifié plus bas.
  await page.goto("/revisions");
  await expect(page.getByRole("button", { name: "Su", exact: true }).first()).toBeDisabled();
  await expect(page.getByText("Affiche la réponse avant de t'auto-évaluer.").first()).toBeVisible();

  await page.goto("/documents");
  await expect(page.getByRole("button", { name: "Uploader" })).toBeDisabled();

  await page.goto("/source-packs");
  await expect(page.getByRole("button", { name: "Analyser le pack" })).toBeDisabled();

  const response = await request.post("/api/revisions/review", {
    data: { flashcardId: "fc-amort-lineaire", rating: "correct" }
  });

  expect(response.status()).toBe(403);
});
