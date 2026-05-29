export const simulations = [
  {
    id: "reunion-daf",
    title: "Réunion DAF",
    domainId: "controle-gestion" as const,
    level: 3,
    prompt: "Tu expliques pourquoi la marge baisse malgré une hausse du chiffre d'affaires.",
    expectedOutput: "Synthèse de 8 lignes avec cause, effet, donnée à vérifier et décision demandée."
  },
  {
    id: "justification-auditeur",
    title: "Justification auditeur",
    domainId: "compta-generale" as const,
    level: 2,
    prompt: "Tu défends une provision devant un auditeur avec pièces et raisonnement.",
    expectedOutput: "Argumentaire sourcé en fait, règle, estimation, écriture et annexe."
  },
  {
    id: "note-ifrs",
    title: "Note IFRS",
    domainId: "ifrs-ias" as const,
    level: 4,
    prompt: "Tu rédiges une note courte sur l'impact d'IFRS 18.",
    expectedOutput: "Note de décision distinguant présentation, impacts et points de vigilance."
  },
  {
    id: "audit-interne-iso",
    title: "Audit interne ISO",
    domainId: "iso" as const,
    level: 2,
    prompt: "Tu qualifies les constats et proposes actions correctives et preuves.",
    expectedOutput: "Tableau exigence, preuve, écart, risque, action, responsable et échéance."
  }
];
