import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getReviewQueue } from "@finance/db";
import { AppShell } from "@/components/shell/app-shell";
import { PublicShell } from "@/components/shell/public-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canManageSources, getViewerRole } from "@/lib/auth/roles";
import { getRuntimeFlags } from "@/lib/runtime-flags";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Finance Learning Hub",
    template: "%s · Finance Learning Hub"
  },
  description: "Plateforme privée local-first pour apprendre, s'exercer et comprendre la logique finance."
};

/**
 * Every screen reflects runtime configuration: public-demo lockdown, database
 * mode, AI provider. Prerendering would bake the values present at build time —
 * which is how the public-demo banner and every disabled write control silently
 * failed to appear on a production build made with the flag unset.
 */
export const dynamic = "force-dynamic";

/**
 * Le nombre de révisions dues alimente l'indicateur discret de la sidebar.
 * Best-effort : une base indisponible rend un shell sans indicateur, pas une
 * erreur de layout qui masquerait toutes les pages.
 */
async function getDueReviews(userId: string | undefined): Promise<number | null> {
  if (!userId) {
    return null;
  }

  try {
    const queue = await getReviewQueue(userId);
    return queue.dueCount;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const runtime = getRuntimeFlags();
  const user = await getCurrentUser();

  // Deux shells, une règle : l'AppShell appartient à un utilisateur identifié —
  // un compte connecté, ou le propriétaire d'une installation privée sans
  // comptes. Démonstration publique et visiteur déconnecté voient le PublicShell.
  const isAppShell = user !== null || (!runtime.publicDemo && !runtime.features.auth.enabled);

  if (!isAppShell) {
    return (
      <html lang="fr">
        <body>
          <PublicShell runtime={runtime}>{children}</PublicShell>
        </body>
      </html>
    );
  }

  const role = getViewerRole(user);
  const dueReviews = await getDueReviews(user?.id);

  return (
    <html lang="fr">
      <body>
        <AppShell
          runtime={runtime}
          user={user}
          canManageSources={canManageSources(role)}
          dueReviews={dueReviews}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
