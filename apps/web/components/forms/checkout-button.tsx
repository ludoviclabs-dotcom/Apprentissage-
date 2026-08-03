"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";

/**
 * Starts a Checkout Session and follows the URL Stripe returns.
 *
 * The component knows a plan key and nothing else. It cannot name a price, a
 * currency or an amount, because the route decides all three — a button that
 * could post a price id would be a button that could post a different one.
 */
export function CheckoutButton({ plan, label }: { plan: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setPending(true);
    setError(null);

    const outcome = await postJson<{ url: string }>("/api/stripe/checkout", { plan });

    if (!outcome.ok) {
      setPending(false);
      setError(outcome.error);
      return;
    }

    // A full navigation, not router.push: the destination is checkout.stripe.com
    // and the Next.js router cannot route to another origin.
    window.location.assign(outcome.data.url);
  }

  return (
    <div>
      <button
        type="button"
        className="primary-action"
        disabled={pending}
        onClick={() => void startCheckout()}
      >
        {pending ? "Ouverture de Stripe..." : label}
      </button>
      {error ? <p className="result-inline error">{error}</p> : null}
    </div>
  );
}
