"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Compatibilité d'une ancre devenue une route.
 *
 * `/revisions#carnet-erreurs` était un lien de navigation ; le carnet a
 * maintenant sa propre page. Les liens déjà partagés, mis en favori ou copiés
 * dans une note continuent d'arriver sur l'ancre — et une ancre qui ne
 * correspond plus à rien dépose le visiteur en haut d'une autre page sans lui
 * dire pourquoi.
 *
 * POURQUOI CÔTÉ CLIENT. Un fragment d'URL n'est jamais envoyé au serveur : ni un
 * `redirect()` de route handler ni une règle de `next.config` ne peuvent le
 * voir. La redirection ne peut donc avoir lieu qu'ici, une fois le document
 * chargé.
 *
 * `router.replace` plutôt que `push` : l'ancienne adresse ne doit pas s'installer
 * dans l'historique, sinon le bouton Retour renvoie sur l'ancre et redirige
 * encore, indéfiniment.
 */
export function LegacyHashRedirect({ hash, href }: { hash: string; href: string }) {
  const router = useRouter();

  useEffect(() => {
    if (window.location.hash.replace(/^#/, "") === hash) {
      router.replace(href);
    }
  }, [hash, href, router]);

  return null;
}
