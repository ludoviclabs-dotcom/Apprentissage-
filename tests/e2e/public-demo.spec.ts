import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * PR-20 : le mode découverte, vu du navigateur.
 *
 * Ces tests tournent sur les deux serveurs sans base : `chromium` (installation
 * privée seedée) et `public-demo` (`FINANCE_HUB_PUBLIC_DEMO=true`). Ce qui
 * dépend du drapeau est explicitement filtré par projet ; le reste — le CTA
 * vivant, la session, le carnet, l'absence de nom de variable — doit être vrai
 * partout, parce que rien de tout cela n'est censé dépendre d'un drapeau.
 */

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 768, height: 1024 };
const MOBILE = { width: 390, height: 844 };

/**
 * Les identifiants internes qui ne doivent jamais atteindre un navigateur.
 * Doublon assumé de `INTERNAL_CONFIG_PATTERN` : une spec Playwright ne peut pas
 * importer un module `@/` de l'application, et cette liste est précisément ce
 * qu'on ne veut pas voir régresser de deux côtés à la fois.
 */
const INTERNAL_CONFIG =
  /DATABASE_URL|DATABASE_ADMIN_URL|FINANCE_HUB_|LEARNING_HUB_|STRIPE_|OPENAI_API_KEY/;

const PUBLIC_DEMO_ONLY = "exige le serveur public-demo";

/** Les routes pédagogiques qu'un visiteur atteint sans rien configurer. */
const PUBLIC_ROUTES = [
  "/",
  "/exercices",
  "/exercices/session-decouverte",
  "/revisions",
  "/revisions/carnet-erreurs",
  "/corrections",
  "/parcours",
  "/progression",
  "/account"
];

/** Toute requête qui prétendrait enregistrer quelque chose. */
function isPersistenceWrite(request: Request): boolean {
  const url = request.url();

  return (
    request.method() !== "GET" &&
    (url.includes("/api/revisions/review") ||
      url.includes("/api/exercises/attempts") ||
      url.includes("/api/mastery") ||
      url.includes("/api/progress"))
  );
}

function recordWrites(page: Page): string[] {
  const writes: string[] = [];

  page.on("request", (request) => {
    if (isPersistenceWrite(request)) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });

  return writes;
}

test.describe("aucune configuration interne n'atteint le navigateur", () => {
  test.use({ viewport: DESKTOP });

  /**
   * L'assertion centrale de la PR, et elle lit les OCTETS de la réponse, pas le
   * DOM rendu. Une chaîne passée en prop à un Client Component puis masquée en
   * CSS reste dans le payload RSC sérialisé dans le document : invisible à
   * l'œil, lisible dans « afficher la source ». C'est exactement sous cette
   * forme que `FINANCE_HUB_USE_DATABASE` était publié sous chaque carte.
   */
  for (const route of PUBLIC_ROUTES) {
    test(`la réponse HTML de ${route} ne contient aucun nom de variable`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.status(), route).toBeLessThan(400);

      const body = (await response?.text()) ?? "";
      const match = body.match(INTERNAL_CONFIG);

      expect(
        match?.[0] ?? null,
        `${route} publie « ${match?.[0]} » dans sa réponse HTML`
      ).toBeNull();
    });
  }

  /**
   * Le document initial ne suffit pas : la navigation client récupère un
   * payload RSC séparé (`?_rsc=`), qui porte les mêmes props sérialisées.
   */
  test("le payload RSC d'une navigation client est propre lui aussi", async ({ page }) => {
    const payloads: Array<{ url: string; body: string }> = [];

    page.on("response", async (response) => {
      if (!response.url().includes("_rsc=")) {
        return;
      }

      try {
        payloads.push({ url: response.url(), body: await response.text() });
      } catch {
        // Réponse déjà consommée ou navigation annulée : rien à vérifier.
      }
    });

    await page.goto("/exercices");
    await page.getByRole("link", { name: "Lancer la session découverte" }).click();
    await expect(page).toHaveURL(/session-decouverte$/);

    await page.goto("/revisions");
    await page.getByRole("link", { name: "Ouvrir le carnet d'erreurs" }).click();
    await expect(page).toHaveURL(/carnet-erreurs$/);

    for (const payload of payloads) {
      const match = payload.body.match(INTERNAL_CONFIG);

      expect(match?.[0] ?? null, `${payload.url} publie « ${match?.[0]} »`).toBeNull();
    }
  });

  test("aucune trace d'exécution n'est publiée sur une page pédagogique", async ({ page }) => {
    const response = await page.goto("/revisions");
    const body = (await response?.text()) ?? "";

    expect(body).not.toContain("at Object.<anonymous>");
    expect(body).not.toContain("node_modules");
    expect(body).not.toMatch(/postgres(ql)?:\/\//);
  });
});

