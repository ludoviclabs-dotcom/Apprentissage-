import { revokeCertificate } from "@finance/db";
import { isCertificateSerial } from "@finance/domain";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getFeatures } from "@/lib/features";

/**
 * Withdraws an attestation.
 *
 * Administration only, and gated by {@link requireAdmin} rather than by hiding
 * the link. The reason is stored in the internal trail and never reaches the
 * public verification page — a stranger with the QR code has no business
 * reading why a document was withdrawn.
 *
 * Revocation is not churn. A lapsed subscription never revokes anything: the
 * attestation records work that was done, and `billing-entitlements.integration
 * .test.ts` pins that invariant. This endpoint exists for a certificate issued
 * in error or in bad faith.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const revokeSchema = z.object({
  serial: z.string().min(1).max(64),
  // A revocation with no reason is unauditable, so the reason is required and
  // has to say something.
  reason: z.string().trim().min(10).max(2000)
});

export async function POST(request: Request) {
  const features = getFeatures();

  if (!features.persistence.enabled) {
    return Response.json(
      { error: "Administration indisponible", details: features.persistence.publicMessage },
      { status: 501 }
    );
  }

  const caller = await requireAdmin();

  if (caller.response) {
    return caller.response;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = revokeSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Révocation invalide", details: body.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  if (!isCertificateSerial(body.data.serial)) {
    return Response.json({ error: "Numéro d'attestation invalide" }, { status: 400 });
  }

  try {
    const result = await revokeCertificate({
      serial: body.data.serial,
      reason: body.data.reason,
      revokedBy: caller.admin.actor
    });

    if (result.status === "not-found") {
      return Response.json({ error: "Attestation introuvable" }, { status: 404 });
    }

    return Response.json(
      {
        status: result.status,
        // The projection only: the reason stays server-side even in an
        // administrator's response body, because that body is a screen too.
        verification: result.verification
      },
      { status: result.status === "revoked" ? 200 : 409 }
    );
  } catch (error) {
    console.error("[admin-revoke]", error);

    return Response.json({ error: "Révocation impossible" }, { status: 500 });
  }
}
