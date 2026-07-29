import { expect, test } from "@playwright/test";

/**
 * Level states with no progression stored — the seeded demo and the public demo.
 *
 * The track must render the honest starting position: level 1 open, the rest
 * gated. Showing four open levels, or four locked ones, would both misrepresent
 * where a learner stands.
 */

test("the track shows level one open and the rest gated", async ({ page }) => {
  await page.goto("/parcours");

  const rows = page.locator("[data-level-status]");
  await expect(rows).toHaveCount(4);

  await expect(rows.nth(0)).toHaveAttribute("data-level-status", "available");

  for (const index of [1, 2, 3]) {
    await expect(rows.nth(index)).toHaveAttribute("data-level-status", "locked");
  }
});

test("a gated level explains what opens it", async ({ page }) => {
  await page.goto("/parcours");

  await expect(page.getByText(/Termine le niveau 1 pour ouvrir celui-ci/).first()).toBeVisible();
});

test("the passing threshold is stated, not implied", async ({ page }) => {
  await page.goto("/parcours");

  await expect(page.getByRole("heading", { name: /Déblocage au score de 75/ })).toBeVisible();
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
