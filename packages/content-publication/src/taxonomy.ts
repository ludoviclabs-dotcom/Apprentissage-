/**
 * Taxonomie publique de « Comptabilité approfondie ».
 *
 * Elle est déclarée ici, et non déduite des noms de fichiers du corpus privé :
 * `detectChapter` fabrique un slug à partir du nom du PDF, ce qui convient pour
 * ranger une extraction mais pas pour nommer une URL publique — le jour où un
 * fichier est renommé, la page changerait d'adresse. Le slug public est donc une
 * constante relue en revue de code, et `sourceChapterSlugs` dit à quels
 * chapitres du corpus il correspond.
 *
 * UN CHAPITRE DÉCLARÉ N'EST PAS UN CHAPITRE PUBLIÉ. Cette table est la liste des
 * chapitres qui *existent* dans le programme ; ce qui est consultable est ce que
 * le magasin publié contient réellement. C'est ce qui autorise à afficher les
 * autres chapitres comme « à venir » sans inventer un contenu ni un pourcentage.
 */

export const COMPTA_APPROFONDIE_MODULE = "comptabilite-approfondie";
export const COMPTA_APPROFONDIE_DOMAIN = "comptabilite";

export interface PublicChapterDefinition {
  /** Segment d'URL. Stable : une fois publié, il ne change plus. */
  slug: string;
  label: string;
  summary: string;
  /**
   * Slugs de chapitre produits par le pipeline d'extraction qui alimentent ce
   * chapitre public. Plusieurs, parce qu'un chapitre du programme peut être
   * réparti sur plusieurs supports.
   */
  sourceChapterSlugs: readonly string[];
}

export interface PublicModuleDefinition {
  id: string;
  domain: string;
  label: string;
  description: string;
  objectives: readonly string[];
  prerequisites: readonly string[];
  chapters: readonly PublicChapterDefinition[];
}

export const COMPTA_APPROFONDIE: PublicModuleDefinition = {
  id: COMPTA_APPROFONDIE_MODULE,
  domain: COMPTA_APPROFONDIE_DOMAIN,
  label: "Comptabilité approfondie",
  description:
    "Les opérations que la comptabilité générale ne traite pas : financement long terme, opérations sur le capital, valorisation des titres et travaux de clôture avancés.",
  objectives: [
    "Comptabiliser une opération de financement de son émission à son remboursement.",
    "Justifier chaque écriture par une règle et sa source.",
    "Distinguer une erreur de calcul, une erreur de traitement comptable et une erreur de raisonnement."
  ],
  prerequisites: [
    "Cycle de la facture, TVA et rapprochement bancaire (Comptabilité générale N1-N2).",
    "Travaux d'inventaire courants : régularisations, amortissements, dépréciations (N3)."
  ],
  chapters: [
    {
      slug: "emprunts-obligataires",
      label: "Emprunts obligataires",
      summary:
        "Émission, souscription, intérêts courus, amortissement de la prime de remboursement et frais d'émission.",
      // `detectChapter` dérive le slug du nom de fichier : « Les emprunts
      // obligataires - Fiche de cours.pdf » donne `les-emprunts-obligataires`.
      // Les deux formes sont acceptées pour que renommer un support ne change
      // pas l'URL publique.
      sourceChapterSlugs: ["emprunts-obligataires", "les-emprunts-obligataires"]
    },
    {
      slug: "titres",
      label: "Titres",
      summary: "Acquisition, valorisation à l'inventaire et cession des titres de participation et de placement.",
      sourceChapterSlugs: ["titres", "les-titres"]
    },
    {
      slug: "constitution-des-societes",
      label: "Constitution des sociétés",
      summary: "Promesses d'apport, libération, apports en nature et frais de constitution.",
      // Le support s'intitule « La constitution des entreprises » : le slug
      // dérivé ne partage ni l'article, ni le nom commun, avec le slug public.
      // C'est exactement ce que cette table est là pour absorber.
      sourceChapterSlugs: ["constitution-des-societes", "constitution", "la-constitution-des-entreprises"]
    },
    {
      slug: "variations-du-capital",
      label: "Variations du capital",
      summary: "Augmentation, réduction et amortissement du capital.",
      sourceChapterSlugs: [
        "variations-du-capital",
        "augmentation-de-capital",
        "les-variations-du-capital-des-societes"
      ]
    },
    {
      slug: "contrats-a-long-terme",
      label: "Contrats à long terme",
      summary: "Méthode à l'avancement, méthode à l'achèvement et perte à terminaison.",
      sourceChapterSlugs: ["contrats-a-long-terme", "les-contrats-a-long-terme"]
    },
    {
      slug: "travaux-de-cloture",
      label: "Travaux de clôture",
      summary: "Opérations de fin d'exercice propres aux comptes de financement et de capital.",
      sourceChapterSlugs: ["travaux-de-cloture"]
    }
  ]
};

export function getPublicChapter(slug: string): PublicChapterDefinition | undefined {
  return COMPTA_APPROFONDIE.chapters.find((chapter) => chapter.slug === slug);
}

/**
 * Le chapitre public alimenté par un chapitre du corpus, ou `undefined`.
 *
 * Retourne `undefined` plutôt que d'inventer un chapitre : publier un contenu
 * dont le chapitre n'est pas au programme doit être refusé, pas rangé au hasard.
 *
 * LA CORRESPONDANCE EST EXACTE, ET LE RESTERA. Il serait tentant de retirer les
 * articles et de comparer les radicaux — « les-titres » et « titres » ne
 * diffèrent que par là. Mais « la-constitution-des-entreprises » et
 * « constitution-des-societes » ne se ressemblent pas assez pour qu'aucune
 * règle ne les rapproche sans en rapprocher d'autres par accident, et une
 * heuristique qui range un chapitre inconnu sous un chapitre voisin publie du
 * contenu au mauvais endroit sans que rien ne proteste. Chaque alias est donc
 * écrit à la main et relu comme tel : la liste est plus longue, et c'est le
 * prix d'un refus qui reste un refus.
 */
export function resolvePublicChapter(sourceChapterSlug: string): PublicChapterDefinition | undefined {
  return COMPTA_APPROFONDIE.chapters.find(
    (chapter) =>
      chapter.slug === sourceChapterSlug || chapter.sourceChapterSlugs.includes(sourceChapterSlug)
  );
}
