import type { Metadata } from "next";
import { LearningCard } from "@/components/learning-card";
import { DiagnosticForm } from "@/components/forms/diagnostic-form";
import { SourceSearchForm } from "@/components/forms/source-search-form";
import { TutorAskForm } from "@/components/forms/tutor-ask-form";
import { PageHeader } from "@/components/ui/page-header";
import { getLearningModel } from "@/lib/view-model";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCanonicalLearningProgression } from "@/lib/learning-progression";

export const metadata: Metadata = {
  title: "Apprendre",
  description: "Notions guidées et prochaine action dérivée du curriculum publié."
};

export default async function LearnPage() {
  const user = await getCurrentUser();
  const [{ lessons }, progression] = await Promise.all([
    getLearningModel(user?.id),
    getCanonicalLearningProgression(user?.id)
  ]);
  const currentLesson = lessons[0];

  if (!currentLesson) {
    return (
      <div className="page-stack learn-page">
        <section className="page-header">
          <div>
            <span className="section-label">Apprendre</span>
            <h1>Aucune leçon disponible</h1>
            <p>Le parcours ne contient ni jour courant ni leçon. Lance `pnpm db:seed` ou repasse en mode seedé.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack learn-page">
      {/* L'entête pose la page sur le canvas : la première carte est le
          panneau de prochaine action, pas un cadre autour du titre. */}
      <PageHeader
        variant="plain"
        label="Apprendre"
        title="Comprendre la logique avant de répondre"
        description="Chaque notion est découpée en concept, règle, raisonnement, exemple, erreur fréquente et exercice lié."
      />

      <section className="panel focus-panel">
        <div>
          <span className="section-label">
            {progression.mode === "demo" ? "Exemple de parcours" : "Prochaine action"}
          </span>
          <h2>{progression.nextAction?.title ?? "Parcours publié terminé"}</h2>
          <p>
            {progression.nextAction
              ? "Cette action est calculée depuis les niveaux et preuves du curriculum canonique."
              : "Aucun ancien jour seedé n'est substitué à ton état."}
          </p>
        </div>
        <div className="learn-score">
          <span className="section-label">Score</span>
          <strong>{progression.score === null ? "Neutre" : `${Math.round(progression.score)} %`}</strong>
        </div>
      </section>

      <LearningCard lesson={currentLesson} showExerciseAction />

      <DiagnosticForm />

      {/* Interroger le tuteur et fouiller le corpus sont le même geste vu de
          deux côtés : ils partagent la rangée. */}
      <div className="learn-duo">
        <TutorAskForm />

        <SourceSearchForm />
      </div>
    </div>
  );
}
