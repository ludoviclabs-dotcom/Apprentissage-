import { CorrectionSummary } from "@/components/correction-summary";
import { getCorrectionHistory, getExercises } from "@finance/db";
import { notFound } from "next/navigation";

export default async function CorrectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ corrections, attempts }, exercises] = await Promise.all([getCorrectionHistory(), getExercises()]);
  const correction = corrections.find((item) => item.id === id);

  if (!correction) {
    notFound();
  }

  const attempt = attempts.find((item) => item.correctionId === correction.id);
  const exercise = exercises.find((item) => item.id === correction.exerciseId);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Correction detail</span>
          <h1>{exercise?.title ?? "Correction"}</h1>
          <p>Lecture complete de la tentative, du score, des erreurs et de la remediation associee.</p>
        </div>
      </section>

      <section className="panel detail-grid">
        <dl>
          <div>
            <dt>Exercice</dt>
            <dd>{correction.exerciseId}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{correction.score}/20</dd>
          </div>
          <div>
            <dt>Tentative</dt>
            <dd>{attempt?.createdAt.slice(0, 10) ?? "Non historisee"}</dd>
          </div>
          <div>
            <dt>Remediation</dt>
            <dd>1 action ciblee</dd>
          </div>
        </dl>
      </section>

      {attempt ? (
        <section className="panel">
          <span className="section-label">Reponse utilisateur</span>
          <p className="statement">{attempt.userAnswer}</p>
        </section>
      ) : null}

      <CorrectionSummary correction={correction} label="Correction sourcee" />
    </div>
  );
}
