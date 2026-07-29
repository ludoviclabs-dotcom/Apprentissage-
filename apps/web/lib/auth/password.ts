import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with `node:crypto` scrypt — no external dependency, which
 * keeps the platform local-first and offline-capable.
 *
 * Stored format: `scrypt$N$r$p$<salt-base64>$<hash-base64>`. The parameters live
 * inside the string so they can be raised later without invalidating existing
 * hashes: {@link verifyPassword} reads whatever the stored record used.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const ALGORITHM = "scrypt";
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** OWASP-recommended baseline for scrypt. */
const DEFAULT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;

/** scrypt needs roughly 128 * N * r bytes; give it headroom or it throws. */
function maxmemFor(N: number, r: number) {
  return 256 * N * r;
}

export const MIN_PASSWORD_LENGTH = 12;

export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeakPasswordError";
  }
}

/**
 * Rejects passwords that are trivially weak. Deliberately minimal: length is the
 * property that actually matters, and arbitrary composition rules push people
 * toward predictable substitutions.
 */
export function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }

  if (password.trim().length === 0) {
    throw new WeakPasswordError("Le mot de passe ne peut pas être uniquement des espaces.");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordStrength(password);

  const { N, r, p } = DEFAULT_PARAMS;
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: maxmemFor(N, r)
  });

  return [ALGORITHM, N, r, p, salt.toString("base64"), derived.toString("base64")].join("$");
}

/**
 * Constant-time verification. Returns false — never throws — on a malformed or
 * unknown stored value, so a corrupted row cannot become an authentication
 * bypass or a 500 that distinguishes existing accounts from missing ones.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== ALGORITHM) {
    return false;
  }

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N <= 1 || r <= 0 || p <= 0) {
    return false;
  }

  let expected: Buffer;
  let salt: Buffer;

  try {
    expected = Buffer.from(rawHash, "base64");
    salt = Buffer.from(rawSalt, "base64");
  } catch {
    return false;
  }

  if (expected.length === 0 || salt.length === 0) {
    return false;
  }

  let derived: Buffer;

  try {
    derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: maxmemFor(N, r)
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
