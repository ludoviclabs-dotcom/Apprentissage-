"use client";

import { useState } from "react";
import { postJson } from "@/lib/api-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setError(null);

    const outcome = await postJson<unknown>("/api/auth/logout", {});

    if (!outcome.ok) {
      setPending(false);
      setError(outcome.error);
      return;
    }

    // A full document load, not router.push: the client router cache still holds
    // the previous user's rendered pages, and a back-navigation would serve them
    // from memory even though the session is gone. It also avoids the race where
    // router.refresh() re-renders the current route and swallows the push.
    window.location.assign("/login");
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
