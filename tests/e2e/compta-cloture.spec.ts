import { expect, test, type Page } from "@playwright/test";

/**
 * PR-12a : niveaux 3 et 4 du module Comptabilité générale, case studies et
 * outils du dossier de clôture.
 *
 * Le modèle d'accès canonique (PR #15) gouverne ces assertions : sans compte,
 * seul le niveau 1 s'ouvre et seul l'exercice de démonstration se corrige.
 * Les nouveaux niveaux doivent donc être VISIBLES mais VERROUILLÉS ici, et le
 * serveur doit refuser tout contournement. La notation des nouveaux exercices
 * est prouvée par les golden tests unitaires (mêmes évaluateurs, mêmes specs)
 * et, de bout en bout, par les exercices migrés du parcours — hors curriculum
 * canonique, donc corrigeables anonymement.
 */

const BASE = "/modules/comptabilite-generale";

async function fillLine(
  page: Page,
  index: number,
  values: { account: string; debit?: string; credit?: string }
) {
  await page.getByLabel(`Compte ligne ${index}`).fill(values.account);

  if (values.debit) {
    await page.getByLabel(`Débit ligne ${index}`).fill(values.debit);
  }

  if (values.credit) {
    await page.getByLabel(`Crédit ligne ${index}`).fill(values.credit);
  }
}

test("le module publie quatre niveaux — N3 et N4 visibles mais gardés", async ({ page }) => {
  await page.goto(BASE);

  await expect(page.getByRole("link", { name: "Ouvrir le niveau 1" })).toBeVisible();

  // Les nouveaux niveaux existent, avec leur objectif — et restent verrouillés
  // tant que la progression ne les a pas ouverts.
  await expect(page.getByText("Clôture : écritures d'inventaire").first()).toBeVisible();
  await expect(page.getByText("Révision et états financiers").first()).toBeVisible();

  for (const level of [2, 3, 4]) {
    await expect(page.getByRole("link", { name: `Ouvrir le niveau ${level}` })).toHaveCount(0);
  }

  expect(await page.getByText("Niveau verrouillé").count()).toBeGreaterThanOrEqual(3);

  // Les deux case studies sont annoncés depuis la porte du module.
  await expect(page.getByText("Clôture mensuelle de décembre (SARL Vélo Cité)")).toBeVisible();
  await expect(page.getByText("Arrêté annuel de la SARL Vélo Cité")).toBeVisible();
});

test("les pages des niveaux 3 et 4 sont refusées tant qu'ils sont verrouillés", async ({ page }) => {
  for (const level of [3, 4]) {
    const response = await page.goto(`${BASE}/${level}`);

    expect(response?.status(), `${BASE}/${level}`).toBe(404);
  }
});

test("un exercice N3 ne se contourne ni par la page ni par l'API", async ({ page, request }) => {
  const response = await page.goto(`${BASE}/exercices/ex-cgv1-variation-stocks`);

  expect(response?.status()).toBe(404);

  // Le serveur refuse aussi la soumission directe : le verrou n'est pas un
  // détail d'interface.
  const attempt = await request.post("/api/exercises/attempts", {
    data: {
      exerciseId: "ex-cgv1-variation-stocks",
      submission: {
        kind: "journal",
        lines: [
          { account: "6037", debit: 6800 },
          { account: "37", credit: 6800 }
        ]
      }
    }
  });

  expect(attempt.status()).toBe(403);
});

