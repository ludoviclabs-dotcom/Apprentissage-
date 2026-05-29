import { notFound } from "next/navigation";
import { DomainBadge } from "@/components/domain-badge";
import { simulations } from "@/lib/simulations";

export default async function SimulationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const simulation = simulations.find((item) => item.id === id);

  if (!simulation) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Simulation</span>
          <h1>{simulation.title}</h1>
          <p>{simulation.prompt}</p>
        </div>
      </section>

      <section className="panel detail-grid">
        <DomainBadge domainId={simulation.domainId} />
        <dl>
          <div>
            <dt>Niveau</dt>
            <dd>{simulation.level}</dd>
          </div>
          <div>
            <dt>Restitution</dt>
            <dd>{simulation.expectedOutput}</dd>
          </div>
          <div>
            <dt>Contraintes</dt>
            <dd>Rôle, données, risque, décision attendue.</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>Citations obligatoires quand le RAG est activé.</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
