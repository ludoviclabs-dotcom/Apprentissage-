import { DomainBadge } from "@/components/domain-badge";

const simulations = [
  {
    title: "Réunion DAF",
    domainId: "controle-gestion" as const,
    level: 3,
    prompt: "Tu expliques pourquoi la marge baisse malgré une hausse du chiffre d'affaires."
  },
  {
    title: "Justification auditeur",
    domainId: "compta-generale" as const,
    level: 2,
    prompt: "Tu défends une provision devant un auditeur avec pièces et raisonnement."
  },
  {
    title: "Note IFRS",
    domainId: "ifrs-ias" as const,
    level: 4,
    prompt: "Tu rédiges une note courte sur l'impact d'IFRS 18."
  },
  {
    title: "Audit interne ISO",
    domainId: "iso" as const,
    level: 2,
    prompt: "Tu qualifies les constats et proposes actions correctives et preuves."
  }
];

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
            <button type="button" className="secondary-action">Ouvrir le scénario</button>
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
