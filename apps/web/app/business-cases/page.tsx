import { BusinessCaseAttemptForm } from "@/components/forms/business-case-attempt-form";
import { DomainBadge } from "@/components/domain-badge";
import { SourceReference } from "@/components/source-reference";
import { getBusinessCaseModel } from "@/lib/view-model";

export default async function BusinessCasesPage() {
  const model = await getBusinessCaseModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Business Cases</span>
          <h1>Lab avance pour decisions argumentees</h1>
          <p>
            Les cas pratiques viennent apres les fondations : dossier, preuves, questions, rendu et correction de
            justification.
          </p>
        </div>
        <div className="hero-score">
          <span>Cas</span>
          <strong>{model.businessCases.length}</strong>
        </div>
      </section>

      {model.businessCases.map((businessCase) => (
        <article key={businessCase.id} className="panel business-case-panel">
          <div className="panel-heading">
            <div>
              <DomainBadge domainId={businessCase.domainId} />
              <h2>{businessCase.title}</h2>
            </div>
            <span className={`state-token ${businessCase.status === "locked" ? "needs-review" : "ready"}`}>
              {businessCase.status}
            </span>
          </div>
          <p>{businessCase.description}</p>
          <div className="expected-answer">
            <strong>Dossier</strong>
            <p>{businessCase.dossier}</p>
          </div>
          <div className="document-table">
            {businessCase.documents.map((document) => (
              <article key={document.id} className="document-row">
                <span className="state-token ready">Doc</span>
                <div>
                  <strong>{document.title}</strong>
                  <small>{document.summary}</small>
                </div>
                <span />
                <span />
                <span />
              </article>
            ))}
          </div>
          <div className="logic-grid">
            {businessCase.questions.map((question) => (
              <article key={question.id}>
                <span>Question</span>
                <p>{question.prompt}</p>
              </article>
            ))}
          </div>
          <div className="expected-answer">
            <strong>Rendu attendu</strong>
            <p>{businessCase.expectedDeliverable}</p>
          </div>
          <BusinessCaseAttemptForm businessCaseId={businessCase.id} />
          <SourceReference sources={businessCase.sourceReferences} />
        </article>
      ))}
    </div>
  );
}
