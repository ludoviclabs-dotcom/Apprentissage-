/**
 * Normalizes a `?next=` value into a safe same-origin path.
 *
 * Rejects anything that could leave the site: absolute URLs, protocol-relative
 * `//evil.example`, and backslash variants that some browsers normalise to `//`.
 * Anything suspicious falls back to the home page rather than erroring, because a
 * bad redirect target is not worth blocking a successful login over.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) {
    return fallback;
  }

  const candidate = value.trim();

  if (!candidate.startsWith("/")) {
    return fallback;
  }

  // `//host` and `/\host` are both read as protocol-relative by some browsers.
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }

  if (candidate.includes("://") || /[\r\n]/.test(candidate)) {
    return fallback;
  }

  return candidate;
}
