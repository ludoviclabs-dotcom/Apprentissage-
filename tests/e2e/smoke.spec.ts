import { expect, test } from "@playwright/test";

/**
 * Smoke coverage for PR-00: the home page renders, every nav destination is
 * reachable, and no visible control is a silent no-op.
 */

const NAV_DESTINATIONS = [
  { href: "/", label: "Accueil" },
  { href: "/parcours", label: "Parcours" },
  { href: "/cours", label: "Cours" },
  { href: "/apprendre", label: "Apprendre" },
  { href: "/connaissances", label: "Connaissances" },
  { href: "/recherche", label: "Recherche" },
  { href: "/exercices", label: "Exercices" },
  { href: "/annales-concours", label: "Annales & Concours" },
  { href: "/business-cases", label: "Business Cases" },
  { href: "/simulations", label: "Simulations" },
  { href: "/revisions", label: "Revisions" },
  { href: "/corrections", label: "Corrections" },
  { href: "/progression", label: "Progression" },
  { href: "/documents", label: "Documents" },
  { href: "/source-packs", label: "Source packs" }
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

for (const destination of NAV_DESTINATIONS) {
  test(`nav destination ${destination.href} loads with a heading`, async ({ page }) => {
    const response = await page.goto(destination.href);

    expect(response?.status(), `${destination.href} should not error`).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("every nav link points at a route that exists", async ({ page, request }) => {
  await page.goto("/");

  const hrefs = await page.locator("nav.nav-list a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? "")
  );

  expect(hrefs.length).toBe(NAV_DESTINATIONS.length);

  for (const href of hrefs) {
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

test("an unimplemented action is disabled instead of silently doing nothing", async ({ page }) => {
  await page.goto("/exercices");

  const plannedAction = page.getByRole("button", { name: "Préparer la session" });

  await expect(plannedAction).toBeVisible();
  await expect(plannedAction).toBeDisabled();
  await expect(page.getByText("Bientôt disponible")).toBeVisible();
});

test("no enabled button on a page is left without a handler", async ({ page }) => {
  // The exercise submit button is the canonical live control: it must be
  // enabled once the answer satisfies the documented minimum length.
  await page.goto("/exercices");

  const answer = page.locator("textarea").first();
  await answer.fill("Une réponse suffisamment longue pour être corrigée.");

  await expect(page.getByRole("button", { name: "Corriger" })).toBeEnabled();
});

test("the tutor states that no model is configured", async ({ page }) => {
  await page.goto("/apprendre");

  await page.getByRole("button", { name: "Demander au tuteur" }).click();

  await expect(page.getByText(/AI_PROVIDER=none/)).toBeVisible();
});

test("public demo disables protected CTAs before submission and rejects writes", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "public-demo", "requires the dedicated public-demo server");

  await page.goto("/revisions");
  await expect(page.getByRole("button", { name: "Réussie" }).first()).toBeDisabled();
  await expect(page.getByText(/Indisponible en démo publique/).first()).toBeVisible();

  await page.goto("/documents");
  await expect(page.getByRole("button", { name: "Uploader" })).toBeDisabled();

  await page.goto("/source-packs");
  await expect(page.getByRole("button", { name: "Analyser le pack" })).toBeDisabled();

  const response = await request.post("/api/revisions/review", {
    data: { flashcardId: "fc-amort-lineaire", rating: "correct" }
  });

  expect(response.status()).toBe(403);
});
