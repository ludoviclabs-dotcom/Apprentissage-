"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);

    const outcome = await postJson<unknown>("/api/auth/logout", {});

    setPending(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    router.refresh();
    router.push("/login");
  }

  return (
    <div>
      <button type="button" className="secondary-action" disabled={pending} onClick={() => void signOut()}>
        {pending ? "Déconnexion..." : "Se déconnecter"}
      </button>
      {error ? <p className="result-inline error">{error}</p> : null}
    </div>
  );
}
