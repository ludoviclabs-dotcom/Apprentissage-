import { expect, test, type Page } from "@playwright/test";

/**
 * PR-10 : système visuel, motion et accessibilité.
 *
 * Les captures de référence sont attachées au rapport plutôt que comparées
 * pixel à pixel : une comparaison inter-OS (dev Windows, CI Linux) casserait
 * sur le rendu des polices sans dire quoi que ce soit d'utile.
 */

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 780 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1920", width: 1920, height: 1080 }
] as const;

/** Pages représentatives : accueil, listing, formulaire riche, tableau large. */
const KEY_PAGES = ["/", "/exercices", "/revisions", "/modules/comptabilite-generale"] as const;

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("responsive : aucun débordement horizontal global", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const path of KEY_PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const overflow = await horizontalOverflow(page);
        expect(overflow, `${path} @ ${viewport.name} px déborde de ${overflow}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});

test.describe("captures de référence", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const path of KEY_PAGES) {
    test(`référence ${path}`, async ({ page }, testInfo) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`reference-${path.replace(/\W+/g, "-") || "home"}`, {
        body: screenshot,
        contentType: "image/png"
      });
    });
  }
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

  test("le drawer reste pleinement fonctionnel sans animation", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Ouvrir le menu de navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu de navigation" });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("button", { name: "Ouvrir le menu de navigation" })).toBeFocused();
  });

  test("une soumission d'exercice aboutit sans dépendre du mouvement", async ({ page }) => {
    await page.goto("/exercices");

    const answer = page.locator("textarea").first();
    await answer.fill("Le fait générateur commande le rattachement : produit constaté d'avance.");
    await page.getByRole("button", { name: "Corriger" }).first().click();

    await expect(page.getByText(/Score \d+([.,]\d+)?\/20/).first()).toBeVisible();
  });
});

test.describe("feedback et aria-live", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("la correction est annoncée dans une région status", async ({ page }) => {
    await page.goto("/exercices");

    const form = page.locator(".action-form").first();
    const status = form.locator('[role="status"].sr-only');
    await expect(status).toBeAttached();
    await expect(status).toHaveText("");

    await form.locator("textarea").fill("Réponse structurée : fait, règle, traitement, conclusion.");
    await form.getByRole("button", { name: "Corriger" }).click();

    // La région passe par « en cours » puis annonce le score reçu.
    await expect(status).toHaveText(/Correction (en cours|reçue : \d+([.,]\d+)? sur 20)\./);
    await expect(status).toHaveText(/Correction reçue : \d+([.,]\d+)? sur 20\./);

    // Le panneau visible porte le même score : l'annonce ne diverge pas de l'écran.
    await expect(form.getByText(/Score \d+([.,]\d+)?\/20/)).toBeVisible();
  });

  test("les sources se replient et s'ouvrent au clavier", async ({ page }) => {
    await page.goto("/cours");

    const summary = page.locator(".source-panel summary").first();
    await expect(summary).toBeVisible();
    await expect(summary).toHaveText(/\d+ sources? citées?/);

    const body = page.locator(".source-panel .source-row").first();
    await expect(body).toBeHidden();

    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(body).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(body).toBeHidden();
  });
});

test.describe("états", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("empty : une recherche sans résultat l'explique et reste utile", async ({ page }) => {
    await page.goto("/recherche?q=zzzzzzzzzz");

    await expect(page.locator(".empty-state")).toBeVisible();
    await expect(page.getByText("Aucun résultat")).toBeVisible();
  });

  test("locked : un niveau verrouillé énonce sa condition d'ouverture", async ({ page }) => {
    await page.goto("/modules/comptabilite-generale");

    const locked = page.locator(".locked-state").first();
    await expect(locked).toBeVisible();
    await expect(locked).toContainText("Termine le niveau 1 pour ouvrir celui-ci.");
  });

  test("error : une réponse trop courte laisse le bouton désactivé avant l'envoi", async ({ page }) => {
    await page.goto("/exercices");

    const form = page.locator(".action-form").first();
    await form.locator("textarea").fill("court");
    await expect(form.getByRole("button", { name: "Corriger" })).toBeDisabled();
  });

  test("success : une écriture équilibrée est graduée et annoncée", async ({ page }) => {
    await page.goto("/modules/comptabilite-generale/exercices/ex-cgv1-achat-marchandises");

    // L'écriture attendue par l'énoncé : achat 607 / TVA 44566 / fournisseur 401.
    await page.getByLabel("Compte ligne 1").fill("607");
    await page.getByLabel("Débit ligne 1").fill("1200");
    await page.getByLabel("Compte ligne 2").fill("44566");
    await page.getByLabel("Débit ligne 2").fill("240");
    await page.getByLabel("Compte ligne 3").fill("401");
    await page.getByLabel("Crédit ligne 3").fill("1440");

    await expect(page.getByTestId("journal-balance")).toHaveText("Équilibrée");
    await page.getByRole("button", { name: "Corriger" }).click();

    await expect(page.getByText(/Score \d+([.,]\d+)?\/20/).first()).toBeVisible();
  });
});
