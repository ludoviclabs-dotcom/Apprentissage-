/**
 * Configuration centralisée de la topbar contextuelle.
 *
 * Chaque route principale déclare sa section, son titre, son sous-titre et son
 * breadcrumb. La résolution est pure (pathname → config) pour être testable
 * sans navigateur ; les routes dynamiques sont couvertes par préfixe, la plus
 * spécifique d'abord.
 */

export interface TopbarCrumb {
  label: string;
  href?: string;
}

export interface TopbarConfig {
  /** Rubrique affichée au-dessus du titre, ex. « S'entraîner ». */
  section: string;
  /** Titre de la route, ex. « Exercices ». */
  title: string;
  subtitle?: string;
  breadcrumb: readonly TopbarCrumb[];
  /** La recherche globale est masquée là où elle serait redondante ou hors sujet. */
  search: boolean;
}

interface TopbarRule {
  /** Match par segment : `/exercices` couvre `/exercices` et `/exercices/xyz`. */
  prefix: string;
  config: Omit<TopbarConfig, "search"> & { search?: boolean };
}

const HOME_CONFIG: TopbarConfig = {
  section: "Accueil",
  title: "Tableau de bord",
  subtitle: "Reprendre là où tu t'es arrêté.",
  breadcrumb: [{ label: "Accueil" }],
  search: true
};

const crumb = (label: string, href?: string): TopbarCrumb => (href ? { label, href } : { label });

