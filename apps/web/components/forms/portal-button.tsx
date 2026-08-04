"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";

/**
 * Opens Stripe's hosted customer portal.
 *
 * It posts nothing at all: the route derives the Stripe customer from the
 * session, so this component cannot name — or mistype — somebody else's.
 */
export function PortalButton({ label = "Gérer mon abonnement" }: { label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setPending(true);
    setError(null);

    const outcome = await postJson<{ url: string }>("/api/stripe/portal", {});

    if (!outcome.ok) {
      setPending(false);
      setError(outcome.error);
      return;
    }

    // A full navigation: the destination is billing.stripe.com.
    window.location.assign(outcome.data.url);
  }

  return (
    <div>
      <button
        type="button"
        className="secondary-action"
        disabled={pending}
        onClick={() => void openPortal()}
      >
        {pending ? "Ouverture du portail..." : label}
      </button>
      {error ? <p className="result-inline error">{error}</p> : null}
    </div>
  );
}
