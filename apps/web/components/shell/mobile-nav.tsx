"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, Menu, X } from "lucide-react";
import { SidebarNav } from "@/components/shell/sidebar-nav";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]):not([tabindex="-1"]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Header compact + drawer de navigation pour mobile et tablette.
 *
 * Le drawer est une boîte de dialogue modale : focus piégé à l'intérieur,
 * fermeture à Échap, focus rendu au bouton d'ouverture. Il remplace l'ancienne
 * bande horizontale de dix-huit onglets.
 */
export function MobileNav({
  variant,
  brandTagline,
  canManageSources = false,
  dueReviews = null,
  authEnabled,
  userEmail
}: {
  variant: "app" | "public";
  brandTagline: string;
  canManageSources?: boolean;
  dueReviews?: number | null;
  authEnabled: boolean;
  userEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  // Naviguer ferme le drawer sans voler le focus à la page atteinte.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      document.body.style.removeProperty("overflow");
      return;
    }

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      // Piège à focus : Tab boucle du dernier élément au premier, Maj+Tab
      // l'inverse. Le drawer est le seul contenu interactif tant qu'il est ouvert.
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (current === first || current === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.removeProperty("overflow");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div className="mobile-nav">
      <div className="mobile-header">
        <Link href="/" className="brand brand-compact" aria-label="Finance Learning Hub — Accueil">
          <span className="brand-mark">
            <GraduationCap size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>Finance Learning Hub</strong>
            <small>{brandTagline}</small>
          </span>
        </Link>
        <button
          ref={toggleRef}
          type="button"
          className="mobile-menu-toggle"
          aria-expanded={open}
          aria-controls="mobile-drawer"
          aria-label="Ouvrir le menu de navigation"
          onClick={() => setOpen(true)}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </div>

      {open ? (
        <div className="drawer-overlay">
          {/* Simple attrape-clic : les utilisateurs clavier et lecteur d'écran
              ferment par Échap ou par le bouton dédié du drawer. */}
          <div className="drawer-backdrop" aria-hidden="true" onClick={close} />
          <div
            ref={dialogRef}
            id="mobile-drawer"
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
          >
            <div className="drawer-head">
              <strong>Navigation</strong>
              <button
                ref={closeRef}
                type="button"
                className="mobile-menu-toggle"
                aria-label="Fermer le menu de navigation"
                onClick={close}
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>

            <SidebarNav
              variant={variant}
              canManageSources={canManageSources}
              dueReviews={dueReviews}
              idPrefix="drawer"
              onNavigate={() => setOpen(false)}
            />

            <div className="drawer-foot">
              {variant === "app" ? (
                <>
                  <Link href="/account" onClick={() => setOpen(false)}>
                    {userEmail ?? "Mon compte"}
                  </Link>
                  <Link href="/billing" onClick={() => setOpen(false)}>
                    Offre &amp; facturation
                  </Link>
                </>
              ) : authEnabled ? (
                <>
                  <Link href="/login" onClick={() => setOpen(false)}>
                    Se connecter
                  </Link>
                  <Link href="/signup" onClick={() => setOpen(false)}>
                    Créer un compte
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
