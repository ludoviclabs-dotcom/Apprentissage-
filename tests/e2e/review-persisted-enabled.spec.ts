import { expect, test, type Page } from "@playwright/test";

/**
 * Le mode authentifié n'a pas bougé — vérifié séparément, contre PostgreSQL.
 *
 * PR-20 introduit un second mode d'auto-évaluation (local, non persisté) dans le
 * même composant que le mode historique. Le risque exact est là : un
 * `mode` mal résolu ferait basculer un compte réel sur la branche locale, et la
 * révision d'un apprenant disparaîtrait sans erreur — silencieusement, ce qui
 * est la pire forme de régression pour un planificateur.
 *
 * Ces tests exigent des comptes et une base : seul le projet `authenticated` les
 * exécute, et il n'existe que si `PLAYWRIGHT_AUTH_DATABASE_URL` est fourni.
 */

const STRONG_PASSWORD = "correct horse battery staple";

function emailFor(workerIndex: number, label: string): string {
  return `${label}-${workerIndex}@example.test`;
}

async function signUp(page: Page, email: string, password = STRONG_PASSWORD) {
  await page.goto("/signup");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);

  const pendingSignup = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/signup") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "Créer le compte" }).click();

  expect((await pendingSignup).status(), `signup for ${email}`).toBe(201);
  await page.waitForURL((url) => !url.pathname.startsWith("/signup"));
}

test("a signed-in learner still rates through the server, on the documented ladder", async ({
  page
}, testInfo) => {
  await signUp(page, emailFor(testInfo.workerIndex, "review-persisted"));

  await page.goto("/revisions");

  const card = page.locator("article.flashcard").first();

  // La carte est en mode persisté : c'est la condition de tout le reste.
  await expect(card).toHaveAttribute("data-mode", "persisted");

  await card.getByRole("button", { name: "Afficher la réponse" }).click();
  await expect(card.getByText("Réponse attendue")).toBeVisible();

  const pending = page.waitForResponse(
    (response) =>
      response.url().includes("/api/revisions/review") && response.request().method() === "POST"
  );

  await card.getByRole("button", { name: "Su", exact: true }).click();

  expect((await pending).status()).toBe(200);

  // L'échelle n'a pas changé, et la carte annonce une vraie date, pas une
  // simulation.
  await expect(card.getByText(/Prochaine révision : \d{4}-\d{2}-\d{2} \(dans 7 jours\)/)).toBeVisible();
  await expect(card.getByText("Simulation :")).toHaveCount(0);
  await expect(card.getByText("Évaluation temporaire — non enregistrée")).toHaveCount(0);
  await expect(card.getByText("non enregistrée")).toHaveCount(0);
});

test("a failed review still schedules J+1 and opens a remediation", async ({ page }, testInfo) => {
  await signUp(page, emailFor(testInfo.workerIndex, "review-remediation"));

  await page.goto("/revisions");

  const card = page.locator("article.flashcard").first();

  await card.getByRole("button", { name: "Afficher la réponse" }).click();
  await card.getByRole("button", { name: "Pas su" }).click();

  await expect(card.getByText(/Prochaine révision : \d{4}-\d{2}-\d{2} \(dans 1 jour\)/)).toBeVisible();
  await expect(card.getByText("Remédiation créée")).toBeVisible();
  await expect(card.getByText(/Retest prévu le \d{4}-\d{2}-\d{2}/)).toBeVisible();
});

test("the rating survives a reload, which is what the demo mode cannot do", async ({
  page
}, testInfo) => {
  await signUp(page, emailFor(testInfo.workerIndex, "review-durable"));

  await page.goto("/revisions");

  const card = page.locator("article.flashcard").first();
  const itemRef = await card.getAttribute("data-item-ref");

  await card.getByRole("button", { name: "Afficher la réponse" }).click();
  await card.getByRole("button", { name: "Très facile" }).click();
  await expect(card.getByText(/dans 14 jours/)).toBeVisible();

  await page.reload();

  // Repoussé de quatorze jours : l'item n'est plus dû, donc plus dans la file.
  // C'est la preuve que l'écriture a eu lieu — un état de composant aurait
  // disparu au rechargement et la carte serait revenue à l'identique.
  await expect(page.locator(`article.flashcard[data-item-ref="${itemRef}"]`)).toHaveCount(0);
});

test("the error journal is the learner's own, not the demonstration examples", async ({
  page
}, testInfo) => {
  await signUp(page, emailFor(testInfo.workerIndex, "carnet-personnel"));

  await page.goto("/revisions/carnet-erreurs");

  await expect(page.locator(".topbar-context strong")).toHaveText("Carnet d'erreurs");

  // Le titre personnel, et surtout aucune entrée de démonstration attribuée.
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    "Exemple de carnet d'erreurs"
  );
  await expect(page.locator('[data-testid="error-journal-examples"]')).toHaveCount(0);
  await expect(page.getByText("Exemple de démonstration")).toHaveCount(0);
});

/**
 * RLS, vue de l'extérieur : deux comptes, deux carnets. La page lit
 * `getErrorJournal(user.id)`, qui passe par `withUserContext` — un carnet qui
 * fuirait ici serait une régression d'isolation, pas un défaut d'affichage.
 */
test("one learner never sees another's error journal", async ({ browser }, testInfo) => {
  const first = await browser.newContext();
  const second = await browser.newContext();

  try {
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();

    await signUp(firstPage, emailFor(testInfo.workerIndex, "carnet-rls-a"));
    await signUp(secondPage, emailFor(testInfo.workerIndex, "carnet-rls-b"));

    // Le premier échoue un exercice : cela ouvre une entrée dans SON carnet.
    await firstPage.goto("/revisions");
    const card = firstPage.locator("article.flashcard").first();
    await card.getByRole("button", { name: "Afficher la réponse" }).click();
    await card.getByRole("button", { name: "Pas su" }).click();
    await expect(card.getByText("Remédiation créée")).toBeVisible();

    // Le second ne voit rien de tout cela.
    await secondPage.goto("/revisions");
    await expect(secondPage.locator("article.flashcard").first()).toBeVisible();

    const remediations = secondPage.getByText("Remédiation créée");
    await expect(remediations).toHaveCount(0);
  } finally {
    await first.close();
    await second.close();
  }
});
