"use client";

/**
 * Production-safe fallback for a failed server render, including an unavailable
 * configured database. The diagnostic stays in server logs; rendering it here
 * would disclose infrastructure details to every visitor.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="content page-stack">
      <section className="page-header">
        <span className="section-label">Service</span>
        <h1>Service temporairement indisponible</h1>
        <p>La plateforme ne peut pas traiter cette demande pour le moment. Réessaie dans quelques instants.</p>
        <button type="button" onClick={reset}>
          Réessayer
        </button>
      </section>
    </main>
  );
}
