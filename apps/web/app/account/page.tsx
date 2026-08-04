import type { Metadata } from "next";
import Link from "next/link";
import { getUserProfile } from "@finance/db";
import { FeatureNotice } from "@/components/feature-notice";
import { SignOutButton } from "@/components/forms/sign-out-button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = {
  title: "Mon compte",
  description: "Identité, session et données privées rattachées au compte."
};

export default async function AccountPage() {
  const features = getFeatures();
  const user = await getCurrentUser();

  if (!features.auth.enabled) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Compte</span>
            <h1>Comptes désactivés</h1>
            <p>
              Ce déploiement fonctionne sans comptes : les données ne sont attribuées à personne et
              restent partagées.
            </p>
          </div>
        </section>
        <section className="panel">
          <FeatureNotice feature={features.auth} />
          {/* La marche à suivre — quelles variables activer, dans quel ordre —
              est une consigne d'exploitation. Elle vit dans le runbook, pas
              dans une page que n'importe quel visiteur peut ouvrir. */}
          <p className="muted">
            L'activation des comptes est une opération d'administration : elle se fait au
            déploiement, en suivant le guide d'installation du dépôt.
          </p>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Compte</span>
            <h1>Session expirée</h1>
            <p>Reconnecte-toi pour retrouver ton espace privé.</p>
          </div>
        </section>
        <section className="panel">
          <Link href="/login" className="primary-action inline-link">
            Se connecter
          </Link>
        </section>
      </div>
    );
  }

  // Read through row level security: this returns the caller's profile or
  // nothing at all, never somebody else's.
  const profile = await getUserProfile(user.id).catch(() => null);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Compte</span>
          <h1>{profile?.displayName || user.email}</h1>
          <p>Tes tentatives, révisions, erreurs et examens sont privés et rattachés à ce compte.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Session</span>
            <h2>Identité</h2>
          </div>
        </div>
        <div className="document-table">
          <article className="document-row">
            <span className="state-token ready">E-mail</span>
            <div>
              <strong>{user.email}</strong>
            </div>
            <span />
            <span />
            <span />
          </article>
          <article className="document-row">
            <span className="state-token ready">Identifiant</span>
            <div>
              <strong>{user.id}</strong>
              <small>Clé d'ownership utilisée par les policies RLS.</small>
            </div>
            <span />
            <span />
            <span />
          </article>
        </div>
        <FeatureNotice feature={features.persistence} />
        <SignOutButton />
      </section>
    </div>
  );
}
