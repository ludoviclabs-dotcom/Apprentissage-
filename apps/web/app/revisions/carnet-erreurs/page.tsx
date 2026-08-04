import type { Metadata } from "next";
import Link from "next/link";
import type { ErrorCategory, ErrorJournalEntry } from "@finance/domain";
import { getErrorJournal } from "@finance/db";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Carnet d'erreurs — Réviser",
  description:
    "Les erreurs à retravailler après un exercice, classées par nature et rattachées à une compétence."
};

/**
 * Le carnet d'erreurs, sur sa propre route.
 *
 * C'était une ancre : `/revisions#carnet-erreurs`. Le menu y menait, mais la
 * page atteinte s'appelait « Session du jour », l'entrée « Session du jour »
 * restait active et le carnet n'était qu'une section en bas d'écran. Trois
 * signaux disaient au visiteur qu'il était ailleurs que là où il avait cliqué.
 *
 * EN MODE PUBLIC, LES ENTRÉES SONT DES EXEMPLES ET LE DISENT. `getErrorJournal`
 * renvoie une liste vide sans compte : afficher des erreurs sous le titre
 * « tes erreurs » attribuerait au visiteur des fautes qu'il n'a pas commises,
 * ce qui est précisément ce que l'audit de la démo publique reprochait aux
 * autres écrans. Les exemples sont donc étiquetés, séparés, et introduits par
 * une phrase qui dit qu'ils ne lui appartiennent pas.
 */

/**
 * Trois exemples couvrant les trois natures d'erreur que le produit distingue
 * (AGENTS.md) : calcul, traitement comptable, raisonnement. Ils illustrent le
 * carnet, ils ne simulent pas un historique — pas de date, pas de compteur, pas
 * de « ton » ni de « tes ».
 */
const DEMO_ENTRIES: ReadonlyArray<Pick<ErrorJournalEntry, "id" | "category" | "summary" | "nextAction" | "competencyIds">> = [
  {
    id: "demo-calcul",
    category: "calculation",
    summary: "Base de TVA calculée sur le montant TTC au lieu du montant HT.",
    nextAction: "Refaire le calcul en partant du HT, puis vérifier le sens du taux appliqué.",
    competencyIds: ["comp-tva-collectee"]
  },
  {
    id: "demo-traitement",
    category: "accounting-treatment",
    summary: "Charge constatée d'avance enregistrée en produit constaté d'avance.",
    nextAction: "Reprendre le sens de la régularisation : qui a payé, qui doit encore la prestation.",
    competencyIds: ["comp-regularisations"]
  },
  {
    id: "demo-raisonnement",
    category: "reasoning",
    summary: "Provision comptabilisée sans avoir vérifié l'obligation actuelle envers un tiers.",
    nextAction: "Reprendre les critères de comptabilisation avant de conclure, puis justifier chacun.",
    competencyIds: ["comp-provisions"]
  }
];

/**
 * Aucun statut brut ne doit atteindre l'écran (règle de `status-labels.ts`).
 * Le `Record` est total sur `ErrorCategory` : ajouter une catégorie au domaine
 * casse la compilation ici plutôt que d'afficher son identifiant.
 */
const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  calculation: "Calcul",
  "accounting-treatment": "Traitement comptable",
  reasoning: "Raisonnement",
  "source-quality": "Sources",
  "missing-element": "Élément manquant"
};

export default async function ErrorJournalPage() {
  const user = await getCurrentUser();
  const personal = user !== null;
  const entries = personal ? await getErrorJournal(user.id) : [];

  if (personal) {
    return (
      <div className="page-stack">
        <PageHeader
          label="Carnet d'erreurs"
          title="Réviser par erreur, pas seulement par chapitre"
          description="Chaque correction alimente ce carnet : la nature de l'erreur, la compétence touchée, et l'action qui la referme."
          aside={
            <div className="hero-score">
              <span>Entrées</span>
              <strong>{entries.length}</strong>
            </div>
          }
        />

        {entries.length === 0 ? (
          <EmptyState
            title="Aucune erreur à retravailler"
            description="Le carnet se remplit à partir des corrections : un exercice noté ouvre une entrée quand il révèle une erreur de calcul, de traitement ou de raisonnement."
            action={
              <Link className="primary-action inline-link" href="/exercices">
                Faire un exercice
              </Link>
            }
          />
        ) : (
          <section className="panel">
            <div className="priority-list">
              {entries.map((entry) => (
                <article key={entry.id} className="priority-row">
                  <span className="state-token needs-review">{CATEGORY_LABELS[entry.category]}</span>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>{entry.nextAction}</p>
                    <small>
                      {entry.createdAt.slice(0, 10)}
                      {entry.competencyIds.length > 0 ? ` · ${entry.competencyIds.join(", ")}` : ""}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        label="Carnet d'erreurs"
        title="Exemple de carnet d'erreurs"
        description="Le carnet rassemble les erreurs à retravailler après vos exercices. Les éléments ci-dessous illustrent son fonctionnement et ne vous sont pas attribués."
      />

      <section className="panel" aria-labelledby="carnet-exemples">
        <span className="section-label">Exemples</span>
        <h2 id="carnet-exemples">Trois natures d'erreur, trois façons de la refermer</h2>
        <div className="priority-list" data-testid="error-journal-examples">
          {DEMO_ENTRIES.map((entry) => (
            <article key={entry.id} className="priority-row" data-demo="true">
              <span className="state-token processing">{CATEGORY_LABELS[entry.category]}</span>
              <div>
                <strong>{entry.summary}</strong>
                <p>{entry.nextAction}</p>
                <small>Exemple de démonstration · {entry.competencyIds.join(", ")}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <span className="section-label">Comment il se remplit</span>
        <h2>Une correction, une entrée</h2>
        <p className="muted">
          Une erreur relevée par une correction ouvre une entrée : sa nature, la compétence
          concernée, et l'action à mener avant le retest. Le carnet se lit dans l'autre sens que le
          cours — par ce qui a échoué, pas par le plan du chapitre.
        </p>
        <Link className="primary-action inline-link" href="/exercices/session-decouverte">
          Lancer la session découverte
        </Link>
      </section>
    </div>
  );
}
