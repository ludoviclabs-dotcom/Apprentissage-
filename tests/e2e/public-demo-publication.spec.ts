import { expect, test } from "@playwright/test";

/**
 * Le serveur de démonstration publique n'a **aucun** magasin de contenu publié.
 *
 * C'est exactement la posture d'une production mal ou pas encore configurée :
 * ni base (`FINANCE_HUB_USE_DATABASE=false`), ni magasin de fichiers
 * (`ALLOW_FILE_PUBLICATION_STORE` absent, et `next start` tourne en
 * `NODE_ENV=production`). Ces specs vérifient ce qui arrive alors — et surtout
 * ce qui n'arrive pas.
 *
 * L'autre moitié est dans `compta-approfondie.spec.ts`, que le projet
 * `public-demo` ignore : elle décrit un chapitre réellement publié.
 */

const DEMO_ONLY = "décrit le serveur de démonstration publique";

test.describe("démonstration publique sans magasin publié", () => {
  test("le module répond, mais n'annonce aucun chapitre disponible", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", DEMO_ONLY);

    await page.goto("/modules/comptabilite-approfondie");

    await expect(page.getByRole("heading", { level: 1, name: "Comptabilité approfondie" })).toBeVisible();

    // Pas de repli sur les fixtures : aucun chapitre n'est proposé.
    await expect(page.getByRole("link", { name: "Emprunts obligataires" })).toHaveCount(0);
  });

  test("ne sert aucun contenu de fixture", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", DEMO_ONLY);

    await page.goto("/modules/comptabilite-approfondie");

    const html = await page.content();

    // Les fixtures e2e sont préfixées : si l'une d'elles apparaissait ici, c'est
    // qu'un magasin de test aurait été sélectionné par défaut.
    expect(html).not.toContain("[Fixture e2e]");
    expect(html).not.toContain("e2e-pack");
    expect(html).not.toContain("e2e-draft");
  });

  test("le chapitre pilote n'est pas consultable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", DEMO_ONLY);

    const response = await page.goto(
      "/modules/comptabilite-approfondie/emprunts-obligataires"
    );

    // 404 ou 200 « indisponible », selon la raison — mais jamais un chapitre
    // rendu avec du contenu.
    const html = await page.content();

    expect(html).not.toContain("Questions de rappel actif");
    expect(html).not.toContain("[Fixture e2e]");
    expect(response?.status()).not.toBe(500);
  });

  test("l'espace de relecture reste fermé", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", DEMO_ONLY);

    const response = await page.goto("/admin/content-review");

    // 404 plutôt que 403 : répondre « interdit » confirmerait que l'espace
    // existe. `CONTENT_REVIEW_ENABLED` est absent sur ce serveur.
    expect(response?.status()).toBe(404);
  });

  test("l'API d'activités ne sert aucun contenu", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", DEMO_ONLY);

    const response = await request.post("/api/apprentissage/activites", {
      data: {
        action: "reveal",
        chapter: "emprunts-obligataires",
        artifactId: "pub-flashcard-emprunts-obligataires-carte-v1"
      }
    });

    // 503 quand aucun magasin n'est configuré, 404 quand le contenu n'existe
    // pas : les deux sont corrects, 500 ne l'est pas — une erreur interne
    // exposerait un état de configuration.
    expect([404, 503]).toContain(response.status());

    const body = await response.text();

    expect(body).not.toContain("[Fixture e2e]");
    expect(body).not.toContain("promptId");
  });

  test("la publication est refusée", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", DEMO_ONLY);

    const response = await request.post("/api/admin/content-publication", {
      data: { action: "publish", draftId: "e2e-draft-sheet", confirmed: true }
    });

    // Démo publique : les écritures sont bloquées en amont de toute garde.
    expect([403, 404]).toContain(response.status());
  });
});
