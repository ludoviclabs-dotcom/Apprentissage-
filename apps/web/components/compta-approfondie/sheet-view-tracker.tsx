"use client";

import { useEffect, useRef } from "react";
import { postJson } from "@/lib/api-client";

/**
 * Enregistre qu'une fiche a été consultée — une fois, pas à chaque rendu.
 *
 * OUVRIR N'EST PAS APPRENDRE, et `computeChapterProgress` le sait : « fiche
 * consultée » vaut une dimension sur sept et ne peut à elle seule dépasser
 * « en cours ». La consultation reste néanmoins un fait qui mérite d'être
 * enregistré : c'est ce qui distingue un chapitre jamais ouvert d'un chapitre
 * lu mais pas encore travaillé.
 *
 * Le garde-fou `sent` couvre les doubles rendus du mode strict de React ; le
 * serveur déduplique de son côté, parce qu'un onglet rouvert dix fois ne doit
 * pas produire dix lignes.
 */
export function SheetViewTracker({ chapter, artifactId }: { chapter: string; artifactId: string }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) {
      return;
    }

    sent.current = true;

    void postJson("/api/apprentissage/activites", {
      action: "record",
      chapter,
      kind: "sheet_viewed",
      artifactId,
      succeeded: true
    });
  }, [chapter, artifactId]);

  return null;
}
