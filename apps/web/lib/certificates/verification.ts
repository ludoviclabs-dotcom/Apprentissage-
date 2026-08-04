import "server-only";
import { getEnv, resolveAppUrl } from "@/lib/env";

/**
 * The absolute URL a QR code points at.
 *
 * Absolute because the code is scanned from paper by a phone that has no idea
 * which deployment printed it. It reuses `resolveAppUrl`, the same helper the
 * Stripe success and cancel URLs go through, so a preview deployment prints a
 * link back to itself rather than to production.
 */
export const VERIFICATION_PATH = "/verify";

export function verificationUrl(verificationId: string): string {
  return `${resolveAppUrl(getEnv())}${VERIFICATION_PATH}/${verificationId}`;
}