test.describe("case study N3 : clôture mensuelle", () => {
  test("le dossier montre pièces, étapes, checklist et rapprochement", async ({ page }) => {
    await page.goto(`${BASE}/cas/cloture-mensuelle`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Clôture mensuelle");
    await expect(page.getByText("Relevé bancaire au 31/12")).toBeVisible();
    await expect(page.getByRole("link", { name: /Étape 6/ })).toBeVisible();
    await expect(page.getByText("Checklist de clôture").first()).toBeVisible();
  });

  test("le rapprochement interactif converge au clavier", async ({ page }) => {
    await page.goto(`${BASE}/cas/cloture-mensuelle`);

    const checkboxes = page.locator(".reconciliation-items input[type=checkbox]");

    await expect(checkboxes).toHaveCount(3);

    // Pointage entièrement au clavier : focus + espace.
    for (let index = 0; index < 3; index += 1) {
      await checkboxes.nth(index).focus();
      await page.keyboard.press("Space");
    }

    await expect(page.getByTestId("reconciliation-statement")).toHaveText(/35\s450,00/);
    await expect(page.getByTestId("reconciliation-book")).toHaveText(/35\s450,00/);
    await expect(page.getByText(/Rapprochement établi/)).toBeVisible();
  });

  test("la checklist annonce son avancement sans rien noter", async ({ page }) => {
    await page.goto(`${BASE}/cas/cloture-mensuelle`);

    const checklist = page.locator(".closing-checklist input[type=checkbox]");
    const counter = page.locator(".panel", { hasText: "Checklist de clôture" }).locator('[role="status"]');

    await expect(counter).toHaveText("0/6 étapes");
    await checklist.first().focus();
    await page.keyboard.press("Space");
    await expect(counter).toHaveText("1/6 étapes");
  });

  test("une étape du cas reste gardée par le niveau, même en accès direct", async ({ page }) => {
    const response = await page.goto(`${BASE}/cas/cloture-mensuelle/2`);

    expect(response?.status()).toBe(404);
  });
});

test.describe("case study N4 : arrêté annuel", () => {
  test("balance interactive, grand livre, feuille de contrôle et export", async ({ page }) => {
    await page.goto(`${BASE}/cas/arrete-annuel`);

    // Balance interactive : totaux équilibrés du dossier.
    await expect(page.getByTestId("balance-total-debit")).toHaveText(/305\s140,00/);
    await expect(page.getByTestId("balance-total-credit")).toHaveText(/305\s140,00/);

    // Filtrage par classe au clavier (balance interactive).
    const balanceFilter = page.locator(".ledger-picker select").first();
    await balanceFilter.selectOption("6");
    await expect(page.getByTestId("balance-total-debit")).toHaveText(/189\s540,00/);

    // Grand livre : le compte de stocks rejoue l'inventaire.
    const picker = page.locator(".ledger-picker select").nth(1);
    await picker.selectOption({ label: "37 — Stocks de marchandises" });
    await expect(page.getByRole("cell", { name: "Solde avant inventaire" })).toBeVisible();
    await expect(page.getByRole("region", { name: /Mouvements du compte 37/ })).toContainText(
      /6\s800,00/
    );

    // Feuille de contrôle : toutes les cohérences passent.
    const checks = page.locator(".control-sheet-row");
    await expect(checks).toHaveCount(5);
    await expect(page.locator('.control-sheet-row[data-passed="false"]')).toHaveCount(0);

    await expect(page.getByRole("button", { name: /Exporter le dossier/ })).toBeVisible();
  });

  test("l'export télécharge un dossier Markdown complet", async ({ page }) => {
    await page.goto(`${BASE}/cas/arrete-annuel`);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Exporter le dossier/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("dossier-annuel-velo-cite.md");
  });

  test("le dossier ne contient aucune réponse attendue de ses étapes", async ({ request }) => {
    // 48 300 (feuille maîtresse), 23 660 (résultat) et 107 300 (total bilan)
    // sont les réponses des étapes 1, 4 et 5 : la page du cas fournit les
    // soldes qui permettent de les calculer, jamais les résultats — ni dans la
    // balance affichée, ni dans la feuille de contrôle, ni dans l'export.
    const response = await request.get(`${BASE}/cas/arrete-annuel`);
    const html = (await response.text()).replace(/[\u202f\u00a0]/g, " ");

    expect(response.status()).toBe(200);

    for (const answer of ["48 300", "48300", "23 660", "23660", "107 300", "107300"]) {
      expect(html, `réponse « ${answer} » présente dans la page`).not.toContain(answer);
    }
  });

  test("une étape hors du cas est un 404, pas un rabattement sur l'étape 1", async ({ page }) => {
    for (const path of [`${BASE}/cas/arrete-annuel/9`, `${BASE}/cas/inconnu`, `${BASE}/cas/inconnu/1`]) {
      const response = await page.goto(path);

      expect(response?.status(), path).toBe(404);
    }
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("les dossiers et leurs outils tiennent en 390 px sans débordement", async ({ page }) => {
    for (const path of [`${BASE}/cas/arrete-annuel`, `${BASE}/cas/cloture-mensuelle`, BASE]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${path} déborde de ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test("un exercice migré se corrige au journal sur mobile", async ({ page }) => {
    await page.goto("/exercices/ex-travaux-cloture-1");

    await fillLine(page, 1, { account: "6031", debit: "6800" });
    await fillLine(page, 2, { account: "310", credit: "6800" });
    await fillLine(page, 3, { account: "310", debit: "5420" });
    await page.getByRole("button", { name: "Ajouter une ligne" }).click();
    await fillLine(page, 4, { account: "6031", credit: "5420" });
    await page.getByRole("button", { name: "Ajouter une ligne" }).click();
    await fillLine(page, 5, { account: "391", debit: "285" });
    await page.getByRole("button", { name: "Ajouter une ligne" }).click();
    await fillLine(page, 6, { account: "78173", credit: "285" });

    await expect(page.getByTestId("journal-balance")).toHaveText("Équilibrée");
    await page.getByRole("button", { name: "Corriger" }).click();

    await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
  });
});

test("un exercice migré du parcours se répond dans ses propres termes, ordre libre", async ({
  page
}) => {
  // ex-travaux-cloture-1 : jadis noté en prose, désormais au journal — depuis
  // la page générique /exercices, hors curriculum canonique donc corrigeable
  // anonymement. Les lignes sont volontairement saisies dans le désordre :
  // l'appariement @2 (compte + sens + montant) ne dépend pas de l'ordre.
  await page.goto("/exercices/ex-travaux-cloture-1");

  await fillLine(page, 1, { account: "391", debit: "285" });
  await fillLine(page, 2, { account: "310", debit: "5420" });
  await fillLine(page, 3, { account: "6031", credit: "5420" });
  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  await fillLine(page, 4, { account: "6031", debit: "6800" });
  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  await fillLine(page, 5, { account: "310", credit: "6800" });
  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  await fillLine(page, 6, { account: "78173", credit: "285" });

  await expect(page.getByTestId("journal-balance")).toHaveText("Équilibrée");
  await page.getByRole("button", { name: "Corriger" }).click();

  await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
});

test("un QCM migré du parcours se répond par cases à cocher", async ({ page }) => {
  await page.goto("/exercices/ex-operations-courantes-1");

  for (const option of [
    "1) Acquisition d'un véhicule de livraison",
    "4) Construction d'un entrepôt de stockage",
    "6) Achat d'un ordinateur pour la comptabilité"
  ]) {
    await page.getByRole("checkbox", { name: option }).check();
  }

  await page.getByRole("button", { name: "Corriger" }).click();

  await expect(page.getByText(/Score 20([.,]00)?\/20/)).toBeVisible();
});
