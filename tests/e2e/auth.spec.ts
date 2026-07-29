import { expect, test } from "@playwright/test";

/**
 * Behaviour when accounts are OFF — the seeded and public-demo servers.
 *
 * The point is honesty: with no database there can be no accounts, and the app
 * has to say so rather than offer a form that fails on submit. The real auth flow
 * lives in `auth-enabled.spec.ts`, which only the `authenticated` project runs.
 */

const STRONG_PASSWORD = "correct horse battery staple";

test("login and signup explain that accounts are off instead of failing on submit", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Comptes désactivés/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: path === "/signup" ? "Créer le compte" : "Se connecter" })
    ).toBeDisabled();
  }
});

test("the account page states why there is no account", async ({ page }) => {
  await page.goto("/account");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Comptes désactivés/).first()).toBeVisible();
});

test("auth endpoints answer 501 rather than pretending to work", async ({ request }) => {
  for (const path of ["/api/auth/login", "/api/auth/signup"]) {
    const response = await request.post(path, {
      data: { email: "nobody@example.test", password: STRONG_PASSWORD }
    });

    expect(response.status(), path).toBe(501);
  }
});

test("the seeded demo stays reachable without a session", async ({ page }) => {
  // PR-00 flagged the risk of protecting every route at once and taking the
  // public demo down with it. The proxy only guards personal routes.
  const response = await page.goto("/progression");

  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