/** Ordonnées de la plus spécifique à la plus générale. */
const RULES: readonly TopbarRule[] = [
  {
    prefix: "/modules/comptabilite-generale",
    config: {
      section: "Apprendre",
      title: "Compta générale",
      subtitle: "Cycle facture, TVA, banque et immobilisation.",
      breadcrumb: [crumb("Apprendre"), crumb("Modules", "/modules"), crumb("Compta générale")]
    }
  },
  {
    prefix: "/modules/excel-finance-lab",
    config: {
      section: "Apprendre",
      title: "Excel Finance Lab",
      subtitle: "Raisonnement tableur : valeur et méthode.",
      breadcrumb: [crumb("Apprendre"), crumb("Modules", "/modules"), crumb("Excel Finance Lab")]
    }
  },
  {
    prefix: "/modules",
    config: {
      section: "Apprendre",
      title: "Modules",
      subtitle: "Les parcours guidés par niveaux.",
      breadcrumb: [crumb("Apprendre"), crumb("Modules")]
    }
  },
  {
    prefix: "/apprendre",
    config: {
      section: "Apprendre",
      title: "Leçon du jour",
      subtitle: "Comprendre la logique avant de répondre.",
      breadcrumb: [crumb("Apprendre"), crumb("Leçon du jour")]
    }
  },
  {
    prefix: "/parcours",
    config: {
      section: "Apprendre",
      title: "Parcours",
      subtitle: "Trente jours, du socle aux cas métier.",
      breadcrumb: [crumb("Apprendre"), crumb("Parcours")]
    }
  },
  {
    prefix: "/cours",
    config: {
      section: "Apprendre",
      title: "Cours",
      subtitle: "Concept, règle, raisonnement, exemple.",
      breadcrumb: [crumb("Apprendre"), crumb("Cours")]
    }
  },
  {
    prefix: "/connaissances",
    config: {
      section: "Apprendre",
      title: "Connaissances",
      subtitle: "Notions et cartes organisées par domaine.",
      breadcrumb: [crumb("Apprendre"), crumb("Connaissances")]
    }
  },
  {
    prefix: "/exercices",
    config: {
      section: "S'entraîner",
      title: "Exercices",
      subtitle: "Barème affiché, compétence cible, correction structurée.",
      breadcrumb: [crumb("S'entraîner"), crumb("Exercices")]
    }
  },
  {
    prefix: "/annales-concours",
    config: {
      section: "S'entraîner",
      title: "Annales & concours",
      subtitle: "Sessions courtes en conditions d'examen.",
      breadcrumb: [crumb("S'entraîner"), crumb("Annales & concours")]
    }
  },
  {
    prefix: "/business-cases",
    config: {
      section: "S'entraîner",
      title: "Business cases",
      subtitle: "Décisions argumentées sur dossiers ambigus.",
      breadcrumb: [crumb("S'entraîner"), crumb("Business cases")]
    }
  },
  {
    prefix: "/simulations",
    config: {
      section: "S'entraîner",
      title: "Simulations",
      subtitle: "Scénarios chiffrés à manipuler.",
      breadcrumb: [crumb("S'entraîner"), crumb("Simulations")]
    }
  },
  {
    prefix: "/revisions",
    config: {
      section: "Réviser",
      title: "Session du jour",
      subtitle: "Les items dus, réponse masquée jusqu'à la révélation.",
      breadcrumb: [crumb("Réviser"), crumb("Session du jour")]
    }
  },
  {
    prefix: "/corrections",
    config: {
      section: "Réviser",
      title: "Corrections",
      subtitle: "Barème, erreurs, remédiation et sources citées.",
      breadcrumb: [crumb("Réviser"), crumb("Corrections")]
    }
  },
  {
    prefix: "/progression",
    config: {
      section: "Progression",
      title: "Compétences",
      subtitle: "Maîtrise par compétence, pas score opaque.",
      breadcrumb: [crumb("Progression"), crumb("Compétences")]
    }
  },
  {
    prefix: "/attestations",
    config: {
      section: "Progression",
      title: "Attestations",
      subtitle: "Certificats émis une fois par track terminé.",
      breadcrumb: [crumb("Progression"), crumb("Attestations")]
    }
  },
  {
    prefix: "/recherche",
    config: {
      section: "Outils",
      title: "Recherche",
      subtitle: "Recherche locale sur le corpus documentaire.",
      breadcrumb: [crumb("Recherche")],
      search: false
    }
  },
  {
    prefix: "/documents",
    config: {
      section: "Administration",
      title: "Documents",
      subtitle: "Inventaire du corpus importé.",
      breadcrumb: [crumb("Administration"), crumb("Documents")]
    }
  },
  {
    prefix: "/source-packs",
    config: {
      section: "Administration",
      title: "Source packs",
      subtitle: "Packs de sources importés et indexés.",
      breadcrumb: [crumb("Administration"), crumb("Source packs")]
    }
  },
  {
    prefix: "/billing",
    config: {
      section: "Compte",
      title: "Offre",
      subtitle: "Abonnement, accès et factures.",
      breadcrumb: [crumb("Compte", "/account"), crumb("Offre")]
    }
  },
  {
    prefix: "/account",
    config: {
      section: "Compte",
      title: "Mon compte",
      subtitle: "Identité, session et données privées.",
      breadcrumb: [crumb("Compte")]
    }
  },
  {
    prefix: "/login",
    config: {
      section: "Compte",
      title: "Connexion",
      breadcrumb: [crumb("Compte"), crumb("Connexion")],
      search: false
    }
  },
  {
    prefix: "/signup",
    config: {
      section: "Compte",
      title: "Inscription",
      breadcrumb: [crumb("Compte"), crumb("Inscription")],
      search: false
    }
  }
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveTopbar(pathname: string): TopbarConfig {
  if (pathname === "/") {
    return HOME_CONFIG;
  }

  const rule = RULES.find((candidate) => matchesPrefix(pathname, candidate.prefix));

  if (!rule) {
    // Route inconnue de la config : la topbar reste honnête et générique
    // plutôt que d'afficher la rubrique d'une autre page.
    return {
      section: "Finance Learning Hub",
      title: "Finance Learning Hub",
      breadcrumb: [crumb("Accueil", "/")],
      search: true
    };
  }

  return { search: true, ...rule.config };
}
