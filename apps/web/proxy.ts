import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Session gate.
 *
 * PR-01 replaced the single shared HTTP basic credential with real accounts, so
 * this now checks for a session cookie and redirects to /login instead of
 * answering 401 with a browser prompt.
 *
 * Deliberately does NOT validate the session against the database: the proxy runs
 * on every request including static assets, and a database round trip here would
 * tax them all. It only checks that a cookie is present, which is enough to route
 * anonymous visitors to the login page. Authorisation is enforced where it counts
 * — server components call `getCurrentUser()`, route handlers call
 * `requireCurrentUser()`, and PostgreSQL row level security is the backstop, so a
 * forged cookie yields no data.
 */

/** Pages that must stay reachable without a session, or login is impossible. */
const PUBLIC_PATHS = new Set(["/login", "/signup"]);

const PUBLIC_PREFIXES = [
  "/_next/",
  "/api/auth/",
  "/api/health",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml"
];

/**
 * Routes holding personal data. Everything else stays public so the seeded demo
 * keeps working: the risk called out in PR-00 was protecting every route at once
 * and taking the public demo down with it.
 */
const PROTECTED_PREFIXES = ["/account", "/progression", "/corrections", "/revisions"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function proxy(request: NextRequest) {
  const { LEARNING_HUB_AUTH_ENABLED: authEnabled } = getEnv();
  const { pathname } = request.nextUrl;

  if (!authEnabled || isPublic(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (hasSession || !isProtected(pathname)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.nextUrl);
  // Bring the visitor back where they were headed once signed in. Only the
  // path is carried over, never an absolute URL, so this cannot be turned into
  // an open redirect.
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
