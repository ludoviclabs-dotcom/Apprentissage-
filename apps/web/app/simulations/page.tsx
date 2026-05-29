import { DomainBadge } from "@/components/domain-badge";
import { simulations } from "@/lib/simulations";
import Link from "next/link";

export default function SimulationsPage() {
  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Simulations</span>
          <h1>Relier les matières aux situations métier</h1>
          <p>Les simulations transforment la théorie en entretien, réunion, audit, note ou justification.</p>
        </div>
      </section>

      <section className="simulation-grid">
        {simulations.map((simulation) => (
          <article key={simulation.title} className="simulation-card">
            <div className="pack-top">
              <DomainBadge domainId={simulation.domainId} />
              <span>Niveau {simulation.level}</span>
            </div>
            <h2>{simulation.title}</h2>
            <p>{simulation.prompt}</p>
            <Link href={`/simulations/${simulation.id}`} className="secondary-action inline-link">
              Ouvrir le scénario
            </Link>
          </article>
        ))}
      </section>

      <section className="panel">
        <span className="section-label">Format attendu</span>
        <h2>Contexte, rôle, contrainte, restitution</h2>
        <p>
          Chaque simulation devra préciser la situation, ton rôle, les données disponibles, la contrainte métier,
          puis la restitution attendue.
        </p>
      </section>
    </div>
  );
}
