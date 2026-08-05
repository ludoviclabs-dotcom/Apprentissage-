import { expect, test, type Page } from "@playwright/test";

/**
 * PR-09 : architecture de navigation.
 *
 * Le projet `chromium` couvre l'installation privée sans comptes (le
 * propriétaire voit l'AppShell et l'administration). Le projet `public-demo`
 * couvre le PublicShell : pas d'administration, pas de score personnel.
 */

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 390, height: 844 };

async function openDrawer(page: Page) {
  await page.getByRole("button", { name: "Ouvrir le menu de navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Menu de navigation" })).toBeVisible();
}

test.describe("sidebar desktop", () => {
  test.use({ viewport: DESKTOP });

  test("expose cinq destinations principales au maximum", async ({ page }) => {
    await page.goto("/");

    const sidebar = page.locator("aside.sidebar");
    await expect(sidebar).toBeVisible();

    const primary = sidebar.locator(".nav-item, .nav-section-toggle");
    await expect(primary).toHaveCount(5);

    // Le bouton de menu mobile n'a rien à faire sur desktop.
    await expect(page.getByRole("button", { name: "Ouvrir le menu de navigation" })).toBeHidden();
  });

  test("marque l'état actif d'une route imbriquée sans perdre la section", async ({ page }) => {
    await page.goto("/modules/excel-finance-lab");

    const sidebar = page.locator("aside.sidebar");
    const modulesLink = sidebar.getByRole("link", { name: "Modules" });

    await expect(modulesLink).toBeVisible();
    await expect(modulesLink).toHaveAttribute("aria-current", "true");

    // La section porteuse est dépliée et signalée.
    const apprendreToggle = sidebar.getByRole("button", { name: "Apprendre" });
    await expect(apprendreToggle).toHaveAttribute("aria-expanded", "true");
  });

  test("marque la route exacte avec aria-current=page", async ({ page }) => {
    await page.goto("/exercices");

    const exercicesLink = page.locator("aside.sidebar").getByRole("link", { name: "Exercices" });
    await expect(exercicesLink).toHaveAttribute("aria-current", "page");
  });

  /**
   * Le défaut s'est inversé avec la refonte du chrome : l'arborescence entière
   * est visible à l'arrivée. Ce que ce test protège n'a pas changé — le repli
   * existe toujours, et il reste actionnable au clavier comme à la souris. Une
   * sidebar dont les entêtes seraient de simples libellés, comme la maquette
   * les dessine, ferait échouer ceci.
   */
  test("déplie les sections par défaut et les replie au clic", async ({ page }) => {
    await page.goto("/");

    const sidebar = page.locator("aside.sidebar");
    const entrainerToggle = sidebar.getByRole("button", { name: "S'entraîner" });

    await expect(entrainerToggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar.getByRole("link", { name: "Exercices" })).toBeVisible();

    await entrainerToggle.click();

    await expect(entrainerToggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar.getByRole("link", { name: "Exercices" })).toBeHidden();
  });

  /**
   * Les cinq destinations principales de PR-09 survivent à la refonte : les
   * entêtes de section ressemblent à des intitulés, mais ce sont toujours cinq
   * cibles — Accueil plus quatre groupes — pas dix-huit liens de même rang.
   */
  test("garde cinq cibles de premier rang malgré l'arborescence ouverte", async ({ page }) => {
    await page.goto("/");

    const sidebar = page.locator("aside.sidebar");

    await expect(sidebar.locator(".nav-item, .nav-section-toggle")).toHaveCount(5);
    await expect(sidebar.locator(".nav-section-toggle[aria-expanded]")).toHaveCount(4);
  });
});

test.describe("topbar contextuelle", () => {
  test.use({ viewport: DESKTOP });

  test("affiche la rubrique et le titre spécifiques à la route", async ({ page }) => {
    await page.goto("/exercices");
    await expect(page.locator(".topbar-context strong")).toHaveText("Exercices");
    await expect(page.locator(".topbar-breadcrumb")).toContainText("S'entraîner");

    await page.goto("/revisions");
    await expect(page.locator(".topbar-context strong")).toHaveText("Session du jour");

    await page.goto("/modules/excel-finance-lab");
    await expect(page.locator(".topbar-context strong")).toHaveText("Excel Finance Lab");
    await expect(page.locator(".topbar-breadcrumb")).toContainText("Apprendre");
  });

  test("porte la recherche globale et navigue vers /recherche", async ({ page }) => {
    await page.goto("/exercices");

    await page.getByLabel("Recherche globale").fill("provision");
    await page.getByLabel("Recherche globale").press("Enter");

    await expect(page).toHaveURL(/\/recherche\?q=provision/);
  });

  test("place l'offre dans le menu du compte", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "public-demo", "le PublicShell n'a pas de menu de compte");
    await page.goto("/");

    await page.getByRole("button", { name: "Compte" }).click();
    const panel = page.locator("#account-menu-panel");

    await expect(panel.getByRole("link", { name: "Offre & facturation" })).toBeVisible();
    await panel.getByRole("link", { name: "Offre & facturation" }).click();
    await expect(page).toHaveURL(/\/billing/);
  });
});

