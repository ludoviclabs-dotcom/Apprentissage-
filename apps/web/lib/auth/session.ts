import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque, database-backed sessions.
 *
 * The cookie carries a high-entropy random token. Only its SHA-256 digest is
 * stored, so a database read cannot be replayed as a login — the same reason
 * password hashes are not stored in clear. Sessions are rows, which makes them
 * revocable; a stateless signed JWT would not be.
 */

export const SESSION_COOKIE_NAME = "flh_session";

/** 32 bytes of CSPRNG output — 256 bits, far beyond guessing range. */
const TOKEN_BYTES = 32;

export const SESSION_TTL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IssuedSession {
  /** Sent to the browser. Never stored. */
  token: string;
  /** Stored in the database. Never sent. */
  tokenHash: string;
  expiresAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueSession(now = new Date(), ttlDays = SESSION_TTL_DAYS): IssuedSession {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + ttlDays * MS_PER_DAY)
  };
}

export function isSessionExpired(expiresAt: Date | string, now = new Date()): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  if (Number.isNaN(expiry.getTime())) {
    return true;
  }

  return expiry.getTime() <= now.getTime();
}

/**
 * Slide the expiry only once the session is past halfway, so a busy tab does not
 * write to the sessions table on every request.
 */
export function shouldRefreshSession(
  expiresAt: Date | string,
  now = new Date(),
  ttlDays = SESSION_TTL_DAYS
): boolean {
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);

  if (Number.isNaN(expiry.getTime())) {
    return false;
  }

  const remaining = expiry.getTime() - now.getTime();

  return remaining > 0 && remaining < (ttlDays * MS_PER_DAY) / 2;
}

/** Constant-time comparison for opaque tokens of equal expected length. */
export function tokensMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires: Date;
}

export function sessionCookieOptions(expiresAt: Date, isSecureContext: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    // `lax` still sends the cookie on top-level navigation, which is what a
    // learning app needs, while blocking cross-site POSTs.
    sameSite: "lax",
    secure: isSecureContext,
    path: "/",
    expires: expiresAt
  };
}