test.describe("/exercices : plus de faux point d'entrée", () => {
  test.use({ viewport: DESKTOP });

  test("n'affiche aucun bouton principal mort", async ({ page }) => {
    await page.goto("/exercices");

    await expect(page.getByRole("button", { name: "Préparer la session" })).toHaveCount(0);
    await expect(page.getByText("Bientôt disponible")).toHaveCount(0);

    // Aucun bouton désactivé ne subsiste dans le bandeau d'entrée de la page.
    const generator = page.locator("section.generator-panel");
    await expect(generator.locator("button:disabled")).toHaveCount(0);
  });

  test("annonce la session découverte et y mène", async ({ page }) => {
    await page.goto("/exercices");

    const panel = page.locator("section.generator-panel");

    await expect(panel.getByRole("heading", { name: "Session découverte" })).toBeVisible();
    await expect(panel).toContainText("5 exercices guidés");
    await expect(panel).toContainText("correction immédiate");

    await panel.getByRole("link", { name: "Lancer la session découverte" }).click();

    await expect(page).toHaveURL(/\/exercices\/session-decouverte$/);
    await expect(page.locator(".topbar-context strong")).toHaveText("Session découverte");
  });
});

test.describe("session découverte", () => {
  test.use({ viewport: DESKTOP });

  test("compte cinq étapes et corrige chacune sans rien enregistrer", async ({ page }) => {
    const writes = recordWrites(page);

    await page.goto("/exercices/session-decouverte");

    for (let step = 1; step <= 5; step += 1) {
      const panel = page.locator('[data-testid="discovery-step"]');

      await expect(panel).toHaveAttribute("data-step", String(step));
      await expect(panel.getByText(`Étape ${step} sur 5`)).toBeVisible();

      await answerCurrentStep(page);

      await page.getByRole("button", { name: "Corriger" }).click();

      // La correction arrive et elle est structurée, pas un simple score.
      await expect(page.locator('[data-testid="discovery-correction"]')).toBeVisible();

      await page
        .getByRole("button", { name: step === 5 ? "Voir le récapitulatif" : "Étape suivante" })
        .click();
    }

    const summary = page.locator('[data-testid="discovery-summary"]');

    await expect(summary).toBeVisible();
    await expect(summary.getByText("Résultat temporaire — non enregistré")).toBeVisible();
    await expect(summary.locator('[data-testid="discovery-recap"] li')).toHaveCount(5);

    expect(writes, `la session a émis des écritures : ${writes.join(", ")}`).toEqual([]);
  });

  test("corrige via une route qui déclare ne rien persister", async ({ page, request }) => {
    await page.goto("/exercices/session-decouverte");

    const response = await request.post("/api/exercises/session-decouverte", {
      data: {
        exerciseId: "ex-provision-calcul-fourchette",
        submission: { kind: "numeric", value: 1 }
      }
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as { persisted: boolean; correction: { score: number } };

    expect(body.persisted).toBe(false);
    expect(typeof body.correction.score).toBe("number");
  });

  /**
   * La liste blanche, vue de l'extérieur : une notation anonyme ouverte à tout
   * le catalogue contournerait le paywall du lab Excel.
   */
  test("refuse un exercice hors session", async ({ request }) => {
    const response = await request.post("/api/exercises/session-decouverte", {
      data: {
        exerciseId: "ex-xl-marge-commerciale",
        submission: { kind: "numeric", value: 1 }
      }
    });

    expect(response.status()).toBe(404);
  });

  test("annonce le résultat à un lecteur d'écran et pas seulement par la couleur", async ({
    page
  }) => {
    await page.goto("/exercices/session-decouverte");

    // La région vivante existe avant la correction, sinon son contenu n'est pas
    // annoncé au moment où il apparaît.
    const live = page.locator('[data-testid="discovery-step"] p[role="status"]');
    await expect(live).toHaveCount(1);

    await answerCurrentStep(page);
    await page.getByRole("button", { name: "Corriger" }).click();

    // Le barème rend des scores fractionnaires (6.67/20 sur un QCM partiel).
    await expect(live).toContainText(/Correction reçue : [\d.,]+ sur 20/);
    await expect(live).toContainText("non enregistré");

    // Le rappel visible ne dépend d'aucune couleur : c'est du texte.
    await expect(
      page.locator('[data-testid="discovery-step"]').getByText("Résultat temporaire — non enregistré")
    ).toBeVisible();
  });

  test("se parcourt au clavier, avec un focus visible", async ({ page }) => {
    await page.goto("/exercices/session-decouverte");

    const firstOption = page.locator('[data-testid="discovery-step"] input[type="checkbox"]').first();

    await firstOption.focus();
    await expect(firstOption).toBeFocused();
    await page.keyboard.press("Space");
    await expect(firstOption).toBeChecked();

    const outline = await firstOption.evaluate((element) => {
      const style = window.getComputedStyle(element, ":focus-visible");
      return `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}`;
    });

    expect(outline).not.toBe("none|0px|none");

    // Le bouton s'atteint au clavier et se déclenche par Entrée.
    await page.getByRole("button", { name: "Corriger" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="discovery-correction"]')).toBeVisible();
  });

  for (const [name, viewport] of [
    ["390 px", MOBILE],
    ["768 px", TABLET],
    ["1440 px", DESKTOP]
  ] as const) {
    test(`tient dans ${name} sans débordement horizontal`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/exercices/session-decouverte");

      await expect(page.locator('[data-testid="discovery-step"]')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  }
});

test.describe("/revisions en mode découverte", () => {
  test.use({ viewport: DESKTOP });

  test("ne répète aucun message technique sous les cartes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", PUBLIC_DEMO_ONLY);
    await page.goto("/revisions");

    const cards = page.locator("article.flashcard");
    await expect(cards.first()).toBeVisible();

    // Une seule notice de démonstration sur la page, et elle est dans le shell.
    await expect(page.locator("section.demo-banner")).toHaveCount(1);
    await expect(page.locator("section.demo-banner")).toContainText("Mode découverte");

    // Aucune carte ne porte de rappel de configuration.
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      await expect(cards.nth(index)).not.toContainText("Indisponible");
      await expect(cards.nth(index)).not.toContainText("base de données");
    }
  });

  test("dit « Mode découverte » plutôt que « Mode Neutre »", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", PUBLIC_DEMO_ONLY);
    await page.goto("/revisions");

    await expect(page.getByText("Neutre", { exact: true })).toHaveCount(0);
    await expect(page.locator(".hero-score")).toContainText("Mode découverte");
  });

  test("garde la réponse masquée, puis la révèle à la demande", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", PUBLIC_DEMO_ONLY);
    const due = await request.get("/api/revisions/due");
    const { queue } = (await due.json()) as {
      queue: Array<{ itemRef: string }> | { entries: Array<{ itemType: string; itemRef: string }> };
    };
    const entry = "entries" in queue ? queue.entries[0] : undefined;

    expect(entry, "la file seedée ne doit pas être vide").toBeDefined();

    const revealResponse = await request.post("/api/revisions/reveal", {
      data: { itemType: entry!.itemType, itemRef: entry!.itemRef }
    });
    const answer = ((await revealResponse.json()) as { item: { answer: string } }).item.answer;

    const response = await page.goto("/revisions");
    const html = (await response?.text()) ?? "";

    expect(answer.length).toBeGreaterThan(0);
    expect(html, "la réponse ne doit pas être dans les octets envoyés").not.toContain(answer);

    const card = page.locator(`article.flashcard[data-item-ref="${entry!.itemRef}"]`);
    await card.getByRole("button", { name: "Afficher la réponse" }).click();

    await expect(card.getByText("Réponse attendue")).toBeVisible();
    await expect(card.getByText(answer)).toBeVisible();
  });

  test("permet une auto-évaluation locale sans aucune requête d'écriture", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", PUBLIC_DEMO_ONLY);
    const writes = recordWrites(page);

    await page.goto("/revisions");

    const card = page.locator("article.flashcard").first();

    await expect(card).toHaveAttribute("data-mode", "local");
    await expect(card.getByRole("button", { name: "Pas su" })).toBeDisabled();

    await card.getByRole("button", { name: "Afficher la réponse" }).click();
    await expect(card.getByText("Réponse attendue")).toBeVisible();

    // Les quatre boutons deviennent utilisables : c'est le geste central du
    // produit, et le visiteur doit pouvoir l'essayer.
    for (const label of ["Pas su", "Partiel", "Su", "Très facile"]) {
      await expect(card.getByRole("button", { name: label, exact: true })).toBeEnabled();
    }

    await card.getByRole("button", { name: "Su", exact: true }).click();

    await expect(card.getByText("Simulation : cette carte reviendrait dans 7 jours.")).toBeVisible();
    await expect(card.getByText("Évaluation temporaire — non enregistrée")).toBeVisible();

    // Une seule évaluation par carte et par session.
    await expect(card.getByRole("button", { name: "Su", exact: true })).toBeDisabled();

    expect(writes, `des écritures ont été émises : ${writes.join(", ")}`).toEqual([]);
  });

  test("garde l'évaluation dans la session, et l'oublie avec l'onglet", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", PUBLIC_DEMO_ONLY);
    await page.goto("/revisions");

    const card = page.locator("article.flashcard").first();
    const itemRef = await card.getAttribute("data-item-ref");

    await card.getByRole("button", { name: "Afficher la réponse" }).click();
    await card.getByRole("button", { name: "Partiel" }).click();
    await expect(card.getByText("Simulation : cette carte reviendrait dans 3 jours.")).toBeVisible();

    // Rechargement : l'évaluation est retrouvée dans sessionStorage.
    await page.reload();
    const reloaded = page.locator(`article.flashcard[data-item-ref="${itemRef}"]`);
    await expect(reloaded.getByText("Simulation : cette carte reviendrait dans 3 jours.")).toBeVisible();

    // Rien dans localStorage : aucune progression durable n'est fabriquée.
    const persisted = await page.evaluate(() => JSON.stringify(Object.keys(window.localStorage)));
    expect(persisted).toBe("[]");

    // Un nouvel onglet — donc une nouvelle session — repart de zéro.
    const fresh = await context.newPage();
    await fresh.goto("/revisions");
    await expect(
      fresh.locator(`article.flashcard[data-item-ref="${itemRef}"]`).getByText("Simulation :")
    ).toHaveCount(0);
    await fresh.close();
  });
});

