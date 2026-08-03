import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cash13Semaines,
  asterIndustrie,
  dcfAster,
  erpExport,
  excelDcfAsterCase,
  exportTresorerieVba,
  formatScalar
} from "@finance/domain";
import { SourceReference } from "@/components/source-reference";
import { CaseExport } from "@/components/tools/case-export";
import { ClosingChecklist } from "@/components/tools/closing-checklist";
import { VbaViewer } from "@/components/excel/vba-viewer";
import { PaywallNotice } from "@/components/paywall-notice";
import { resolveEntitlement } from "@/lib/billing/entitlements";
import {
  EXCEL_LAB_BASE,
  excelCaseHref,
  getExcelCaseStudy,
  listExcelCaseStudies
} from "@/lib/excel-lab";

export function generateStaticParams() {
  return listExcelCaseStudies().map((caseStudy) => ({ slug: caseStudy.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const caseStudy = getExcelCaseStudy(slug);

  return caseStudy
    ? { title: `${caseStudy.title} — Excel Finance Lab`, description: caseStudy.context }
    : {};
}

/**
 * L'export pédagogique du cas : pièces et étapes, jamais de corrigé — les
 * totaux, positions, WACC et valeurs terminales sont les réponses attendues
 * des étapes, la même règle no-leak que les dossiers compta de PR-12a.
 */
function buildCaseExportMarkdown(slug: string): string {
  const caseStudy = getExcelCaseStudy(slug);

  if (!caseStudy) {
    return "";
  }

  return [
    `# ${caseStudy.title}`,
    "",
    caseStudy.context,
    "",
    "## Pièces du dossier",
    "",
    ...caseStudy.documents.map(
      (document) => `- ${document.reference} (${document.date}) : ${document.summary}`
    ),
    "",
    "## À produire (étapes du cas)",
    "",
    ...caseStudy.steps.map((step, index) => `${index + 1}. ${step.instruction}`),
    "",
    "_Export pédagogique généré localement — aucune donnée personnelle, aucun corrigé._"
  ].join("\n");
}

export default async function ExcelCaseStudyPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caseStudy = getExcelCaseStudy(slug);

  if (!caseStudy) {
    notFound();
  }

  const access = await resolveEntitlement("excel-finance-lab");
  const isAster = caseStudy.slug === excelDcfAsterCase.slug;

  if (!access.allowed) {
    return (
      <div className="page-stack">
        <section className="page-header page-header--hero">
          <div>
            <span className="section-label">Case study</span>
            <h1>{caseStudy.title}</h1>
            <p>{caseStudy.context}</p>
          </div>
          <Link className="secondary-action" href={EXCEL_LAB_BASE}>
            Retour au lab
          </Link>
        </section>
        <PaywallNotice reason={access.reason} feature={access.feature} moduleLabel="Excel Finance Lab" />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-header page-header--hero">
        <div>
          <span className="section-label">Case study</span>
          <h1>{caseStudy.title}</h1>
          <p>{caseStudy.context}</p>
        </div>
        <Link className="secondary-action" href={EXCEL_LAB_BASE}>
          Retour au lab
        </Link>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Dossier</span>
            <h2>{caseStudy.documents.length} pièces de travail</h2>
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
              <Link href={`${excelCaseHref(caseStudy)}/${index + 1}`}>
                Étape {index + 1} — {step.instruction}
              </Link>
            </li>
          ))}
        </ol>
        <Link className="primary-action inline-link" href={`${excelCaseHref(caseStudy)}/1`}>
          Commencer le cas
        </Link>
      </section>

      <ClosingChecklist title={caseStudy.title} items={caseStudy.checklist} />

      {/* Les données brutes seulement — totaux, positions et valorisations sont
          les réponses des étapes et n'apparaissent jamais ici. */}
      {isAster ? (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Données</span>
                <h2>Aster Industrie — données financières</h2>
              </div>
            </div>
            <div className="table-scroll">
              <table className="lab-grid">
                <thead>
                  <tr>
                    <th scope="col">Poste</th>
                    <th scope="col">Valeur</th>
                  </tr>
                </thead>
                <tbody>
                  {asterIndustrie.map((line) => (
                    <tr key={line.poste}>
                      <td>{line.poste}</td>
                      <td className="lab-given">{formatScalar(line.valeur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Plan d'affaires</span>
                <h2>Flux disponibles et coefficients d'actualisation</h2>
              </div>
            </div>
            <div className="table-scroll">
              {/* Le flux de l'année 1 et le taux d'actualisation sont les
                  réponses des étapes 1 et 2 : la règle no-leak des dossiers
                  compta s'applique — le dossier montre les pièces, jamais le
                  corrigé. */}
              <table className="lab-grid">
                <thead>
                  <tr>
                    <th scope="col">Année</th>
                    <th scope="col">Flux disponible (EUR)</th>
                    <th scope="col">Coefficient d'actualisation</th>
                  </tr>
                </thead>
                <tbody>
                  {dcfAster.map((line) => (
                    <tr key={line.annee}>
                      <td>{line.annee}</td>
                      <td className="lab-given">
                        {line.annee === 1 ? "à dériver (étape 1)" : formatScalar(line.fcf)}
                      </td>
                      <td className="lab-given">{String(line.coefficient).replace(".", ",")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <span className="section-label">Automatisation — lecture seule</span>
            <p className="muted">
              Le module d'export fourni par le contrôle de gestion, à lire avant l'étape d'audit. La
              plateforme n'exécute aucune macro.
            </p>
            <VbaViewer code={exportTresorerieVba} filename="export_tresorerie.bas" />
          </section>
        </>
      ) : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Données</span>
                <h2>Export ERP brut — dix lignes, défauts compris</h2>
              </div>
            </div>
            <div className="table-scroll">
              <table className="lab-grid">
                <thead>
                  <tr>
                    <th scope="col">Pièce</th>
                    <th scope="col">Famille</th>
                    <th scope="col">Libellé</th>
                    <th scope="col">Montant (brut)</th>
                  </tr>
                </thead>
                <tbody>
                  {erpExport.map((line, index) => (
                    <tr key={`${line.piece}-${index}`}>
                      <td>{line.piece}</td>
                      <td>{line.famille}</td>
                      <td>{line.libelle}</td>
                      {/* Volontairement brut : « 7 400 » est un défaut à voir. */}
                      <td className="lab-given">{line.montant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Prévision</span>
                <h2>Flux hebdomadaires S1–S13</h2>
              </div>
            </div>
            <div className="table-scroll">
              <table className="lab-grid">
                <thead>
                  <tr>
                    <th scope="col">Semaine</th>
                    <th scope="col">Encaissements</th>
                    <th scope="col">Décaissements</th>
                  </tr>
                </thead>
                <tbody>
                  {cash13Semaines.map((line) => (
                    <tr key={line.semaine}>
                      <td>{line.semaine}</td>
                      <td className="lab-given">{formatScalar(line.encaissements)}</td>
                      <td className="lab-given">{formatScalar(line.decaissements)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">Dossier</span>
            <h2>Exporter le dossier de travail</h2>
          </div>
        </div>
        <p className="muted">
          Pièces et étapes — un fichier Markdown généré localement, sans corrigé.
        </p>
        <CaseExport filename={`cas-${caseStudy.slug}.md`} markdown={buildCaseExportMarkdown(caseStudy.slug)} />
      </section>

      <section className="panel">
        <span className="section-label">Sources</span>
        <SourceReference sources={caseStudy.sourceReferences} defaultOpen />
      </section>
    </div>
  );
}
