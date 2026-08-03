"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/api-client";

/**
 * Asks the server to issue the attestation for a track.
 *
 * The button is rendered only when the server already judged the track eligible,
 * but the route re-checks completion and entitlement anyway — this component is
 * a convenience, not a permission.
 */
export function CertificateRequestButton({ trackId }: { trackId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCertificate() {
    setPending(true);
    setError(null);

    const outcome = await postJson<{ certificate: { serial: string } }>("/api/certificates", {
      trackId
    });

    if (!outcome.ok) {
      setPending(false);
      setError(outcome.error);
      return;
    }

    router.push(`/attestations/${outcome.data.certificate.serial}`);
  }

  return (
    <div>
      <button
        type="button"
        className="primary-action"
        disabled={pending}
        onClick={() => void requestCertificate()}
      >
        {pending ? "Émission..." : "Éditer l'attestation"}
      </button>
      {error ? <p className="result-inline error">{error}</p> : null}
    </div>
  );
}
