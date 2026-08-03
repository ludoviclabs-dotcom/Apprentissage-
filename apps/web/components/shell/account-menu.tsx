"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleUserRound } from "lucide-react";
import { SignOutButton } from "@/components/forms/sign-out-button";

/**
 * Menu du compte, en disclosure : bouton `aria-expanded` + liste de liens.
 * Échap referme et rend le focus au bouton ; un clic hors du menu referme.
 *
 * L'offre et la facturation vivent ici plutôt qu'en navigation principale :
 * ce sont des affaires de compte, pas des étapes d'apprentissage.
 */
export function AccountMenu({
  authEnabled,
  userEmail
}: {
  authEnabled: boolean;
  userEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = userEmail ?? "Compte";

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="account-menu-toggle"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <CircleUserRound size={18} aria-hidden="true" />
        <span className="account-menu-label">{label}</span>
      </button>

      <div id="account-menu-panel" className="account-menu-panel" hidden={!open}>
        <ul>
          <li>
            <Link href="/account">Mon compte</Link>
          </li>
          <li>
            <Link href="/billing">Offre &amp; facturation</Link>
          </li>
        </ul>
        {authEnabled && userEmail ? (
          <div className="account-menu-signout">
            <SignOutButton />
          </div>
        ) : null}
      </div>
    </div>
  );
}
