import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
  assertPasswordStrength,
  hashPassword,
  verifyPassword
} from "@/lib/auth/password";

const VALID = "correct horse battery staple";

describe("assertPasswordStrength", () => {
  it("rejects a password below the minimum length", () => {
    expect(() => assertPasswordStrength("a".repeat(MIN_PASSWORD_LENGTH - 1))).toThrow(WeakPasswordError);
  });

  it("accepts a password at the minimum length", () => {
    expect(() => assertPasswordStrength("a".repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
  });

  it("rejects whitespace-only passwords", () => {
    expect(() => assertPasswordStrength(" ".repeat(MIN_PASSWORD_LENGTH + 4))).toThrow(WeakPasswordError);
  });
});

describe("hashPassword", () => {
  it("produces a self-describing record", async () => {
    const hash = await hashPassword(VALID);
    const [algorithm, N, r, p, salt, digest] = hash.split("$");

    expect(algorithm).toBe("scrypt");
    expect(Number(N)).toBeGreaterThan(1);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
    expect(salt.length).toBeGreaterThan(0);
    expect(digest.length).toBeGreaterThan(0);
  });

  it("never stores the password itself", async () => {
    const hash = await hashPassword(VALID);

    expect(hash).not.toContain(VALID);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [first, second] = await Promise.all([hashPassword(VALID), hashPassword(VALID)]);

    expect(first).not.toBe(second);
    await expect(verifyPassword(VALID, first)).resolves.toBe(true);
    await expect(verifyPassword(VALID, second)).resolves.toBe(true);
  });

  it("refuses to hash a weak password", async () => {
    await expect(hashPassword("short")).rejects.toThrow(WeakPasswordError);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password", async () => {
    await expect(verifyPassword(VALID, await hashPassword(VALID))).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    await expect(verifyPassword("not the password at all", await hashPassword(VALID))).resolves.toBe(false);
  });

  it("is insensitive to unicode normalization form", async () => {
    // The same text typed on different keyboards can arrive as NFC or NFD.
    const composed = "mot de passe éléphant";
    const decomposed = composed.normalize("NFD");

    expect(composed).not.toBe(decomposed);
    await expect(verifyPassword(decomposed, await hashPassword(composed))).resolves.toBe(true);
  });

  it("returns false rather than throwing on malformed stored values", async () => {
    for (const malformed of [
      "",
      "not-a-hash",
      "scrypt$",
      "scrypt$16384$8$1$onlyfiveparts",
      "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
      "scrypt$0$8$1$c2FsdA==$aGFzaA==",
      "scrypt$16384$8$1$$",
      "scrypt$abc$8$1$c2FsdA==$aGFzaA=="
    ]) {
      await expect(verifyPassword(VALID, malformed), malformed).resolves.toBe(false);
    }
  });

  it("verifies a record produced with different cost parameters", async () => {
    // Simulates an old row after the defaults are raised.
    const legacy = ["scrypt", 16384, 8, 1].join("$");
    const hash = await hashPassword(VALID);
    const [, , , , salt, digest] = hash.split("$");
    const rehashed = `${legacy}$${salt}$${digest}`;

    // Different N than the one used to derive: must not accidentally pass.
    await expect(verifyPassword(VALID, rehashed)).resolves.toBe(false);
  });
});
