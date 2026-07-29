"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { postJson } from "@/lib/api-client";
import { FeatureNotice } from "@/components/feature-notice";
import type { FeatureState } from "@/lib/features";

const MIN_PASSWORD_LENGTH = 12;

export function AuthForm({
  mode,
  auth,
  nextPath
}: {
  mode: "login" | "signup";
  auth: FeatureState;
  nextPath: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignup = mode === "signup";
  const locked = !auth.enabled;
  const passwordTooShort = isSignup && password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !passwordTooShort;

  async function submit() {
    setPending(true);
    setError(null);

    const outcome = await postJson<{ user: { id: string; email: string } }>(
      isSignup ? "/api/auth/signup" : "/api/auth/login",
      { email, password }
    );

    if (!outcome.ok) {
      setPending(false);
      setError(outcome.error);
      return;
    }

    // Server components must re-read the session cookie, so refresh before
    // navigating — otherwise the destination renders as anonymous.
    router.refresh();
    router.push(nextPath);
  }

  return (
    <section className="panel action-form auth-panel">
      <div>
        <span className="section-label">{isSignup ? "Créer un compte" : "Se connecter"}</span>
        <h1>{isSignup ? "Ouvrir un espace privé" : "Reprendre son parcours"}</h1>
        <p>
          Les comptes sont stockés dans ta base PostgreSQL locale. Aucun service externe n'est
          contacté.
        </p>
      </div>

      <FeatureNotice feature={auth} />

      <label>
        Adresse e-mail
        <input
          type="email"
          autoComplete="email"
          disabled={locked}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label>
        Mot de passe
        <input
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          disabled={locked}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      {isSignup ? (
        <p className="muted">
          {password.length}/{MIN_PASSWORD_LENGTH} caractères minimum.
        </p>
      ) : null}

      <button
        type="button"
        className="primary-action"
        disabled={pending || locked || !canSubmit}
        title={locked ? auth.reason : undefined}
        onClick={() => void submit()}
      >
        {pending ? "..." : isSignup ? "Créer le compte" : "Se connecter"}
      </button>

      {error ? <div className="result-box error">{error}</div> : null}

      <p className="muted">
        {isSignup ? (
          <>
            Déjà un compte ? <Link href="/login">Se connecter</Link>
          </>
        ) : (
          <>
            Pas encore de compte ? <Link href="/signup">En créer un</Link>
          </>
        )}
      </p>
    </section>
  );
}
