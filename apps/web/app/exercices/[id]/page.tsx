import { notFound } from "next/navigation";
import { exercises } from "@finance/domain";
import { ExercisePanel } from "@/components/exercise-panel";
import { ExerciseAttemptForm } from "@/components/forms/exercise-attempt-form";

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exercise = exercises.find((item) => item.id === id);

  if (!exercise) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Exercice</span>
          <h1>{exercise.title}</h1>
          <p>Niveau {exercise.level} · {exercise.estimatedMinutes} minutes</p>
        </div>
      </section>

      <ExercisePanel exercise={exercise} />
      <ExerciseAttemptForm exercise={exercise} />
    </div>
  );
}
