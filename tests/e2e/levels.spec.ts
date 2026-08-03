import { expect, test } from "@playwright/test";

/**
 * Level states with no progression stored — the seeded demo and the public demo.
 *
 * The track must render the honest starting position: level 1 open, the rest
 * gated. Showing four open levels, or four locked ones, would both misrepresent
 * where a learner stands.
 */

test("each published track starts with N1 available and the rest locked", async ({ page }) => {
  await page.goto("/parcours");

  const rows = page.locator("[data-level-status]");
  // PR-12a : la comptabilité générale publie quatre niveaux, le lab Excel deux.
  await expect(rows).toHaveCount(6);

  await expect(rows.nth(0)).toHaveAttribute("data-level-status", "available");
  await expect(rows.nth(1)).toHaveAttribute("data-level-status", "locked");
  await expect(rows.nth(2)).toHaveAttribute("data-level-status", "locked");
  await expect(rows.nth(3)).toHaveAttribute("data-level-status", "locked");
  await expect(rows.nth(4)).toHaveAttribute("data-level-status", "available");
  await expect(rows.nth(5)).toHaveAttribute("data-level-status", "locked");
});

test("a gated level explains what opens it", async ({ page }) => {
  await page.goto("/parcours");

  await expect(page.getByText(/niveau précédent n'est pas encore acquis/i).first()).toBeVisible();
});

test("the passing threshold is stated, not implied", async ({ page }) => {
  await page.goto("/parcours");

  await expect(page.getByRole("heading", { name: /Déblocage au score de 75/ }).first()).toBeVisible();
});

test("an activity with no result yet is marked as not started rather than as zero", async ({ page }) => {
  await page.goto("/parcours");

  // A component at 0 % because nothing was attempted must not read like a
  // component at 0 % because everything went badly.
  await expect(page.getByText(/Exercices directs : non commencé/).first()).toBeVisible();
});

test("the page says progression is not being stored", async ({ page }) => {
  await page.goto("/parcours");

  await expect(page.getByText(/parcours vierge/).first()).toBeVisible();
});

test("the public starting state has no level zero and opens the declared demo exercise", async ({
  page
}) => {
  await page.goto("/parcours");
  await expect(page.getByText(/niveau 0/i)).toHaveCount(0);

  expect((await page.goto("/modules/comptabilite-generale/1"))?.status()).toBe(200);
  expect(
    (await page.goto("/modules/comptabilite-generale/exercices/ex-cgv1-achat-marchandises"))
      ?.status()
  ).toBe(200);
});

test("a direct URL cannot bypass a locked level", async ({ page }) => {
  expect((await page.goto("/modules/comptabilite-generale/2"))?.status()).toBe(404);
  expect(
    (await page.goto("/modules/comptabilite-generale/exercices/ex-cgv1-tva-a-decaisser"))
      ?.status()
  ).toBe(404);
});
