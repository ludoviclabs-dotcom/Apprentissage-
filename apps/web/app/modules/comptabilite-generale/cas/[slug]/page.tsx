import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildClosingLedger,
  buildControlSheet,
  comptaArreteAnnuelCase,
  trialBalanceTotals,
  velociteClosingBalance
} from "@finance/domain";
import { SourceReference } from "@/components/source-reference";
import { BankReconciliation } from "@/components/tools/bank-reconciliation";
import { CaseExport } from "@/components/tools/case-export";
import { ClosingChecklist } from "@/components/tools/closing-checklist";
import { ControlSheet } from "@/components/tools/control-sheet";
import { LedgerView } from "@/components/tools/ledger-view";
import { TrialBalanceView } from "@/components/tools/trial-balance";
import { COMPTA_MODULE_BASE, getCaseStudy, listCaseStudies } from "@/lib/compta-module";

export function generateStaticParams() {
  return listCaseStudies().map((caseStudy) => ({ slug: caseStudy.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const caseStudy = getCaseStudy(slug);

  return caseStudy
    ? { title: `${caseStudy.title} — Compta générale`, description: caseStudy.context }
    : {};
}

/**
 * L'export pédagogique du dossier annuel, entièrement dérivé du domaine.
 *
 * VOLONTAIREMENT SANS LES ÉTATS FINANCIERS CHIFFRÉS : le résultat, le total du
 * bilan et la feuille maîtresse sont les réponses attendues des étapes du cas.
 * L'export fournit les pièces de travail — balance, verdicts de contrôle,
 * dossier — jamais le corrigé ; le même principe que le mini-cas N2 applique à
 * sa clôture de TVA.
 */
function buildAnnualExportMarkdown(): string {
  const totals = trialBalanceTotals();
  const checks = buildControlSheet();
  const eur = (value: number) => `${value.toLocaleString("fr-FR")} €`;

  return [
    `# Dossier annuel — ${comptaArreteAnnuelCase.title}`,
    "",
    "## Balance après inventaire au 31/12/N",
    "",
    "| Compte | Libellé | Débit | Crédit |",
    "| --- | --- | ---: | ---: |",
    ...velociteClosingBalance.map(
      (line) =>
        `| ${line.account} | ${line.label} | ${line.debit ? eur(line.debit) : ""} | ${line.credit ? eur(line.credit) : ""} |`
    ),
    `| | **Totaux** | **${eur(totals.totalDebit)}** | **${eur(totals.totalCredit)}** |`,
    "",
    "## Feuille de contrôle (verdicts)",
    "",
    ...checks.map((check) => `- [${check.passed ? "x" : " "}] ${check.label}`),
    "",
    "## Pièces du dossier",
    "",
    ...comptaArreteAnnuelCase.documents.map(
      (document) => `- ${document.reference} (${document.date}) : ${document.summary}`
    ),
    "",
    "## À produire (étapes du cas)",
    "",
    ...comptaArreteAnnuelCase.steps.map((step, index) => `${index + 1}. ${step.instruction}`),
    "",
    "_Export pédagogique généré localement — aucune donnée personnelle, aucun corrigé._"
  ].join("\n");
}

export default async function ComptaCaseStudyPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caseStudy = getCaseStudy(slug);

  if (!caseStudy) {
    notFound();
  }

  const isAnnual = caseStudy.slug === comptaArreteAnnuelCase.slug;

  return (
    <div className="page-stack">
      <section className="page-header page-header--hero">
        <div>
          <span className="section-label">Case study</span>
          <h1>{caseStudy.title}</h1>
          <p>{caseStudy.context}</p>
        </div>
        <Link className="secondary-action" href={COMPTA_MODULE_BASE}>
          Retour au module
        </Link>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Dossier</span>
            <h2>{caseStudy.documents.length} pièces justificatives</h2>
          </div>
        </div>
        <div className="document-table">
          {caseStudy.documents.map((document) => (
            <article key={document.id} className="document-row">
              <span className="state-token">{document.date}</span>
              <div>
                <strong>{document.reference}</strong>
                <small>{document.summary}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Étapes</span>
            <h2>{caseStudy.steps.length} étapes, dans l'ordre du dossier</h2>
          </div>
        </div>
        <ol className="case-steps">
          {caseStudy.steps.map((step, index) => (
            <li key={step.exerciseId}>
              <Link href={`${COMPTA_MODULE_BASE}/cas/${caseStudy.slug}/${index + 1}`}>
                Étape {index + 1} — {step.instruction}
              </Link>
            </li>
          ))}
        </ol>
        <Link className="primary-action inline-link" href={`${COMPTA_MODULE_BASE}/cas/${caseStudy.slug}/1`}>
          Commencer le cas
        </Link>
      </section>

      <ClosingChecklist title={caseStudy.title} items={caseStudy.checklist} />

      {isAnnual ? (
        <>
          <TrialBalanceView balance={velociteClosingBalance} />
          <LedgerView accounts={buildClosingLedger()} />
          {/* Verdicts seulement : les détails chiffrés contiennent les
              réponses des étapes 4 et 5 (résultat, total du bilan). */}
          <ControlSheet checks={buildControlSheet()} showDetails={false} />
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Dossier annuel</span>
                <h2>Exporter le dossier de travail</h2>
              </div>
            </div>
            <p className="muted">
              Balance, états, feuille de contrôle et pièces — un fichier Markdown généré localement,
              à archiver avec le dossier de l'exercice.
            </p>
            <CaseExport filename="dossier-annuel-velo-cite.md" markdown={buildAnnualExportMarkdown()} />
          </section>
        </>
      ) : (
        <BankReconciliation
          statementBalance={36240}
          bookBalance={34230}
          items={[
            { id: "cheque-78", label: "Chèque n° 78 émis, non débité par la banque", amount: -790, side: "releve" },
            { id: "virement-client", label: "Virement client sur le relevé, non comptabilisé", amount: 1260, side: "compte" },
            { id: "interets", label: "Intérêts débiteurs prélevés, non comptabilisés", amount: -40, side: "compte" }
          ]}
        />
      )}

      <section className="panel">
        <span className="section-label">Sources</span>
        <SourceReference sources={caseStudy.sourceReferences} defaultOpen />
      </section>
    </div>
  );
}
