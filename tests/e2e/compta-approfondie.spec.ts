import { expect, test } from "@playwright/test";

/**
 * Le parcours public « Comptabilité approfondie », de bout en bout.
 *
 * Le serveur de ce projet démarre sur un magasin publié amorcé
 * (`scripts/seed-published-content.ts`) : le chapitre pilote y est réellement
 * publié, par le vrai chemin de publication, dans un dossier jetable. La suite
 * exerce donc ce qu'un visiteur verrait, sans que `content/published/` soit
 * touché.
 */

const CHAPTER = "/modules/comptabilite-approfondie/emprunts-obligataires";

/**
 * Cible une activité par son titre.
 *
 * `filter({ hasText })` ne suffit pas : le mini-cas mentionne « prime de
 * remboursement totale » dans l'objectif de sa première étape, et attraperait
 * donc la carte de l'exercice de calcul en plus de la sienne. Le filtre porte
 * sur le *titre* de la carte, qui est unique.
 */
function activity(page: import("@playwright/test").Page, title: string) {
  return page
    .locator(".activity-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

test("le module liste le chapitre publié et rien d'autre comme disponible", async ({ page }) => {
  await page.goto("/modules/comptabilite-approfondie");

  await expect(page.getByRole("heading", { level: 1, name: "Comptabilité approfondie" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Emprunts obligataires" })).toBeVisible();

  // Les chapitres non publiés sont annoncés « à venir », sans lien ni chiffre.
  const upcoming = page.getByRole("heading", { name: "À venir" });
  await expect(upcoming).toBeVisible();
  await expect(page.getByRole("link", { name: "Titres", exact: true })).toHaveCount(0);
});

test("un chapitre non publié répond 404 plutôt qu'un brouillon", async ({ page }) => {
  const response = await page.goto("/modules/comptabilite-approfondie/titres");

  expect(response?.status()).toBe(404);
});

test("un chapitre inconnu répond 404", async ({ page }) => {
  const response = await page.goto("/modules/comptabilite-approfondie/chapitre-invente");

  expect(response?.status()).toBe(404);
});

test("l'onglet Comprendre rend le contenu publié et son sommaire", async ({ page }) => {
  await page.goto(CHAPTER);

  await expect(page.getByRole("heading", { level: 1, name: "Emprunts obligataires" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Sommaire" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Objectif d'apprentissage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Carte des comptes" })).toBeVisible();
});

test("les onglets sont partageables et survivent au rechargement", async ({ page }) => {
  await page.goto(CHAPTER);
  await page.getByRole("link", { name: "Fiche 2.0" }).click();

  await expect(page).toHaveURL(/section=fiche/);
  await expect(page.getByRole("heading", { name: "1. Objectif" })).toBeVisible();

  // Rechargement direct de l'URL : c'est ce qui distingue un onglet d'un état
  // React, et c'est ce que l'étape 4 exige.
  await page.reload();
  await expect(page.getByRole("heading", { name: "1. Objectif" })).toBeVisible();
});

test("la fiche 2.0 rend ses onze sections et ses sources", async ({ page }) => {
  await page.goto(`${CHAPTER}?section=fiche`);

  for (const heading of [
    "1. Objectif",
    "3. Règles essentielles",
    "5. Formules",
    "7. Exemple résolu pas à pas",
    "9. Questions de rappel actif",
    "10. Synthèse",
    "11. Sources"
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("une carte se révèle et s'auto-évalue", async ({ page }) => {
  await page.goto(`${CHAPTER}?section=reviser`);

  const front = page.locator(".flashcard-front");
  await expect(front).toBeVisible();

  // La réponse est absente du HTML initial : elle est demandée au serveur.
  await expect(page.locator(".flashcard-back")).toHaveCount(0);

  await page.getByRole("button", { name: "Afficher la réponse" }).click();
  await expect(page.locator(".flashcard-back")).toBeVisible();

  await page.getByRole("button", { name: /^Su/ }).click();

  // L'intervalle vient de `REVIEW_INTERVAL_DAYS` du domaine — 7 jours pour
  // « Su » — et non d'un second algorithme propre à cet écran.
  //
  // CE SERVEUR N'A NI BASE NI COMPTES : rien n'est persisté, et l'écran ne
  // prétend donc pas que la carte a été reprogrammée. Il dit ce qu'il *ferait*
  // et invite à se connecter. C'est la propriété qui compte — annoncer une
  // planification qui n'a pas eu lieu était précisément le défaut corrigé.
  await expect(page.getByText(/reviendrait dans 7 jours/)).toBeVisible();
  await expect(page.getByText(/se connecter pour que la planification soit conservée/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Session terminée" })).toBeVisible();
});

test("un calcul est noté déterministement, arrondi et unité compris", async ({ page }) => {
  await page.goto(`${CHAPTER}?section=entrainer`);

  const card = activity(page, "Prime de remboursement totale");
  const field = card.getByLabel(/Votre réponse/);

  await field.fill("12345");
  await card.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(card.getByText(/hors tolérance/i)).toBeVisible();

  await card.getByRole("button", { name: "Refaire" }).click();
  // Notation française avec espace de milliers : la même réponse, écrite comme
  // un comptable l'écrit.
  await field.fill("80 000");
  await card.getByRole("button", { name: "Valider", exact: true }).click();
  await expect(card.getByText("20/20")).toBeVisible();
  await expect(card.getByText("Réponse attendue")).toBeVisible();
});

test("une écriture déséquilibrée est signalée avant même la validation", async ({ page }) => {
  await page.goto(`${CHAPTER}?section=entrainer`);

  const card = activity(page, "Souscription de l'emprunt obligataire");

  await card.getByLabel("Numéro de compte, ligne 1").fill("4671");
  await card.getByLabel("Débit, ligne 1").fill("7968000");
  await card.getByLabel("Numéro de compte, ligne 2").fill("163");
  await card.getByLabel("Crédit, ligne 2").fill("8048000");

  await expect(card.getByText(/Journal déséquilibré/)).toBeVisible();

  await card.getByRole("button", { name: "Ajouter une ligne" }).click();
  await card.getByLabel("Numéro de compte, ligne 3").fill("169");
  await card.getByLabel("Débit, ligne 3").fill("80000");

  await expect(card.getByText(/Journal équilibré/)).toBeVisible();

  await card.getByRole("button", { name: "Valider l'écriture" }).click();
  await expect(card.getByText("20/20")).toBeVisible();
});

test("un diagnostic est noté sur sa catégorie et rend la correction", async ({ page }) => {
  await page.goto(`${CHAPTER}?section=entrainer`);

  const card = activity(page, "Une écriture d'émission suspecte");

  await card.getByRole("radio", { name: "Ligne manquante" }).check();
  await card.getByRole("button", { name: "Valider", exact: true }).click();

  // Le message apparaît deux fois — dans le bandeau de retour et dans le détail
  // « ce qui était juste » de la correction. Les deux sont voulus ; le test vise
  // le bandeau.
  await expect(
    card.locator(".feedback").getByText("Nature de l'erreur correctement identifiée.")
  ).toBeVisible();
  await expect(card.getByRole("heading", { name: "Correction attendue" })).toBeVisible();
});

test("le mini-cas verrouille une étape tant que son prérequis n'est pas réussi", async ({ page }) => {
  await page.goto(`${CHAPTER}?section=entrainer`);

  const card = page.locator(".case-card");
  await expect(card.locator(".case-step--locked")).toHaveCount(1);

  await card.getByRole("button", { name: /Demander un indice/ }).click();
  await expect(card.getByText(/Indice 1/)).toBeVisible();

  await card.getByLabel(/Résultat/).fill("80000");
  await card.getByRole("button", { name: "Valider l'étape" }).first().click();

  await expect(card.locator(".case-step--locked")).toHaveCount(0);
});

test("le panneau Sources cite les documents sans exposer de fichier", async ({ page }) => {
  await page.goto(`${CHAPTER}?section=sources`);

  await expect(page.getByRole("heading", { name: /source/i }).first()).toBeVisible();
  // Le magasin de ce serveur est amorcé par des fixtures, et leurs titres le
  // disent : si cet écran affichait un titre de document sans le marqueur, ce
  // serait que du contenu non amorcé s'est glissé dans un store de test.
  await expect(page.getByText(/\[Fixture e2e\]/).first()).toBeVisible();
  await expect(page.getByText(/page/i).first()).toBeVisible();

  const html = await page.content();

  expect(html).not.toMatch(/\.pdf/i);
  expect(html).not.toMatch(/[A-Za-z]:\\/);
  expect(html).not.toContain("CONTENT_SOURCE_ROOT");
  expect(html).not.toContain("data/extracted");
  // Ni prompt, ni modèle, ni fournisseur, ni relecteur : les DTO les ont
  // retirés bien avant le rendu.
  expect(html).not.toMatch(/promptId|promptVersion|gpt-test|inputHash|reviewedBy/);
});

test("la progression reste honnête pour un visiteur sans compte", async ({ page }) => {
  await page.goto(CHAPTER);

  // Sans compte, aucune progression n'est attribuée et l'écran le dit plutôt
  // que d'afficher un pourcentage inventé.
  await expect(page.getByText(/Se connecter/)).toBeVisible();
  await expect(page.getByText("Non commencé")).toBeVisible();
});

test("le chapitre reste utilisable sur un écran mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CHAPTER);

  await expect(page.getByRole("heading", { level: 1, name: "Emprunts obligataires" })).toBeVisible();

  // Aucun débordement horizontal : les tableaux défilent dans leur conteneur.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );

  expect(overflow).toBe(false);
});
