import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getRuntimeFlags } from "@/lib/runtime-flags";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Learning Hub",
  description: "Plateforme privée local-first pour apprendre, s'exercer et comprendre la logique finance."
};

/**
 * Every screen reflects runtime configuration: public-demo lockdown, database
 * mode, AI provider. Prerendering would bake the values present at build time —
 * which is how the public-demo banner and every disabled write control silently
 * failed to appear on a production build made with the flag unset.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const runtime = getRuntimeFlags();

  return (
    <html lang="fr">
      <body>
        <AppShell runtime={runtime}>{children}</AppShell>
      </body>
    </html>
  );
}
