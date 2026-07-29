import { expect, test, type Page } from "@playwright/test";

/**
 * The real authentication flow, against PostgreSQL with accounts enabled.
 *
 * Only the `authenticated` Playwright project matches this file, and that project
 * only exists when `PLAYWRIGHT_AUTH_DATABASE_URL` is set. CI always sets it.
 */

const STRONG_PASSWORD = "correct horse battery staple";

function emailFor(workerIndex: number, label: string): string {
  return `${label}-${workerIndex}@example.test`;
}

/**
 * Registers through the UI and does not return until the session cookie is set
 * and the client has left /signup.
 *
 * Both waits matter: navigating away while the POST is still in flight cancels
 * it, so the browser never receives Set-Cookie and the next page renders as
 * anonymous. Asserting the status here also turns a failed signup into a clear
 * error instead of a confusing timeout further down the test.
 */
async function signUp(page: Page, email: string, password = STRONG_PASSWORD) {
  await page.goto("/signup");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);

  const pendingSignup = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/signup") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "Créer le compte" }).click();

  const response = await pendingSignup;
  expect(response.status(), `signup for ${email}`).toBe(201);

  await page.waitForURL((url) => !url.pathname.startsWith("/signup"));
}

test("a short password keeps the submit button disabled", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Adresse e-mail").fill("short-pw@example.test");
  await page.getByLabel("Mot de passe").fill("tooshort");

  await expect(page.getByRole("button", { name: "Créer le compte" })).toBeDisabled();
});

test("signing up creates a session and shows the account", async ({ page }, testInfo) => {
  const email = emailFor(testInfo.workerIndex, "signup");

  await signUp(page, email);

  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(email).first()).toBeVisible();
});

test("a wrong password is rejected and surfaced in the UI", async ({ page, request }, testInfo) => {
  const email = emailFor(testInfo.workerIndex, "wrongpw");

  const created = await request.post("/api/auth/signup", {
    data: { email, password: STRONG_PASSWORD }
  });
  // 409 when a previous run already registered this address.
  expect([201, 409]).toContain(created.status());

  const rejected = await request.post("/api/auth/login", {
    data: { email, password: "definitely not the password" }
  });
  expect(rejected.status()).toBe(401);

  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("definitely not the password");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByText(/Adresse e-mail ou mot de passe incorrect/)).toBeVisible();
});

test("a protected route redirects to login once signed out", async ({ page }, testInfo) => {
  await signUp(page, emailFor(testInfo.workerIndex, "signout"));

  await page.goto("/account");

  const pendingLogout = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/logout") && response.request().method() === "POST"
  );

  await page.getByRole("button", { name: "Se déconnecter" }).click();
  expect((await pendingLogout).status()).toBe(204);
  await page.waitForURL(/\/login/);

  await page.goto("/progression");
  await expect(page).toHaveURL(/\/login\?next=%2Fprogression/);
});

test("a forged session cookie cannot read personal API data", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  expect(typeof baseURL, "authenticated project base URL").toBe("string");
  const origin = new URL(baseURL as string).origin;
  const context = await browser.newContext();

  try {
    await context.addCookies([
      {
        name: "flh_session",
        value: "forged-session-token",
        url: origin
      }
    ]);

    const [progress, revisions] = await Promise.all([
      context.request.get(new URL("/api/progress", origin).toString()),
      context.request.get(new URL("/api/revisions/due", origin).toString())
    ]);

    expect(progress.status()).toBe(401);
    expect(revisions.status()).toBe(401);
  } finally {
    await context.close();
  }
});

test("two accounts never see each other's identity", async ({ browser }, testInfo) => {
  // Separate contexts mean separate cookie jars: two genuinely different users.
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

  const emailA = emailFor(testInfo.workerIndex, "isolation-a");
  const emailB = emailFor(testInfo.workerIndex, "isolation-b");

  try {
    await signUp(pageA, emailA);
    await signUp(pageB, emailB);

    await pageA.goto("/account");
    await pageB.goto("/account");

    const bodyA = (await pageA.locator("main.content").textContent()) ?? "";
    const bodyB = (await pageB.locator("main.content").textContent()) ?? "";

    expect(bodyA).toContain(emailA);
    expect(bodyA).not.toContain(emailB);
    expect(bodyB).toContain(emailB);
    expect(bodyB).not.toContain(emailA);

    // The user id is the RLS ownership key; it must never cross over.
    const idA = bodyA.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
    expect(idA, "user A id should be rendered on /account").toBeTruthy();
    expect(bodyB).not.toContain(idA as string);
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
