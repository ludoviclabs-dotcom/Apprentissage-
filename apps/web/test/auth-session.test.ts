import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  hashSessionToken,
  isSessionExpired,
  issueSession,
  sessionCookieOptions,
  shouldRefreshSession,
  tokensMatch
} from "@/lib/auth/session";

const NOW = new Date("2026-07-29T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("issueSession", () => {
  it("returns a token that is never equal to what gets stored", () => {
    const session = issueSession(NOW);

    expect(session.token).not.toBe(session.tokenHash);
    expect(session.tokenHash).toBe(hashSessionToken(session.token));
  });

  it("produces a high-entropy url-safe token", () => {
    const session = issueSession(NOW);

    expect(session.token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes in base64url.
    expect(session.token.length).toBeGreaterThanOrEqual(43);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => issueSession(NOW).token));

    expect(tokens.size).toBe(200);
  });

  it("expires after the configured lifetime", () => {
    expect(issueSession(NOW).expiresAt.getTime()).toBe(NOW.getTime() + SESSION_TTL_DAYS * DAY);
  });
});

describe("isSessionExpired", () => {
  it("is false while the session is alive", () => {
    expect(isSessionExpired(new Date(NOW.getTime() + DAY), NOW)).toBe(false);
  });

  it("is true at the exact expiry instant", () => {
    expect(isSessionExpired(NOW, NOW)).toBe(true);
  });

  it("is true once past expiry", () => {
    expect(isSessionExpired(new Date(NOW.getTime() - 1), NOW)).toBe(true);
  });

  it("treats an unparsable expiry as expired rather than valid", () => {
    expect(isSessionExpired("not-a-date", NOW)).toBe(true);
  });

  it("accepts an ISO string as stored by the database driver", () => {
    expect(isSessionExpired(new Date(NOW.getTime() + DAY).toISOString(), NOW)).toBe(false);
  });
});

describe("shouldRefreshSession", () => {
  it("does not refresh a freshly issued session", () => {
    expect(shouldRefreshSession(issueSession(NOW).expiresAt, NOW)).toBe(false);
  });

  it("refreshes once past the halfway point", () => {
    const almostGone = new Date(NOW.getTime() + (SESSION_TTL_DAYS * DAY) / 2 - 1000);

    expect(shouldRefreshSession(almostGone, NOW)).toBe(true);
  });

  it("does not refresh an already expired session", () => {
    expect(shouldRefreshSession(new Date(NOW.getTime() - DAY), NOW)).toBe(false);
  });
});

describe("tokensMatch", () => {
  it("matches identical tokens", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
  });

  it("rejects different tokens and different lengths", () => {
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("abc", "abcd")).toBe(false);
    expect(tokensMatch("", "a")).toBe(false);
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly and lax so it cannot be read by scripts or sent cross-site", () => {
    const options = sessionCookieOptions(NOW, true);

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("marks the cookie secure only in a secure context", () => {
    expect(sessionCookieOptions(NOW, true).secure).toBe(true);
    expect(sessionCookieOptions(NOW, false).secure).toBe(false);
  });

  it("uses a namespaced cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("flh_session");
  });
});