test.describe("/revisions/carnet-erreurs", () => {
  test.use({ viewport: DESKTOP });

  test("est une vraie route, avec son titre et son fil d'Ariane", async ({ page }) => {
    const response = await page.goto("/revisions/carnet-erreurs");

    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator(".topbar-context strong")).toHaveText("Carnet d'erreurs");

    const breadcrumb = page.locator(".topbar-breadcrumb");
    await expect(breadcrumb).toContainText("Réviser");
    await expect(breadcrumb).toContainText("Carnet d'erreurs");
    await expect(breadcrumb).not.toContainText("Session du jour");
  });

  test("marque « Carnet d'erreurs » actif, et lui seul", async ({ page }) => {
    await page.goto("/revisions/carnet-erreurs");

    const sidebar = page.locator("aside.sidebar");

    await expect(sidebar.getByRole("link", { name: "Carnet d'erreurs" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(sidebar.getByRole("link", { name: "Session du jour" })).not.toHaveAttribute(
      "aria-current",
      /.*/
    );

    // Une seule page courante annoncée dans toute la navigation.
    await expect(sidebar.locator("[aria-current]")).toHaveCount(1);
  });

  test("l'ancienne ancre redirige vers la route", async ({ page }) => {
    await page.goto("/revisions#carnet-erreurs");

    await expect(page).toHaveURL(/\/revisions\/carnet-erreurs$/);
    await expect(page.locator(".topbar-context strong")).toHaveText("Carnet d'erreurs");
  });

  test("présente ses exemples comme des exemples, jamais comme ceux du visiteur", async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== "public-demo", "exige le serveur public-demo");

    await page.goto("/revisions/carnet-erreurs");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Exemple de carnet d'erreurs");
    await expect(page.getByText("ne vous sont pas attribués")).toBeVisible();

    const examples = page.locator('[data-testid="error-journal-examples"] article');
    await expect(examples).toHaveCount(3);

    // Chaque entrée porte son étiquette de démonstration.
    for (let index = 0; index < 3; index += 1) {
      await expect(examples.nth(index)).toContainText("Exemple de démonstration");
    }

    // Rien ne prétend appartenir au visiteur.
    await expect(page.getByText("Tes erreurs")).toHaveCount(0);
    await expect(page.getByText("Ta progression")).toHaveCount(0);
  });

  for (const [name, viewport] of [
    ["390 px", MOBILE],
    ["768 px", TABLET],
    ["1440 px", DESKTOP]
  ] as const) {
    test(`tient dans ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/revisions/carnet-erreurs");

      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  }
});

test.describe("une seule notice de démonstration", () => {
  test.use({ viewport: DESKTOP });

  for (const route of ["/", "/exercices", "/exercices/session-decouverte", "/revisions", "/revisions/carnet-erreurs"]) {
    test(`${route} n'affiche la notice qu'une fois`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "public-demo", PUBLIC_DEMO_ONLY);
      await page.goto(route);

      const notice = page.locator("section.demo-banner");

      await expect(notice).toHaveCount(1);
      await expect(notice).toContainText("Mode découverte");
      await expect(notice).toContainText("ne sont pas enregistrées");
    });
  }
});

/**
 * Répond à l'étape courante selon la famille de l'exercice, lue sur le panneau
 * lui-même. Les réponses n'ont pas à être justes : ce qui est testé est le
 * parcours, pas le barème — celui-ci a ses propres cas d'or.
 */
async function answerCurrentStep(page: Page): Promise<void> {
  const panel = page.locator('[data-testid="discovery-step"]');
  const kind = await panel.getAttribute("data-exercise-kind");

  switch (kind) {
    case "multiple_choice":
      await panel.locator('input[type="checkbox"]').first().check();
      return;
    case "numeric":
      await panel.getByLabel("Réponse numérique").fill("1000");
      return;
    case "journal_entry":
      await panel.getByLabel("Compte ligne 1").fill("607");
      await panel.getByLabel("Débit ligne 1").fill("1000");
      await panel.getByLabel("Compte ligne 2").fill("401");
      await panel.getByLabel("Crédit ligne 2").fill("1000");
      return;
    default:
      await panel
        .getByLabel("Réponse rédigée")
        .fill("Une réponse rédigée assez longue pour être soumise à la correction.");
  }
}
