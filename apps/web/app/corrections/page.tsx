import { CorrectionSummary } from "@/components/correction-summary";
import { getCorrectionHistory } from "@finance/db";
import Link from "next/link";

export default async function CorrectionsPage() {
  const { corrections, attempts } = await getCorrectionHistory();
  const averageScore =
    attempts.length > 0
      ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
      : 0;

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Corrections</span>
          <h1>Transformer les erreurs en remédiation</h1>
          <p>La correction sépare ce qui est juste, ce qui manque, et l'action de révision.</p>
        </div>
      </section>

      <section className="metric-strip">
        <article>
          <span>Tentatives</span>
          <strong>{attempts.length}</strong>
        </article>
        <article>
          <span>Score moyen</span>
          <strong>{averageScore}/20</strong>
        </article>
        <article>
          <span>Remédiations</span>
          <strong>{corrections.length}</strong>
        </article>
      </section>

      {corrections.map((correction) => (
        <section key={correction.id} className="linked-panel">
          <CorrectionSummary correction={correction} label="Correction historisee" />
          <Link className="secondary-action inline-link" href={`/corrections/${correction.id}`}>
            Ouvrir le detail
          </Link>
        </section>
      ))}

      <section className="panel">
        <span className="section-label">À venir</span>
        <h2>Correction d'Excel et PDF manuscrit converti</h2>
        <p>Le contrat restera identique : score, barème, erreurs, remédiation, sources et compétences impactées.</p>
      </section>
    </div>
  );
}
