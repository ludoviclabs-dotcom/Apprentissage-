import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Lora, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
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
 * Les trois familles de la refonte, chargées par `next/font`.
 *
 * PAS DE `<link>` VERS GOOGLE FONTS, et c'est la contrainte qui décide.
 * `AGENTS.md` interdit de supposer un accès réseau au runtime ; une feuille de
 * style distante ferait dépendre le rendu d'une requête sortante à chaque
 * visite, et une installation privée hors ligne afficherait une police de
 * repli sans savoir pourquoi. `next/font` télécharge au *build*, réécrit les
 * `@font-face` vers des fichiers servis par l'application, et n'émet aucune
 * requête tierce au runtime.
 *
 * Contrepartie assumée : le premier build a besoin du réseau (les fichiers sont
 * ensuite mis en cache). C'est un déplacement de la dépendance du runtime vers
 * le build, pas sa disparition.
 *
 * Les trois familles portent un rôle, pas une humeur : Lora pour les titres
 * éditoriaux, Schibsted Grotesk pour l'interface, Spline Sans Mono pour les
 * données chiffrées — montants, scores, numéros de compte — où l'alignement des
 * chiffres est une aide à la lecture, pas un effet.
 */
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-sans-loaded"
});

const display = Lora({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-display-loaded"
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-mono-loaded"
});

/** Les variables de police vivent sur `<html>`, donc `tokens.css` les voit. */
const FONT_VARIABLES = `${sans.variable} ${display.variable} ${mono.variable}`;

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
      <html lang="fr" className={FONT_VARIABLES}>
        <body>
          <PublicShell runtime={runtime}>{children}</PublicShell>
        </body>
      </html>
    );
  }

  const role = getViewerRole(user);
  const dueReviews = await getDueReviews(user?.id);

  return (
    <html lang="fr" className={FONT_VARIABLES}>
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
