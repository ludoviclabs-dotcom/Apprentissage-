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

  // PR-13: the offer is a product page now, and it renders in all four states
  // (signed in or out, billing on or off) because the offer does not change —
  // only the call to action does.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Apprendre la finance d'entreprise"
  );
  await expect(page.getByTestId("billing-faq")).toBeVisible();

  // The screen used to print FINANCE_HUB_BILLING_ENABLED, STRIPE_SECRET_KEY and
  // the price variable names to every visitor. Configuration is an operator's
  // business, not a shop window's.
  const body = (await page.locator("body").textContent()) ?? "";

  for (const leak of ["FINANCE_HUB_BILLING_ENABLED", "STRIPE_SECRET_KEY", "STRIPE_PRICE_", "docs/"]) {
    expect(body, leak).not.toContain(leak);
  }
  // No purchase control at all while billing is off: the modules are already
  // open, so a checkout button would be selling something the visitor has.
  await expect(page.getByRole("button", { name: /Souscrire/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Gérer mon abonnement/ })).toHaveCount(0);
});

test("the public verification page refuses a malformed identifier without querying", async ({
  page
}) => {
  await page.goto("/verify/not-a-verification-id");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Attestation introuvable");
});

test("a well-formed identifier says verification is unavailable without a database", async ({
  page
}) => {
  // Not "introuvable": with no database there is nothing to look up, and
  // claiming the attestation does not exist would be a different — and false —
  // statement. The unknown-versus-withdrawn indistinguishability is a
  // database-backed property and is asserted where a database exists.
  await page.goto("/verify/abcdefghjkmnpqrstvwxyz0123456789");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Vérification indisponible");

  // Scoped to the rendered page: `body.textContent()` also carries Next's RSC
  // payload from an inline <script>, which is framework plumbing rather than
  // anything this page chose to show.
  const rendered = (await page.locator("main").textContent()) ?? "";

  // No address, and no operator-facing configuration either: this is the one
  // surface in the product built for strangers.
  expect(rendered).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);

  for (const leak of ["FINANCE_HUB_USE_DATABASE", "DATABASE_URL", "STRIPE_"]) {
    expect(rendered, leak).not.toContain(leak);
  }
});

test("the customer portal cannot be opened without billing", async ({ request }) => {
  const response = await request.post("/api/stripe/portal", { data: {} });

  expect(response.ok()).toBeFalsy();
});

test("revoking an attestation is not reachable without an administrator", async ({ request }) => {
  const response = await request.post("/api/admin/certificates/revoke", {
    data: { serial: "FLH-2026-1A2B3C4D5E", reason: "test de sécurité automatisé" }
  });

  // 501 with no database here; never 200, and never a 403 that would confirm
  // the endpoint exists to an anonymous caller.
  expect(response.status()).not.toBe(200);
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
