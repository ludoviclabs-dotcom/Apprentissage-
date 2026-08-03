import Link from "next/link";
import { SourceReference } from "@/components/source-reference";
import { COMPTA_MODULE_BASE } from "@/lib/compta-module";
import { comptaGeneraleV1MiniCase } from "@finance/domain";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExerciseAccess } from "@/lib/learning-progression";

/**
 * The dossier: every document of the month, then the steps that use them.
 *
 * The documents are shown before the first entry because that is the order the
 * work happens in — a month's accounting starts by reading the pieces, not by
 * being told which account to debit.
 */
export default async function ComptaGeneraleMiniCasePage() {
  const miniCase = comptaGeneraleV1MiniCase;
  const user = await getCurrentUser();
  const accessByExercise = new Map(
    await Promise.all(
      miniCase.steps.map(async (step) => [
        step.exerciseId,
        await getExerciseAccess({ userId: user?.id, exerciseId: step.exerciseId })
      ] as const)
    )
  );

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Mini-cas</span>
          <h1>{miniCase.title}</h1>
          <p>{miniCase.context}</p>
        </div>
        <div className="hero-score">
          <span>Étapes</span>
          <strong>{miniCase.steps.length}</strong>
        </div>
      </section>

      <section className="panel">
        <span className="section-label">Dossier</span>
        <h2>{miniCase.documents.length} pièces justificatives</h2>
        <div className="priority-list">
          {miniCase.documents.map((document) => (
            <article key={document.id} className="priority-row">
              <span className="state-token processing">{document.date}</span>
              <div>
                <strong>{document.reference}</strong>
                <p>{document.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Travail à faire</span>
            <h2>Enregistrer le mois, puis liquider la TVA</h2>
            <p>
              Chaque étape est corrigée immédiatement. La dernière liquide la déclaration de TVA du mois,
              à partir des seules pièces ci-dessus : à toi de retrouver ce qui se déduit et ce qui ne se
              déduit pas.
            </p>
          </div>
          <Link className="primary-action" href={`${COMPTA_MODULE_BASE}/cas-pratique/1`}>
            Commencer le cas
          </Link>
        </div>
        <ol className="level-list">
          {miniCase.steps.map((step, index) => {
            const document = miniCase.documents.find((item) => item.id === step.documentId);

            return (
              <li key={step.exerciseId} className="level-row available">
                <div className="level-row-head">
                  <span className="level-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <strong>{step.instruction}</strong>
                    <small>{document?.reference}</small>
                  </div>
                  {accessByExercise.get(step.exerciseId)?.allowed ? (
                    <Link
                      className="secondary-action"
                      href={`${COMPTA_MODULE_BASE}/cas-pratique/${index + 1}`}
                    >
                      Étape {index + 1}
                    </Link>
                  ) : (
                    <span className="secondary-action" aria-disabled="true">
                      Étape verrouillée
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel">
        <span className="section-label">Sources</span>
        <SourceReference sources={miniCase.sourceReferences} />
      </section>
    </div>
  );
}
