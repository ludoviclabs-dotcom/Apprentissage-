import { getCertificateForDocument } from "@finance/db";
import { isCertificateSerial } from "@finance/domain";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getFeatures } from "@/lib/features";
import { renderCertificatePdf } from "@/lib/certificates/pdf";
import { verificationUrl } from "@/lib/certificates/verification";

/**
 * The attestation as a downloadable PDF.
 *
 * OWNER ONLY. The document carries the holder's name, their score and the
 * competencies they worked, so it is served to the account that holds it and
 * to nobody else. The public surface is `/verify/[id]`, which shows far less.
 *
 * Generation is server-side and offline: `pdf-lib` writes the bytes and the
 * standard fonts are the reader's, so this route makes no network call.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serial: string }> }
) {
  const features = getFeatures();

  if (!features.persistence.enabled) {
    return Response.json(
      { error: "Attestations indisponibles", details: features.persistence.publicMessage },
      { status: 501 }
    );
  }

  const caller = await requireCurrentUser();

  if (caller.response) {
    return caller.response;
  }

  const { serial } = await params;

  // Checked before touching the database, as the HTML page does: a malformed
  // serial is a 404, not a query.
  if (!isCertificateSerial(serial)) {
    return Response.json({ error: "Attestation introuvable" }, { status: 404 });
  }

  const certificate = await getCertificateForDocument(caller.user.id, serial);

  if (!certificate) {
    return Response.json({ error: "Attestation introuvable" }, { status: 404 });
  }

  const pdf = await renderCertificatePdf({
    serial: certificate.serial,
    content: certificate.content,
    issuedAt: certificate.issuedAt,
    verificationUrl: verificationUrl(certificate.verificationId),
    status: certificate.status
  });

  return new Response(pdf as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      // `attachment` rather than `inline`: the browser saves it instead of
      // rendering it in a tab where the URL — and the serial — would sit in
      // the address bar of a shared screen.
      "content-disposition": `attachment; filename="attestation-${certificate.serial}.pdf"`,
      // A certificate is personal and its status can change; nothing may cache
      // it, least of all a shared proxy.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
