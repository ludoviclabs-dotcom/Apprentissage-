import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getRuntimeFlags } from "@/lib/runtime-flags";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Learning Hub",
  description: "Plateforme privée local-first pour apprendre, s'exercer et comprendre la logique finance."
};

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
