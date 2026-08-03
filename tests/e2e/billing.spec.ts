import { expect, test } from "@playwright/test";

/**
 * Billing with no Stripe configured — which is what a private local-first
 * install is, and what both default Playwright projects boot.
 *
 * The point of these assertions is the *absence* of a paywall. PR-07 adds a
 * gate, and the failure mode worth catching in CI is the one where that gate
 * engages on a deployment that never sold anything: an owner who cloned the
 * repo would find their own Excel lab locked behind a subscription they cannot
 * buy. So the lab must still open, and the offer page must say plainly that
 * payment is off rather than showing a dead checkout button.
 */

test("the offer page says billing is off instead of showing a dead button", async ({ page }) => {
  await page.goto("/billing");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Paiement désactivé");
  await expect(page.getByRole("button", { name: /S'abonner/ })).toHaveCount(0);
});

test("the excel lab stays open when nothing is sold", async ({ page }) => {
  await page.goto("/modules/excel-finance-lab");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Excel Finance Lab");
  // The paywall panel must not be rendered at all.
  await expect(page.getByText("réservé aux abonnés")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ouvrir le niveau 1/ })).toBeVisible();
});

test("a lab exercise page still serves its statement", async ({ page }) => {
  await page.goto("/modules/excel-finance-lab/1");
  await page.getByRole("link", { name: "Ouvrir l'exercice" }).first().click();

  await expect(page.getByText("Énoncé")).toBeVisible();
});

test("the cancel page reports that nothing happened", async ({ page }) => {
  await page.goto("/billing/cancel");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Paiement abandonné");
  await expect(page.getByText("Aucun montant n'a été débité")).toBeVisible();
});

test("the success page grants nothing on its own", async ({ page }) => {
  // A fabricated session id: the page must not read it, let alone trust it.
  await page.goto("/billing/success?session_id=cs_test_forged_by_anyone");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("cs_test_forged_by_anyone")).toHaveCount(0);
});

test("the webhook endpoint refuses an unsigned request", async ({ request }) => {
  const response = await request.post("/api/stripe/webhook", {
    data: { id: "evt_forged", type: "customer.subscription.created" }
  });

  // 503 with billing off, 400 once it is on. Never 2xx: an unsigned body must
  // not be able to reach the entitlement writer under any configuration.
  expect(response.status()).toBeGreaterThanOrEqual(400);
});

test("checkout cannot be started without configuration", async ({ request }) => {
  const response = await request.post("/api/stripe/checkout", {
    data: { plan: "founder-annual" }
  });

  expect(response.ok()).toBeFalsy();
});
