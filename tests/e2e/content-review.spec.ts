import { expect, test } from "@playwright/test";

/**
 * Espace privé de relecture des contenus générés.
 *
 * Les brouillons vivent sous `data/generated/drafts/`, git-ignoré : ils peuvent
 * être absents (CI, poste neuf). Les assertions structurelles — accès, filtres,
 * absence de publication — sont donc jouées dans tous les cas, et celles qui
 * portent sur un contenu précis ne le sont que si la file n'est pas vide.
 */

const DESKTOP = { width: 1440, height: 900 };

test.use({ viewport: DESKTOP });

test.describe("relecture des contenus", () => {
  test("est fermée par défaut sur une instance sans le drapeau", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "public-demo",
      "exige le serveur public-demo, qui ne définit pas CONTENT_REVIEW_ENABLED"
    );

    const response = await page.goto("/admin/content-review");

    // 404 plutôt que 403 : répondre « interdit » confirmerait que l'espace existe.
    expect(response?.status()).toBe(404);
  });

  test("s'ouvre sur l'installation privée et annonce qu'aucun contenu n'est publié", async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "exige le serveur de l'installation privée");

    await page.goto("/admin/content-review");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Relecture des contenus");
    await expect(page.locator(".page-header")).toContainText("Aucun de ces contenus n'est publié");
    await expect(page.locator(".topbar-breadcrumb")).toContainText("Administration");

    // Aucune action de publication n'existe dans ce lot.
    await expect(page.getByRole("button", { name: /publier/i })).toHaveCount(0);
  });

  test("expose les filtres de la file de relecture", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "exige le serveur de l'installation privée");

    await page.goto("/admin/content-review");

    for (const label of ["Chapitre", "Type", "Statut", "Qualité minimale", "Titre contient"]) {
      await expect(page.getByLabel(label)).toBeVisible();
    }

    await expect(page.getByRole("button", { name: "Appliquer" })).toBeVisible();
  });

  test("ouvre un brouillon avec ses sources et ses contrôles", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "exige le serveur de l'installation privée");

    await page.goto("/admin/content-review");

    const firstDraft = page.locator("table.review-table tbody tr a").first();

    if ((await firstDraft.count()) === 0) {
      test.skip(true, "aucun brouillon généré sur cette instance — lancer pnpm content:generate");
    }

    await firstDraft.click();

    await expect(page.getByRole("heading", { name: "Sources citées" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contrôles déterministes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Relancer la validation" })).toBeVisible();

    // Le document source lui-même n'est jamais servi, et aucun chemin privé ne
    // doit apparaître dans la page.
    const body = (await page.content()).toLowerCase();
    expect(body).not.toContain("c:\\users");
    expect(body).not.toContain("/home/");
    expect(body).not.toContain(".pdf");
  });

  test("refuse une transition interdite et n'offre aucune publication", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "exige le serveur de l'installation privée");

    await page.goto("/admin/content-review");
    const firstDraft = page.locator("table.review-table tbody tr a").first();

    if ((await firstDraft.count()) === 0) {
      test.skip(true, "aucun brouillon généré sur cette instance");
    }

    const href = await firstDraft.getAttribute("href");
    const draftId = href?.split("/").pop() ?? "";

    // Un contenu en attente de revue ne peut pas repasser en brouillon :
    // la machine à états l'interdit, et le serveur le fait respecter.
    const refused = await page.request.post("/api/admin/content-review", {
      data: { action: "reopenDraft", draftId }
    });

    expect(refused.status()).toBe(409);
    expect(await refused.text()).toContain("Transition refusée");

    // Aucune action de publication n'est exposée par la route.
    const unknown = await page.request.post("/api/admin/content-review", {
      data: { action: "publishDraft", draftId }
    });

    expect(unknown.status()).toBe(400);
  });

  test("approuve un contenu qui passe les contrôles, puis le verrouille", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "exige le serveur de l'installation privée");

    await page.goto("/admin/content-review?statut=needs_review");
    const firstDraft = page.locator("table.review-table tbody tr a").first();

    if ((await firstDraft.count()) === 0) {
      test.skip(true, "aucun brouillon à relire sur cette instance");
    }

    await firstDraft.click();
    await page.getByRole("button", { name: "Approuver" }).click();

    await expect(page.locator(".review-badges")).toContainText("Approuvé");

    // Un contenu approuvé n'est plus modifiable, et il n'est pas publié.
    await expect(page.getByText("Ce contenu est approuvé")).toBeVisible();
    await expect(page.getByText("Il n'est pas publié")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approuver" })).toHaveCount(0);
  });

  test("ne déborde jamais horizontalement", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "exige le serveur de l'installation privée");

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/content-review");

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );

      expect(overflow, `débordement horizontal à ${width}px`).toBe(false);
    }
  });
});