test.describe("administration selon le rôle", () => {
  test.use({ viewport: DESKTOP });

  test("le propriétaire d'une installation privée voit l'espace Administration", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "public-demo", "couvert par le scénario public");

    await page.goto("/");

    const sidebar = page.locator("aside.sidebar");
    await expect(sidebar.getByText("Administration")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Documents" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Source packs" })).toBeVisible();

    await page.goto("/documents");
    await expect(page.locator(".topbar-breadcrumb")).toContainText("Administration");
  });
});

test.describe("drawer mobile", () => {
  test.use({ viewport: MOBILE });

  test("remplace la bande horizontale par un menu accessible", async ({ page }) => {
    await page.goto("/");

    // La sidebar disparaît, le header compact prend le relais.
    await expect(page.locator("aside.sidebar")).toBeHidden();
    await expect(page.getByRole("button", { name: "Ouvrir le menu de navigation" })).toBeVisible();

    // Aucun débordement horizontal : l'écran de 390 px contient la page.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE.width + 1);
  });

  test("ouvre, navigue au clavier, ferme à Échap et restaure le focus", async ({ page }) => {
    await page.goto("/");
    await openDrawer(page);

    // Le focus arrive sur le bouton de fermeture.
    await expect(page.getByRole("button", { name: "Fermer le menu de navigation" })).toBeFocused();

    // Le focus reste piégé dans le drawer, dans les deux sens.
    await page.keyboard.press("Shift+Tab");
    const trappedBack = await page.evaluate(
      () => document.activeElement?.closest("#mobile-drawer") !== null
    );
    expect(trappedBack).toBe(true);

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");
    }
    const trappedForward = await page.evaluate(
      () => document.activeElement?.closest("#mobile-drawer") !== null
    );
    expect(trappedForward).toBe(true);

    // Échap ferme et rend le focus au bouton d'ouverture.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu de navigation" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Ouvrir le menu de navigation" })).toBeFocused();
  });

  test("navigue vers une sous-section puis referme le drawer", async ({ page }) => {
    await page.goto("/");
    await openDrawer(page);

    const drawer = page.getByRole("dialog", { name: "Menu de navigation" });
    // Plus de dépliage préalable : le drawer partage `SidebarNav`, donc il
    // ouvre lui aussi ses sections par défaut. Le lien est atteignable
    // directement.
    await drawer.getByRole("link", { name: "Exercices" }).click();

    await expect(page).toHaveURL(/\/exercices/);
    await expect(drawer).toBeHidden();
  });
});

test.describe("tablette", () => {
  test.use({ viewport: TABLET });

  test("768 px : navigation compacte sans bande horizontale", async ({ page }) => {
    await page.goto("/parcours");

    await expect(page.locator("aside.sidebar")).toBeHidden();
    await expect(page.getByRole("button", { name: "Ouvrir le menu de navigation" })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(TABLET.width + 1);
  });
});

test.describe("démonstration publique", () => {
  test.use({ viewport: DESKTOP });

  test("n'expose ni administration ni branding privé", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", "requires the dedicated public-demo server");
    await page.goto("/");

    const sidebar = page.locator("aside.sidebar");
    await expect(sidebar.getByRole("link", { name: "Documents" })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: "Source packs" })).toHaveCount(0);
    await expect(sidebar).not.toContainText("Administration");
    await expect(sidebar).not.toContainText("Local-first privé");
    await expect(sidebar).toContainText("Démonstration publique");
  });

  test("ne présente jamais un score seedé comme personnel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", "requires the dedicated public-demo server");
    await page.goto("/");

    await expect(page.getByText("Niveau global")).toHaveCount(0);
    await expect(page.getByText("Jeu de démonstration", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Essayer la démonstration/ })).toBeVisible();
    await expect(page.getByLabel("Niveau par domaine")).toHaveCount(0);
    await expect(page.getByText("À traiter cette semaine")).toHaveCount(0);
    await expect(page.getByText("Rien n'est dû aujourd'hui")).toHaveCount(0);
  });

  test("garde les routes documentaires accessibles en accès direct", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", "requires the dedicated public-demo server");
    // Masquer un lien n'est pas supprimer une fonctionnalité : la route répond
    // toujours, en lecture seule.
    const response = await page.goto("/documents");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
