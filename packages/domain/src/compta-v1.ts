// AUTO-GÉNÉRÉ par assemble-compta.mjs à partir du corpus Dropbox (data/processed/corpus/compta-master).
// Contenu pédagogique dérivé et vérifié ; ne pas éditer à la main — régénérer via le script.
import type { Competency, Concept, Exercise, Flashcard, LearningDay, LearningModule, Lesson, SourcePack } from "./types";

export const comptaSourcePack: SourcePack = {
  "id": "compta-master",
  "name": "Corpus Comptabilité (Master CCA)",
  "description": "Cours, fiches et corrigés de comptabilité générale, approfondie et de pilotage de la performance, extraits et indexés localement.",
  "domainId": "compta-generale",
  "versionLabel": "2024-2025",
  "effectiveDate": "2025-09-01",
  "importedAt": "2026-06-17",
  "status": "ready",
  "documentsCount": 66,
  "chunksCount": 1284
};

export const comptaCompetencies: Competency[] = [
  {
    "id": "cg-operations-courantes",
    "domainId": "compta-generale",
    "name": "Comptabiliser les opérations courantes",
    "levelMin": 1,
    "levelMax": 2,
    "status": "in-progress",
    "strength": 60,
    "focus": "Qualifier immobilisation vs charge avant l'écriture."
  },
  {
    "id": "cg-titres",
    "domainId": "compta-generale",
    "name": "Comptabiliser et évaluer les titres",
    "levelMin": 2,
    "levelMax": 4,
    "status": "fragile",
    "strength": 41,
    "focus": "Distinguer les catégories de titres et leur évaluation."
  },
  {
    "id": "cg-emprunts-obligataires",
    "domainId": "compta-generale",
    "name": "Comptabiliser les emprunts obligataires",
    "levelMin": 3,
    "levelMax": 4,
    "status": "not-started",
    "strength": 26,
    "focus": "Nominal, prime de remboursement et amortissement."
  },
  {
    "id": "cg-constitution",
    "domainId": "compta-generale",
    "name": "Traiter la constitution des sociétés",
    "levelMin": 1,
    "levelMax": 3,
    "status": "in-progress",
    "strength": 54,
    "focus": "Apports, promesse et libération du capital."
  },
  {
    "id": "cg-variations-capital",
    "domainId": "compta-generale",
    "name": "Traiter les variations du capital",
    "levelMin": 3,
    "levelMax": 5,
    "status": "not-started",
    "strength": 20,
    "focus": "Augmentation, réduction et primes d'émission."
  },
  {
    "id": "ca-abc",
    "domainId": "compta-analytique",
    "name": "Mettre en œuvre la méthode ABC",
    "levelMin": 2,
    "levelMax": 4,
    "status": "in-progress",
    "strength": 50,
    "focus": "Inducteurs de coût et coût par activité."
  },
  {
    "id": "ca-cout-cible",
    "domainId": "compta-analytique",
    "name": "Appliquer la méthode du coût cible",
    "levelMin": 2,
    "levelMax": 4,
    "status": "fragile",
    "strength": 38,
    "focus": "Coût cible = prix de marché − marge cible."
  },
  {
    "id": "ca-yield",
    "domainId": "compta-analytique",
    "name": "Piloter les capacités et le yield management",
    "levelMin": 3,
    "levelMax": 5,
    "status": "not-started",
    "strength": 22,
    "focus": "Tarifer selon la capacité et la demande."
  },
  {
    "id": "ca-ecarts",
    "domainId": "compta-analytique",
    "name": "Calculer et interpréter les écarts",
    "levelMin": 3,
    "levelMax": 5,
    "status": "fragile",
    "strength": 35,
    "focus": "Décomposer écarts prix / quantité / volume."
  }
];

export const comptaConcepts: Concept[] = [
  {
    "id": "concept-operations-courantes",
    "moduleId": "module-compta-fondations",
    "domainId": "compta-generale",
    "title": "Cout d'acquisition d'une immobilisation",
    "shortDefinition": "Valeur d'entree a l'actif d'un bien durable : prix d'achat net de reductions plus les seuls frais directement attribuables a sa mise en etat de fonctionner.",
    "formula": "Cout d'acquisition = Prix d'achat net HT (apres RRR et escomptes obtenus) + Couts directement attribuables (transport, installation, montage, essais)",
    "frequentTrap": "Inclure dans le cout des charges exclues par le PCG (entretien courant, consommables type carburant ou ramettes) qui restent en charges (606), ou ne pas retraiter la TVA non deductible des vehicules de tourisme.",
    "miniExample": "Machine 50 000 HT, transport 2 000 HT, remise 1 000 : cout = 50 000 - 1 000 + 2 000 = 51 000 au debit du 215.",
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "status": "in-progress",
    "strength": 60,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les operations courantes - Fiche de cours",
        "sourceType": "course",
        "pageStart": 3,
        "pageEnd": 4,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-travaux-cloture",
    "moduleId": "module-compta-fondations",
    "domainId": "compta-generale",
    "title": "La régularisation des stocks à l'inventaire (variation de stock et dépréciation)",
    "shortDefinition": "À la clôture, on substitue le stock final (inventaire physique valorisé au coût d'achat pour les biens achetés, au coût de production pour les biens produits) au stock initial via les comptes de variation (603 pour les achats, 71 pour la production), puis on ajuste la dépréciation lorsque la valeur actuelle est inférieure à la valeur d'origine.",
    "formula": "Solde du compte 6031 = Stock initial - Stock final (débiteur = charge si le stock baisse) ; Ajustement de dépréciation = Dépréciation nécessaire (stock final) - Dépréciation antérieure (stock initial) → dotation si positif, reprise si négatif.",
    "frequentTrap": "Croire que la dépréciation se calcule sur l'écart de valeur brute du stock ; en réalité elle compare la perte probable du stock final à celle du stock initial. Et oublier que pour les biens achetés la variation passe par le compte de charge 603, alors que pour les produits fabriqués elle passe par le compte de produit 71 (Production stockée).",
    "miniExample": "Stock final de produits finis au coût de production 11 910 €, perte probable estimée 680 € ; dépréciation antérieure 745 € : la dépréciation nécessaire (680) étant inférieure (745), on enregistre une reprise de 65 € (débit 3955 / crédit 78173).",
    "competencyIds": [
      "cg-cutoff"
    ],
    "status": "in-progress",
    "strength": 68,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les travaux de clôture - Fiche de cours",
        "sourceType": "course",
        "pageStart": 19,
        "pageEnd": 21,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-titres",
    "moduleId": "module-compta-approfondie",
    "domainId": "compta-generale",
    "title": "La dépréciation des titres à l'inventaire (principe de prudence)",
    "shortDefinition": "Écart négatif entre la valeur d'inventaire d'un titre de même nature et sa valeur d'entrée, constaté à la clôture pour les seules moins-values latentes ; il se traduit par une dotation au compte 6866 et un compte de dépréciation portant un 9 en deuxième position (2961, 2973, 5903, etc.).",
    "formula": "Dépréciation nécessaire = Valeur d'entrée − Valeur d'inventaire (si > 0) ; Ajustement = Dépréciation nécessaire au 31/12/N − Dépréciation constituée au 31/12/N-1 (dotation si positif, reprise si négatif)",
    "frequentTrap": "Oublier de raisonner par différentiel d'une année sur l'autre : on ne dote pas à nouveau la totalité de la dépréciation nécessaire alors qu'une partie existe déjà. Une dépréciation passant de 1 200 à 1 700 € appelle une dotation de 500 € seulement, pas de 1 700 €.",
    "miniExample": "Actions Chez Gigi (TIAP) : valeur d'entrée 100 × 62 = 6 200 €, valeur d'inventaire 100 × 45 = 4 500 €, dépréciation nécessaire 1 700 €. Dépréciation antérieure 1 200 € → dotation complémentaire de 500 € : débit 6866 / crédit 2973 pour 500 €.",
    "competencyIds": [
      "cg-titres"
    ],
    "status": "fragile",
    "strength": 41,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les titres - Fiche de cours",
        "sourceType": "course",
        "pageStart": 5,
        "pageEnd": 6,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-emprunts-obligataires",
    "moduleId": "module-compta-approfondie",
    "domainId": "compta-generale",
    "title": "La prime de remboursement des obligations (compte 169)",
    "shortDefinition": "La prime de remboursement, au sens du PCG, est la difference entre le prix de remboursement et le prix d'emission des obligations. Elle est inscrite au debit du compte 169 lors de l'emission, figure a l'actif du bilan tant qu'elle n'est pas amortie, et constitue une charge financiere etalee sur la duree de l'emprunt.",
    "formula": "Prime de remboursement (169) = (Prix de remboursement - Prix d'emission) x Nombre d'obligations",
    "frequentTrap": "Confondre la prime de remboursement comptable avec la seule prime de remboursement proprement dite (ecart au nominal). Le PCG fusionne sous le terme prime de remboursement a la fois la prime d'emission negative et la prime de remboursement proprement dite : il faut donc raisonner sur l'ecart prix de remboursement - prix d'emission, pas sur l'ecart au nominal.",
    "miniExample": "Avec un prix d'emission de 996 EUR et un prix de remboursement de 1 006 EUR pour 8 000 obligations : prime = (1 006 - 996) x 8 000 = 80 000 EUR au debit du compte 169.",
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "status": "not-started",
    "strength": 26,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les emprunts obligataires - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-constitution-entreprises",
    "moduleId": "module-compta-fondations",
    "domainId": "compta-generale",
    "title": "Capital souscrit : appele / non appele, verse / non verse",
    "shortDefinition": "Le capital social se decompose selon son etat d'avancement : 1011 capital souscrit non appele (fraction differee), 1012 capital souscrit appele non verse (fraction reclamee mais pas encore payee), 1013 capital souscrit appele verse (fraction effectivement payee). Ces trois comptes permettent de suivre les phases de liberation.",
    "formula": "Capital social (101) = 1011 + 1012 + 1013 ; a la constitution d'une SA : capital appele = apports en nature (100 %) + apports en numeraire x 50 % minimum.",
    "frequentTrap": "Confondre 'appele' et 'verse'. Un capital peut etre appele (reclame aux associes, donc en 1012) sans etre encore verse ; le passage en 1013 n'intervient qu'au moment de l'encaissement effectif des fonds.",
    "miniExample": "SA Les Delices : numeraire 30 000, libere du minimum legal. Fraction appelee-versee = 15 000 (compte 1013), fraction non appelee = 15 000 (compte 1011, contrepartie au compte 109 a l'actif). La part nature 70 000 est entierement en 1013.",
    "competencyIds": [
      "cg-constitution"
    ],
    "status": "in-progress",
    "strength": 54,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "La constitution des entreprises - Fiches de cours",
        "sourceType": "course",
        "pageStart": 2,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-variations-capital",
    "moduleId": "module-compta-approfondie",
    "domainId": "compta-generale",
    "title": "Droit préférentiel de souscription (DS) et droit d'attribution (DA)",
    "shortDefinition": "Le DS protège l'actionnaire ancien lors d'une augmentation en numéraire en lui réservant un accès prioritaire aux actions nouvelles et en compensant la dilution de valeur. Le DA joue le même rôle de compensation lors d'une distribution d'actions gratuites par incorporation de réserves. Dans les deux cas, la valeur théorique du droit égale la perte de valeur unitaire de l'action.",
    "formula": "Valeur théorique du droit = Valeur de l'action avant augmentation - Valeur de l'action après augmentation",
    "frequentTrap": "Confondre DS et DA. Le DS concerne l'augmentation par apports en numéraire (l'actionnaire doit payer le prix d'émission) ; le DA concerne l'incorporation de réserves (les actions nouvelles sont gratuites). Le DA n'existe donc jamais pour une augmentation en numéraire et inversement.",
    "miniExample": "Action valant 150 EUR avant, 140 EUR après l'opération : valeur théorique du droit = 150 - 140 = 10 EUR. L'actionnaire qui ne participe pas vend ses droits et compense ainsi exactement la baisse de cours de ses titres.",
    "competencyIds": [
      "cg-variations-capital"
    ],
    "status": "not-started",
    "strength": 20,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les variations du capital des sociétés - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-methode-abc",
    "moduleId": "module-pilotage-performance",
    "domainId": "compta-analytique",
    "title": "Inducteur de cout et taux de profitabilite en ABC",
    "shortDefinition": "L'inducteur de cout est l'unite d'oeuvre representative d'une activite (nombre de contacts, de salons, d'heures ou de jours de formation, de regions...). Son cout unitaire impute les charges indirectes de l'activite aux prestations selon leur consommation reelle. Le taux de profitabilite rapporte le resultat analytique au chiffre d'affaires de la prestation.",
    "formula": "Cout de l'inducteur = ressources consommees par l'activite / nombre total d'inducteurs ; Charges indirectes imputees = inducteurs consommes x cout de l'inducteur ; Taux de profitabilite = resultat analytique / chiffre d'affaires.",
    "frequentTrap": "Repartir toutes les charges indirectes avec une seule cle (le CA) : cette approche dite simpliste peut rendre profitable une prestation qui ne l'est pas et inversement, car elle ignore l'heterogeneite des activites consommees.",
    "miniExample": "Activite Location salles FONEA : 100 000 EUR de ressources pour 500 heures de formation, soit 200 EUR par heure. La formation Manager des achats consomme 450 h (90 000 EUR impute) contre 50 h pour Certification acheteur (10 000 EUR).",
    "competencyIds": [
      "ca-abc"
    ],
    "status": "in-progress",
    "strength": 50,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance introduction",
        "sourceType": "course",
        "pageStart": 10,
        "pageEnd": 13,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-cout-cible",
    "moduleId": "module-pilotage-performance",
    "domainId": "compta-analytique",
    "title": "Décomposition du coût cible par composant",
    "shortDefinition": "Une fois le coût cible global obtenu, on le ventile entre les composants : la part de coût allouée à un composant doit refléter sa contribution à la valeur perçue par le client (importance des fonctions x contribution du composant à ces fonctions).",
    "formula": "Coût cible d'un composant = Coût cible global x (poids des fonctions remplies par ce composant en %)",
    "frequentTrap": "Allouer le coût cible au prorata du coût estimé (logique 'ingénieur') au lieu du prorata de la valeur perçue par le client (logique 'marketing') : cela vide la méthode de son intérêt, puisque c'est précisément l'écart entre valeur perçue et coût technique qui guide l'optimisation.",
    "miniExample": "Chez Langelot, la crème glacée concentre 79,2 % de la valeur perçue (texture + goût + sain/naturel...). Son coût cible vaut donc 1,92 x 79,2 % = 1,52 €, à comparer à son coût estimé de 1,08 € : le composant est sous-valorisé en coût par rapport à son importance pour le client.",
    "competencyIds": [
      "ca-cout-cible"
    ],
    "status": "fragile",
    "strength": 38,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance méthode du coût cible",
        "sourceType": "course",
        "pageStart": 4,
        "pageEnd": 8,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-yield-management",
    "moduleId": "module-pilotage-performance",
    "domainId": "compta-analytique",
    "title": "RevPAR (Revenue Per Available Room)",
    "shortDefinition": "Indicateur de rendement des capacites dans l'hotellerie : revenu moyen rapporte a chaque chambre DISPONIBLE (et non vendue), qui combine en un seul ratio le niveau des prix et le niveau de la demande.",
    "formula": "RevPAR = Chiffre d'affaires / Nombre de chambres disponibles = Prix moyen x Taux d'occupation",
    "frequentTrap": "Utiliser le RevPAR seul masque l'origine du resultat : une hausse du prix moyen peut dissimuler une chute du taux d'occupation (et inversement). Un hotel qui perd des clients mais releve ses prix peut afficher un RevPAR en hausse qui cache une erosion de la frequentation. Il faut toujours decomposer le RevPAR en prix moyen ET taux d'occupation.",
    "miniExample": "Hotel avec prix moyen chambre de 85 EUR et taux d'occupation de 52 % : RevPAR = 85 x 0,52 = 44,2 EUR par chambre disponible. A ne pas confondre avec le CA par chambre VENDUE (= 85 EUR), qui ignore les chambres restees vides.",
    "competencyIds": [
      "ca-yield"
    ],
    "status": "not-started",
    "strength": 22,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance yield management",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 7,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "concept-ecarts",
    "moduleId": "module-pilotage-performance",
    "domainId": "compta-analytique",
    "title": "Écart sur charges indirectes : rendement, budget et activité",
    "shortDefinition": "Parce qu'un centre d'analyse mélange charges variables et charges fixes, son écart relatif à la production réelle s'explique par trois causes : le nombre d'unités d'œuvre consommées (rendement), le prix des facteurs (budget) et le niveau d'activité absorbant les charges fixes (activité). L'écart sur coût d'unité d'œuvre = écart sur budget + écart sur activité, et l'écart total du centre = écart sur rendement + écart sur coût d'unité d'œuvre.",
    "formula": "Rendement = (Qr - Qp*) x Cup ; Budget = (Qr x Cur) - CB avec CB = CVup x Qr + CFp ; Activité = CB - (Qr x Cup)",
    "frequentTrap": "Oublier que le coût standard de l'unité d'œuvre intègre des charges fixes calculées sur l'activité NORMALE : si l'activité réelle diffère, l'écart sur activité capte cette sur- ou sous-absorption. On ne doit pas recalculer le coût fixe unitaire sur l'activité réelle dans le coût budgété : le coût fixe total reste identique (32 000 € chez Vanille) quel que soit le niveau d'activité.",
    "miniExample": "Atelier « Découpage – Assemblage » : Qr = 170 UO, Cur = 324 €, Cup = 320 €, Qp* = 0,1 x 1 750 = 175 UO, CB = 120 x 170 + 32 000 = 52 400 €. Rendement = (170 - 175) x 320 = -1 600 € (FAV) ; Budget = 55 080 - 52 400 = +2 680 € (DEF) ; Activité = 52 400 - (170 x 320) = -2 000 € (FAV). Total = -1 600 + 2 680 - 2 000 = -920 € (FAV).",
    "competencyIds": [
      "ca-ecarts"
    ],
    "status": "fragile",
    "strength": 35,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance Les écarts sur coûts",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 12,
        "effectiveDate": "2025-09-01"
      }
    ]
  }
];

export const comptaLessons: Lesson[] = [
  {
    "id": "lesson-operations-courantes",
    "domainId": "compta-generale",
    "title": "Les opérations courantes",
    "concept": "Une acquisition d'immobilisation inscrit a l'actif (classe 2) un bien controle, durable, procurant des avantages economiques, par opposition a une charge consommee dans l'exploitation.",
    "rule": "PCG : cout d'acquisition = prix d'achat net HT (apres rabais, remises, ristournes et escomptes obtenus) + couts directement attribuables a la mise en etat de fonctionner (transport, installation, montage, essais). Les depenses non necessaires et l'entretien courant sont exclus et passes en charges.",
    "reasoning": "On qualifie d'abord (immobilisation vs charge), puis on calcule le cout : prix d'achat moins reductions plus frais indispensables a la mise en service. Les frais d'acquisition (droits de mutation, honoraires, commissions) sont rattachables au cout (methode de reference) ou, sur option globale (permanence des methodes), passes en charges. Debit : compte d'immobilisation ; TVA recuperable au 44562 ; dette au 404 Fournisseurs d'immobilisations.",
    "example": "Vehicule utilitaire : prix 16 500 HT, transport et mise en service 1 500 HT, remise 825, frais d'acte 145. Option rattachement : 16 500 + 1 500 - 825 + 145 = 17 320 HT au debit du 2182 ; TVA 17 320 x 20 % = 3 464 au 44562 ; dette 20 784 TTC au 404. Option charges : cout = 16 500 + 1 500 - 825 = 17 175, les 145 de frais d'acte en charge (6227).",
    "frequentError": "Oublier de deduire les reductions obtenues, ou integrer au cout des depenses qui n'y appartiennent pas (carburant, entretien courant) au lieu des charges (606). Aussi : oublier que la TVA d'un vehicule de tourisme n'est pas deductible (cout TTC), alors qu'elle l'est pour un utilitaire.",
    "linkedExerciseId": "ex-operations-courantes-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les operations courantes - Fiche de cours",
        "sourceType": "course",
        "pageStart": 3,
        "pageEnd": 4,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-travaux-cloture",
    "domainId": "compta-generale",
    "title": "Les travaux de clôture",
    "concept": "Les travaux de clôture (ou travaux d'inventaire) sont l'ensemble des opérations effectuées à la fin de l'exercice pour passer du résultat provisoire issu de la balance avant inventaire au résultat définitif présenté dans les comptes annuels (bilan, compte de résultat, annexe). La régularisation des stocks en est une composante : elle consiste, à partir de l'inventaire physique, à substituer le stock final au stock initial et à constater les éventuelles dépréciations.",
    "rule": "Selon le PCG et l'article L123-12 du Code de commerce, l'entreprise doit contrôler par inventaire au moins tous les douze mois l'existence et la valeur des actifs et passifs, puis traduire ces éléments dans les comptes. En application du principe d'indépendance des exercices, le résultat ne retient que les opérations rattachables à l'exercice ; en application du principe de prudence, toute perte probable (dépréciation de stock lorsque la valeur actuelle est inférieure à la valeur d'origine) doit être constatée, tandis qu'un gain potentiel ne l'est pas. Les stocks de biens achetés se régularisent via le compte 603 (Variation des stocks), ceux des produits fabriqués via le compte 71 (Production stockée).",
    "reasoning": "On part du résultat avant inventaire et l'on raisonne en deux temps. 1) La variation de stock : le solde des comptes de stock (classe 3) avant inventaire correspond au stock initial (clôture précédente, principe d'intangibilité du bilan d'ouverture) ; il faut l'annuler puis enregistrer le stock final issu de l'inventaire physique. Pour les biens achetés, on utilise le compte 6031/6037 ; une baisse de stock alourdit les charges et diminue le résultat. 2) La dépréciation : on compare valeur d'origine et valeur actuelle du stock final ; si la valeur actuelle est plus faible, on constate une dépréciation. Par la méthode générale d'ajustement, on compare la dépréciation nécessaire sur stock final à celle du stock initial : dotation si elle augmente, reprise si elle diminue.",
    "example": "Société Laguerre, stock de matières premières au 31/12/N. Balance avant inventaire : compte 310 (stock de MP) = 6 800 (stock initial), dépréciation 391 = 1 235. Inventaire : coût d'achat du stock final = 5 420 ; perte probable estimée = 950. Variation de stock : annulation du stock initial (débit 6031 / crédit 310 : 6 800) puis constatation du stock final (débit 310 / crédit 6031 : 5 420). Solde du compte 6031 = 6 800 - 5 420 = 1 380 au débit : le stock ayant diminué, c'est une charge qui réduit le résultat de 1 380. Dépréciation : la dépréciation nécessaire (950) est inférieure à la dépréciation antérieure (1 235), d'où une reprise de 285 (débit 391 / crédit 78173), qui améliore le résultat de 285.",
    "frequentError": "Confondre la régularisation de la variation de stock (compte 603 ou 71, sur la valeur d'origine/brute) avec la régularisation de la dépréciation (comptes 39 / 68173 / 78173, sur la perte probable) : ce sont deux écritures distinctes. Autre erreur : calculer la dotation/reprise de dépréciation sur la variation brute du stock au lieu de comparer la dépréciation nécessaire du stock final à la dépréciation antérieure du stock initial (méthode générale d'ajustement).",
    "linkedExerciseId": "ex-travaux-cloture-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les travaux de clôture - Fiche de cours",
        "sourceType": "course",
        "pageStart": 19,
        "pageEnd": 21,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-titres",
    "domainId": "compta-generale",
    "title": "La comptabilisation des titres",
    "concept": "Le PCG distingue quatre catégories de titres selon l'intention de détention et le degré d'influence sur la société émettrice : titres de participation (compte 261), titres immobilisés de l'activité de portefeuille ou TIAP (273), autres titres immobilisés (271/272) et valeurs mobilières de placement ou VMP (50). Les trois premières sont des immobilisations financières ; les VMP figurent à l'actif circulant.",
    "rule": "À l'inventaire, chaque catégorie de titres de même nature est évaluée à sa valeur d'inventaire (valeur d'utilité pour les participations ; valeur de marché/cours moyen du dernier mois pour les autres titres immobilisés cotés et les VMP). Par application du principe de prudence, seules les moins-values latentes sont comptabilisées sous forme de dépréciation ; les plus-values latentes ne sont jamais constatées et aucune compensation entre titres de natures différentes n'est admise. Dépréciation = Valeur d'inventaire − Valeur d'entrée (lorsque ce résultat est négatif).",
    "reasoning": "Le raisonnement se mène titre par titre, en trois temps. 1) Reconstituer la valeur d'entrée des titres encore détenus (PEPS ou CUMP en cas d'achats successifs ou de cessions). 2) Comparer cette valeur d'entrée à la valeur d'inventaire fournie pour dégager une plus ou moins-value latente : on ne retient que les moins-values. 3) Confronter la dépréciation ainsi nécessaire au 31/12/N à la dépréciation déjà constituée au 31/12/N-1, puis ajuster : si elle augmente on enregistre une dotation complémentaire (débit 6866), si elle diminue ou disparaît on enregistre une reprise (crédit 7866), si elle est inchangée aucune écriture.",
    "example": "Actions Morin (titres de participation) figurant pour 1 000 titres à 15 € soit une valeur d'entrée de 15 000 €. Au 31/12/N le cours unitaire est de 13 €, donc valeur d'inventaire = 1 000 × 13 = 13 000 €. Moins-value latente = 13 000 − 15 000 = −2 000 € : dépréciation nécessaire 2 000 €. Or une dépréciation de 3 000 € avait été constituée au 31/12/N-1. La dépréciation devant diminuer de 3 000 à 2 000, on comptabilise une reprise de 1 000 € : débit 2961 Dépréciations des titres de participation 1 000 / crédit 7866 Reprises sur dépréciations des éléments financiers 1 000.",
    "frequentError": "Constater une dépréciation (ou un produit) à partir d'une plus-value latente, et compenser les moins-values d'un titre avec les plus-values d'un autre. Exemple tiré du corpus : les actions Jérôme valent à l'inventaire 1 980 € pour une valeur d'entrée de 1 400 € : cette plus-value de 580 € ne se comptabilise pas, et elle ne peut compenser la moins-value des actions Morin. La seule écriture sur Jérôme est la reprise des 160 € de dépréciation devenue sans objet.",
    "linkedExerciseId": "ex-titres-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les titres - Fiche de cours",
        "sourceType": "course",
        "pageStart": 5,
        "pageEnd": 6,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-emprunts-obligataires",
    "domainId": "compta-generale",
    "title": "Les emprunts obligataires",
    "concept": "Un emprunt obligataire est un mode de financement externe par lequel une societe par actions (ou certaines SARL) fait appel au public : les souscripteurs achetent des obligations, titres negociables conferant un droit de creance identique pour tous les detenteurs d'une meme emission. Comptablement, l'enjeu central est l'enregistrement de la dette pour son prix de remboursement et l'etalement, sur la duree de l'emprunt, de la charge financiere que representent la prime de remboursement et, le cas echeant, les frais d'emission.",
    "rule": "Selon le PCG, a l'emission la dette est inscrite au credit du compte 163 (Autres emprunts obligataires) pour le PRIX DE REMBOURSEMENT, et non pour le prix d'emission ni le nominal. La difference entre prix de remboursement et prix d'emission est portee au debit du compte 169 (Primes de remboursement des obligations), qui figure a l'actif tant qu'elle n'est pas amortie. Le PCG regroupe sous l'unique appellation prime de remboursement la prime d'emission negative et la prime de remboursement proprement dite. Cette prime est obligatoirement amortie sur la duree de l'emprunt, par dotation au compte 6861, selon deux methodes admises : au prorata des interets courus, ou par fractions egales au prorata de la duree.",
    "reasoning": "Raisonnement a tenir face a une emission : 1) identifier les trois prix (nominal, prix d'emission, prix de remboursement) ; 2) calculer la dette = nombre d'obligations x prix de remboursement (compte 163) ; 3) calculer la prime totale = (prix de remboursement - prix d'emission) x nombre d'obligations (compte 169) ; 4) verifier l'equilibre : debit 4671 (prix d'emission) + debit 169 (prime) = credit 163 (prix de remboursement) ; 5) a l'inventaire, rattacher les interets courus a l'exercice (prorata temporis depuis la date de jouissance, c'est-a-dire la date a partir de laquelle court le premier coupon plein) et amortir la prime sur la duree de l'emprunt selon la methode retenue.",
    "example": "CSP emet le 01/09/N 8 000 obligations de nominal 1 000 EUR, prix d'emission 996 EUR, prix de remboursement 1 006 EUR, coupon annuel 90 EUR par titre. Ecriture de souscription : on debite 4671 Obligataires, obligations a placer de 8 000 x 996 = 7 968 000 EUR, on debite 169 Primes de remboursement de 8 000 x (1 006 - 996) = 80 000 EUR, et on credite 163 Autres emprunts obligataires de 8 000 x 1 006 = 8 048 000 EUR (7 968 000 + 80 000 = 8 048 000, l'ecriture est equilibree).",
    "frequentError": "Inscrire la dette au compte 163 pour le nominal (8 000 000 EUR) ou pour le prix d'emission (7 968 000 EUR) au lieu du prix de remboursement (8 048 000 EUR), et donc omettre ou mal calculer la prime de remboursement portee au 169. Autre erreur : passer la prime directement en charge a l'emission au lieu de l'etaler sur la duree de l'emprunt via les dotations du compte 6861.",
    "linkedExerciseId": "ex-emprunts-obligataires-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les emprunts obligataires - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-constitution-entreprises",
    "domainId": "compta-generale",
    "title": "La constitution des sociétés",
    "concept": "La constitution d'une societe est l'operation par laquelle des associes effectuent des apports qui forment le patrimoine initial de la personne morale. Les apports en numeraire et en nature constituent le capital social ; les apports en industrie en sont exclus.",
    "rule": "Le capital figure au passif du bilan, qu'il soit appele ou non, verse ou non, via le compte 101 subdivise en 1011 (souscrit non appele), 1012 (appele non verse) et 1013 (appele verse). Les apports en nature sont integralement liberes des la constitution. Pour le numeraire, la SA/SAS libere au moins 1/2 et la SARL au moins 20 % a la constitution, le solde etant appele dans un delai maximal de 5 ans.",
    "reasoning": "On distingue deux temps. 1) La souscription (promesse d'apport) : on debite 4561 Associes-Comptes d'apport pour la fraction immediatement appelee (par credit de 1012) et on debite 109 pour la fraction differee (par credit de 1011). 2) La liberation (realisation) : on debite les comptes d'actif pour la valeur nette retenue dans les statuts, on credite les comptes de dettes reprises, on solde 4561 et on vire 1012 vers 1013. Si la liberation n'est pas integrale, une 3e etape enregistre l'appel ulterieur (109 vers 45621/45625 et 1011 vers 1012) puis le versement (512 contre 45621/45625 et 1012 vers 1013).",
    "example": "SA Les Delices du Perigord. M. Ostrowski apporte en nature un fonds (incorporels 50 000, installations 30 000, stocks 1 600, banque 2 400 = 84 000 brut) ; la societe reprend un emprunt de 11 000 et des dettes fournisseurs de 3 000, soit un apport net de 70 000. Six actionnaires apportent chacun 5 000 en numeraire, soit 30 000. Capital = 70 000 + 30 000 = 100 000 €. En SA, le numeraire est libere du minimum legal (1/2) : 30 000 x 1/2 = 15 000 liberes, 15 000 restant non appeles. Le capital appele et verse a la constitution est donc 70 000 (nature) + 15 000 (numeraire) = 85 000 €, et le compte 109 presente un solde debiteur de 15 000 € inscrit en tete de l'actif.",
    "frequentError": "Croire que les apports en nature peuvent etre liberes partiellement comme le numeraire, ou appliquer la regle de liberation (1/2 SA, 20 % SARL) au capital total. La regle de liberation fractionnee ne vise QUE les apports en numeraire : les apports en nature sont toujours liberes en totalite des la constitution.",
    "linkedExerciseId": "ex-constitution-entreprises-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "La constitution des entreprises - Fiches de cours",
        "sourceType": "course",
        "pageStart": 2,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-variations-capital",
    "domainId": "compta-generale",
    "title": "Les variations du capital",
    "concept": "Une variation du capital social regroupe toutes les opérations qui modifient le montant du compte 101. On distingue les augmentations (apports en numéraire, apports en nature, incorporation de réserves, conversion de dettes) et les réductions (motivées ou non par des pertes), à ne pas confondre avec l'amortissement du capital qui ne modifie pas le montant du capital.",
    "rule": "Toute variation du capital modifie les statuts : elle relève de la compétence exclusive de l'AGE, doit être déposée au greffe du tribunal de commerce et publiée dans un journal d'annonces légales. Pour une augmentation en numéraire, le capital antérieur doit être intégralement libéré au préalable ; la prime d'émission est libérée en totalité et au minimum le quart du nominal des actions nouvelles à la souscription, le solde dans un délai maximal de cinq ans. Le prix d'émission est encadré : Valeur nominale <= Prix d'émission <= Valeur vénale de l'action ancienne.",
    "reasoning": "Pour traiter une augmentation en numéraire, on procède par étapes. (1) On calcule la prime unitaire = prix d'émission - valeur nominale, puis la prime totale = prime unitaire x nombre d'actions nouvelles. (2) On détermine les fonds appelés à la souscription = (quart du nominal au minimum) + prime totale, la prime étant toujours appelée intégralement. (3) Étape de recueil des fonds : le compte 4563 Actionnaires - Versements reçus sur augmentation de capital est crédité du montant encaissé par le débit d'un compte de trésorerie. (4) Étape de constatation : on solde le 4563 par le débit ; en contrepartie on crédite 1013 Capital souscrit appelé versé pour la part nominale appelée, 1041 Primes d'émission pour la prime, et on inscrit la fraction non appelée au débit du 109 par le crédit du 1011.",
    "example": "La SA dont le capital est de 500 000 EUR (5 000 actions de 100 EUR de nominal, entièrement libérées) décide d'émettre 1 000 actions nouvelles au prix de 120 EUR, libérées du minimum légal. Augmentation nominale = 1 000 x 100 = 100 000 EUR (capital porté à 600 000 EUR). Prime d'émission = (120 - 100) x 1 000 = 20 000 EUR. Fonds appelés à la souscription = quart du nominal + prime totale = 25 000 + 20 000 = 45 000 EUR ; fraction non appelée = 75 000 EUR. Recueil : on débite 512 Banque 45 000 et on crédite 4563 pour 45 000. Constatation : on débite 4563 pour 45 000 et 109 pour 75 000 ; on crédite 1011 pour 75 000, 1013 pour 25 000 et 1041 pour 20 000.",
    "frequentError": "Croire que seul le quart appelé du nominal est encaissé à la souscription : en réalité la prime d'émission est appelée et versée intégralement dès la souscription. Autre confusion fréquente : assimiler l'amortissement du capital à une réduction de capital, alors que l'amortissement rembourse les actionnaires par prélèvement sur réserves ou bénéfices distribuables, sans modifier le montant du capital social.",
    "linkedExerciseId": "ex-variations-capital-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les variations du capital des sociétés - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-methode-abc",
    "domainId": "compta-analytique",
    "title": "La méthode ABC",
    "concept": "La methode ABC (Activity-Based Costing, ou comptabilite a base d'activites) est une methode de calcul de couts complets qui impute les charges indirectes aux produits ou prestations en passant par les activites qui les consomment. Chaque activite est rattachee a un inducteur de cout (unite de mesure representative de son volume), dont le cout unitaire sert de cle d'imputation. Elle s'inscrit dans la demarche de pilotage et de performance qui vise a maitriser et optimiser les moyens de l'organisation.",
    "rule": "En comptabilite analytique de gestion (le PCG laisse libre le choix des methodes de couts), le cout complet d'une prestation se construit en additionnant ses charges directes et la quote-part de charges indirectes. Avec la methode ABC, cette quote-part n'est plus imputee par une cle globale unique (par exemple le chiffre d'affaires) mais activite par activite : montant impute = nombre d'inducteurs consommes par le produit x cout unitaire de l'inducteur, ou cout unitaire de l'inducteur = ressources consommees par l'activite / nombre total d'inducteurs. Le resultat analytique = produits - (charges directes + charges indirectes imputees).",
    "reasoning": "Le raisonnement se mene en quatre temps. 1) Identifier les activites et leur inducteur, puis calculer le cout de chaque inducteur (ressources de l'activite divisees par le nombre total d'inducteurs). 2) Recenser, pour chaque prestation, les charges directes qui lui sont propres. 3) Imputer les charges indirectes en multipliant, pour chaque activite, le nombre d'inducteurs consommes par la prestation par le cout de l'inducteur. 4) Calculer le resultat et le taux de profitabilite, puis interpreter : une cle unique (le CA) fait porter les charges au prorata des ventes et peut masquer le fait qu'une prestation a fort CA en subventionne une autre. Ce raisonnement prolonge la logique du controle de gestion decrite dans le cours : produire une information chiffree fiable pour eclairer la decision et eviter les erreurs d'appreciation dans la definition de la strategie.",
    "example": "Cas FONEA, formation Certification acheteur. Charges directes : gestion des contrats 48 000 + fournitures 32 000 + remuneration 25 600 = 105 600 EUR. Charges indirectes imputees par activite : prospection 120 contacts x 100 = 12 000 ; salons 1,75 x 8 000 = 14 000 ; location salles 50 h x 200 = 10 000 ; maintenance 64 jours x 50 = 3 200 ; gestion administrative 0,50 region x 120 000 = 60 000 ; soit 99 200 EUR. Resultat analytique = 220 000 - 105 600 - 99 200 = 15 200 EUR, taux de profitabilite = 15 200 / 220 000 = 6,91 %. A l'inverse, la formation Manager des achats degage 1 452 000 - 643 500 - 780 500 = 28 000 EUR, soit seulement 1,93 %.",
    "frequentError": "Confondre le cout de l'inducteur avec une simple repartition au prorata du chiffre d'affaires : c'est precisement le travers de la cle globale unique que l'ABC corrige. Autre erreur frequente : inclure le chiffre d'affaires dans le total des charges directes (la ligne CA est un produit, pas une charge), ou oublier qu'une activite peut etre consommee de facon non proportionnelle au CA, ce qui conduit au phenomene de subventionnement entre prestations.",
    "linkedExerciseId": "ex-methode-abc-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance introduction",
        "sourceType": "course",
        "pageStart": 10,
        "pageEnd": 13,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-cout-cible",
    "domainId": "compta-analytique",
    "title": "La méthode du coût cible",
    "concept": "Le coût cible (target costing) est le coût de revient maximal admissible d'un produit, déterminé en amont (dès la conception) à partir du prix imposé par le marché et de la marge que l'entreprise s'est fixée sur l'ensemble du cycle de vie du produit.",
    "rule": "Le PCG (comptabilité de gestion) n'impose pas de méthode unique de calcul de coûts : le coût cible relève de la comptabilité de gestion à visée prévisionnelle, non d'une obligation normative des comptes annuels. Le principe directeur est l'inversion de l'équation traditionnelle : au lieu de Prix = Coût + Marge, on retient Coût cible = Prix de vente imposé par le marché - Profit cible. Le coût est ainsi traité comme une variable d'action bornée par deux contraintes : le prix du marché et la marge choisie.",
    "reasoning": "Le raisonnement se déroule en cascade. (1) Partir du prix payé par le consommateur final et redescendre les marges des intermédiaires pour obtenir le prix de vente de l'entreprise. (2) Retrancher le profit cible (et les charges hors composants) pour obtenir le coût cible global. (3) Décomposer ce coût cible global par composant en fonction de l'importance relative que le client accorde à chaque fonction, puis de la contribution de chaque composant à ces fonctions. (4) Comparer, composant par composant, le coût cible au coût estimé par les bureaux techniques. Un coût estimé supérieur au coût cible signale un effort de réduction (le composant coûte plus que sa valeur perçue) ; un coût estimé inférieur invite à se demander s'il ne faut pas enrichir le composant. Comme environ 80 % des coûts du cycle de vie sont pré-engagés dès le lancement de la fabrication, l'arbitrage doit se faire en conception.",
    "example": "Reprise de la logique Langelot (lot de 4 pots de crème glacée). Prix de vente HT au consommateur : 4,93 €. Les GMS exigent une marge de 35 % du prix HT, soit 4,93 x 0,35 = 1,73 € ; le prix de vente de l'entreprise aux GMS est donc 4,93 - 1,73 = 3,20 €. L'entreprise estime ses charges hors composants à 30 % et veut une marge de 10 %, tous deux assis sur le prix aux GMS, soit 3,20 x (30 % + 10 %) = 1,28 €. Le coût cible global des composants est donc 3,20 - 1,28 = 1,92 €. Or le coût estimé des composants s'élève à 1,08 (crème) + 0,60 (emballage) + 0,30 (suremballage) = 1,98 €, supérieur de 0,06 € au coût cible : il faut donc réduire les coûts, l'écart se concentrant sur l'emballage et le suremballage.",
    "frequentError": "Confondre le prix payé par le consommateur et le prix de vente de l'entreprise : on oublie de retrancher la marge du distributeur, ce qui gonfle artificiellement le coût cible. Autre erreur fréquente : appliquer le pourcentage de marge de l'entreprise au prix consommateur alors que, dans l'énoncé Langelot, il s'assoit sur le prix de vente aux GMS.",
    "linkedExerciseId": "ex-cout-cible-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance méthode du coût cible",
        "sourceType": "course",
        "pageStart": 4,
        "pageEnd": 8,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-yield-management",
    "domainId": "compta-analytique",
    "title": "Yield management et capacités",
    "concept": "Le yield management (ou management du revenu) est une combinaison optimale entre la recette unitaire et le taux de remplissage, destinee a maximiser le chiffre d'affaires associe a une unite de capacite perissable (un vol, un TGV, un hotel) en controlant le volume ET la structure de la demande.",
    "rule": "En comptabilite analytique, le yield management n'est legitime que lorsque trois conditions normatives sont reunies : (1) la capacite de production est finie et difficilement ajustable a court terme, ce qui interdit d'agir sur l'offre ; (2) la clientele peut etre segmentee selon sa sensibilite au prix, avec des barrieres d'etancheite empechant la dilution tarifaire ; (3) le cout marginal d'un client supplementaire est faible parce que les charges sont majoritairement fixes, ce qui rend profitables des tarifs tres bas tant qu'ils couvrent ce cout marginal. La decision tarifaire se fonde donc sur le cout marginal (cout variable du client additionnel), non sur le cout complet moyen.",
    "reasoning": "Le raisonnement se mene en deux temps. D'abord on distingue le pilotage du VOLUME (taux d'occupation) du pilotage de la STRUCTURE (repartition des ventes entre classes tarifaires) : un bon taux de remplissage obtenu par des prix casses peut faire baisser le CA, donc on raisonne sur le RevPAR = prix moyen x taux d'occupation, jamais sur l'occupation seule. Ensuite, pour accepter ou refuser une vente a tarif reduit, on compare le prix propose au cout marginal (cout variable unitaire) et non au cout complet moyen : tant que le prix couvre le cout variable, chaque vente additionnelle degage une marge sur cout variable qui ameliore le resultat, a condition que cette vente n'evince pas une vente a tarif plus eleve (cout d'opportunite en periode de pleine capacite).",
    "example": "Cas de la croisiere (400 cabines, P1 = 5 000 EUR, P2 = 3 500 EUR). L'entreprise A maximise l'occupation : 80 cabines a 5 000 EUR + 280 a 3 500 EUR = 1 380 000 EUR, taux 360/400 = 90 %, prix moyen 3 833 EUR. L'entreprise B privilegie le prix : 248 a 5 000 EUR + 40 a 3 500 EUR = 1 380 000 EUR, taux 72 %, prix moyen 4 792 EUR. L'entreprise C arbitre (yield management) : 192 a 5 000 EUR + 132 a 3 500 EUR = 960 000 + 462 000 = 1 422 000 EUR, taux 81 %, prix moyen 4 389 EUR. Malgre un taux inferieur a A et un prix moyen inferieur a B, C degage le CA le plus eleve : +42 000 EUR. C'est l'arbitrage volume/structure qui cree la valeur.",
    "frequentError": "Croire qu'un taux de remplissage eleve (voire 100 %) garantit le meilleur chiffre d'affaires et la rentabilite. Un remplissage maximal obtenu en bradant les prix abaisse le prix moyen et donc le RevPAR ; et meme a 100 %, si le prix moyen ne couvre pas l'ensemble des charges fixes, l'activite reste deficitaire. Le taux d'occupation ne doit jamais etre pilote seul, sans le prix moyen.",
    "linkedExerciseId": "ex-yield-management-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance yield management",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 7,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "lesson-ecarts",
    "domainId": "compta-analytique",
    "title": "Les écarts sur coûts et sur CA",
    "concept": "Un écart est la différence entre une donnée constatée (la réalisation) et une donnée de référence préétablie sur la base de standards. Sur coûts, on étudie successivement l'écart total, puis l'écart relatif à la production réelle (seul pertinent à analyser) décomposé par élément de coût, puis les sous-écarts (prix, quantité, et pour les charges indirectes : budget, activité, rendement). Sur chiffre d'affaires et sur résultat, la même convention s'applique mais le sens du signe s'inverse.",
    "rule": "Convention normative constante : Écart = Valeur constatée (réelle) - Valeur préétablie (prévue). Pour les coûts, un écart positif est défavorable et un écart négatif favorable ; pour le chiffre d'affaires et le résultat, c'est l'inverse (positif = favorable). L'écart total sur coût se scinde en écart sur volume de production [(Vr - Vp) x Cup] et écart global relatif à la production réelle [(Cur - Cup) x Vr], car ce dernier compare réel et préétabli sur une même base (la production réelle) et n'inclut donc aucun effet volume.",
    "reasoning": "On part du constat (coût réel de la production réelle) et on remonte vers la prévision en deux temps. D'abord on neutralise l'effet du simple écart de volume produit, qui n'est pas un dysfonctionnement d'exploitation, en adaptant les standards au volume réel (coût préétabli de la production réelle). L'écart résiduel, dit relatif à la production réelle, est alors imputable aux conditions internes d'exploitation. On le décompose ensuite par élément de coût, puis chaque écart en un sous-écart sur prix (valorisé sur les quantités réelles, origine externe/tarif) et un sous-écart sur quantité (valorisé au coût standard, origine interne/rendement). Pour les charges indirectes, l'existence de charges fixes oblige à décomposer encore l'écart sur coût d'unité d'œuvre en écart sur budget (effet prix des facteurs) et écart sur activité (effet de sur/sous-absorption des charges fixes), auxquels s'ajoute l'écart sur rendement (nombre d'unités d'œuvre consommées).",
    "example": "SARL Vanille, table « Leslie », octobre N. Production normale prévue : 1 600 tables ; coût unitaire préétabli : 147 €, donc coût préétabli de la production prévue = 1 600 x 147 = 235 200 €. Production réelle : 1 750 tables ; coût réel total constaté = 263 280 €. Écart total = 263 280 - 235 200 = +28 080 € (défavorable). Décomposition : coût préétabli de la production réelle = 147 x 1 750 = 257 250 €. Écart sur volume de production = (1 750 - 1 600) x 147 = +22 050 € ; écart global relatif à la production réelle = 263 280 - 257 250 = +6 030 € (défavorable). Vérification : 22 050 + 6 030 = 28 080 €. Sur la matière, l'écart de +2 310 € se décompose en écart sur quantité (9 100 - 8 750) x 4 = +1 400 € et écart sur prix (4,10 - 4) x 9 100 = +910 €, tous deux défavorables.",
    "frequentError": "Confondre l'écart sur volume de production (non pertinent à analyser, simple effet du nombre d'unités) avec l'écart relatif à la production réelle (seul significatif). Autre erreur : valoriser l'écart sur quantité au coût réel au lieu du coût standard, ou appliquer l'écart sur prix aux quantités prévues au lieu des quantités réelles. Enfin, inverser le sens du signe entre écarts sur coûts (positif = défavorable) et écarts sur chiffre d'affaires/résultat (positif = favorable).",
    "linkedExerciseId": "ex-ecarts-1",
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance Les écarts sur coûts",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 12,
        "effectiveDate": "2025-09-01"
      }
    ]
  }
];

export const comptaExercises: Exercise[] = [
  {
    "id": "ex-operations-courantes-1",
    "domainId": "compta-generale",
    "type": "qcm",
    "title": "Immobilisation ou charge ? Operations de la SA TopBike",
    "level": 1,
    "estimatedMinutes": 8,
    "statement": "Pour chaque operation de la SA TopBike, indiquez IMMOBILISATION (classe 2) ou CHARGE (classe 6) et justifiez en une phrase.\n1) Acquisition d'un vehicule de livraison.\n2) Achat d'essence pour le vehicule.\n3) Achat de 500 casques destines a la revente.\n4) Construction d'un entrepot de stockage.\n5) Location d'un photocopieur.\n6) Achat d'un ordinateur pour la comptabilite.",
    "expectedAnswer": "1) IMMOBILISATION : bien durable controle (2182 Materiel de transport).\n2) CHARGE : consommable au premier usage (606 Achats non stockes).\n3) CHARGE : marchandises destinees a la revente (607) ; biens revendus dans le cours normal de l'activite, donc non immobilises.\n4) IMMOBILISATION : actif corporel durable produit par l'entreprise (213 Constructions, via 231 puis 722).\n5) CHARGE : bien loue non controle comme immobilisation, loyer en charge (613 Locations).\n6) IMMOBILISATION : materiel informatique durable (2183), sauf option charge si valeur unitaire <= 500 HT.",
    "rubric": [
      {
        "label": "Qualification correcte des 6 operations",
        "points": 12
      },
      {
        "label": "Justification par les criteres PCG (durabilite, controle, destination, revente)",
        "points": 6
      },
      {
        "label": "Mention du compte ou de la classe pertinente",
        "points": 2
      }
    ],
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-operations-courantes-2",
    "domainId": "compta-generale",
    "type": "calculation",
    "title": "Cout d'acquisition d'un vehicule utilitaire selon l'option choisie",
    "level": 1,
    "estimatedMinutes": 15,
    "statement": "Vehicule utilitaire (deux sieges avant, TVA deductible). Facture : prix 16 500 HT ; transport et mise en service 1 500 HT ; remise 825 ; frais d'acte 145 HT. TVA 20 %.\n1) Cout d'acquisition hypothese n1 (frais d'acquisition rattaches au cout, methode de reference).\n2) Cout d'acquisition hypothese n2 (frais d'acquisition en charges).\n3) TVA deductible et compte utilise (hypothese n1).",
    "expectedAnswer": "1) Hyp. n1 : 16 500 + 1 500 - 825 + 145 = 17 320 HT au debit du 2182 Materiel de transport (subdivision du 218).\n2) Hyp. n2 : 16 500 + 1 500 - 825 = 17 175 HT immobilises ; 145 de frais d'acte en charge (6227 Frais d'actes et de contentieux).\n3) Utilitaire : TVA deductible. Sur 17 320 HT, TVA = 17 320 x 20 % = 3 464 au debit du 44562. Dette 404 = 17 320 + 3 464 = 20 784 TTC.",
    "rubric": [
      {
        "label": "Cout hyp. n1 correct (17 320) avec remise deduite et frais ajoutes",
        "points": 7
      },
      {
        "label": "Cout hyp. n2 correct (17 175) et frais d'acte en charge",
        "points": 7
      },
      {
        "label": "TVA deductible (3 464), compte 44562 et dette 404",
        "points": 6
      }
    ],
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-travaux-cloture-1",
    "domainId": "compta-generale",
    "type": "calculation",
    "title": "Régularisation du stock de matières premières de la société Laguerre",
    "level": 2,
    "estimatedMinutes": 20,
    "statement": "La société Laguerre régularise ses comptes de stocks au 31/12/N. Extrait de la balance avant inventaire : compte de stock de matières premières (310) = 6 800 € (débit) ; dépréciation des stocks de matières premières (391) = 1 235 € (crédit). L'inventaire physique au 31/12/N fait apparaître un stock de matières premières dont le coût d'achat est de 5 420 € ; la perte probable sur ce stock est estimée à 950 €. Travail à faire : 1) Passer les écritures de régularisation de la variation du stock de matières premières au 31/12/N. 2) Passer l'écriture d'ajustement de la dépréciation. 3) Présenter le compte 6031 (Variation des stocks de matières premières), en déduire son solde et son impact sur le résultat.",
    "expectedAnswer": "1) Variation de stock (sur la valeur d'origine) : annulation du stock initial — débit 6031 Variation des stocks de MP 6 800 / crédit 310 Stock de MP 6 800 ; constatation du stock final — débit 310 Stock de MP 5 420 / crédit 6031 Variation des stocks de MP 5 420. 2) Dépréciation par la méthode générale d'ajustement : dépréciation nécessaire (950) < dépréciation antérieure (1 235), donc reprise de 1 235 - 950 = 285 — débit 391 Dépréciations des stocks de MP 285 / crédit 78173 Reprises sur dépréciations des stocks et en-cours 285. 3) Compte 6031 : au débit 6 800 (annulation SI), au crédit 5 420 (constatation SF) ; solde débiteur = 1 380 €. Le stock ayant diminué (6 800 → 5 420), le solde débiteur de 1 380 € constitue une charge qui diminue le résultat de l'exercice N de 1 380 €. Globalement, l'effet net sur le résultat est de -1 380 (variation) + 285 (reprise) = -1 095 €.",
    "rubric": [
      {
        "label": "Écritures de variation de stock correctes (annulation SI 6 800 et constatation SF 5 420, bons comptes 6031/310)",
        "points": 8
      },
      {
        "label": "Sens et montant de l'ajustement de dépréciation (reprise de 285, comptes 391/78173)",
        "points": 7
      },
      {
        "label": "Solde du compte 6031 (1 380 débiteur) et interprétation de l'impact sur le résultat",
        "points": 5
      }
    ],
    "competencyIds": [
      "cg-cutoff"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-travaux-cloture-2",
    "domainId": "compta-generale",
    "type": "justification",
    "title": "Identifier le principe comptable méconnu (SARL Vive La Terre)",
    "level": 2,
    "estimatedMinutes": 15,
    "statement": "La SARL Vive La Terre prépare ses comptes au 31/12/N. Pour chacune des propositions suivantes formulées par la direction, indiquez le principe comptable qui n'est pas respecté et justifiez en une phrase. a) Le directeur commercial propose d'abandonner cette année le coût moyen pondéré, utilisé depuis la création, au profit du PEPS uniquement parce que cela augmenterait le bénéfice de 4 500 €, alors que les conditions sont inchangées. b) Un dégât des eaux survenu en décembre N a endommagé du stock pour un préjudice estimé à 3 310 € ; la direction veut n'enregistrer ce préjudice qu'en N+1. c) Le gérant souhaite inscrire au bilan un bâtiment acheté 150 000 € pour sa valeur d'expertise de 250 000 €. d) Sur les titres détenus à la clôture, on constate une perte probable de 1 800 € sur les actions Brady et une plus-value latente de 1 100 € sur les actions Hicks ; le gérant ne veut comptabiliser qu'une dépréciation nette de 700 €.",
    "expectedAnswer": "a) Principe de permanence des méthodes : on ne peut changer de méthode d'évaluation d'un exercice à l'autre que pour un changement exceptionnel de situation ou une meilleure information, jamais dans le seul but d'augmenter le résultat. b) Principe d'indépendance des exercices : la perte de valeur trouvant son origine en N (dégât de décembre N) doit être rattachée à N par une dépréciation ; le principe de prudence impose aussi de constater dès N cette perte probable de 3 310 €. c) Principe du nominalisme (coût historique) : le bâtiment reste inscrit à son coût d'acquisition de 150 000 € ; la plus-value latente ne peut être enregistrée (principe de prudence : un gain non réalisé n'est jamais constaté). d) Principe de non-compensation (et prudence) : on ne peut compenser la perte probable de 1 800 € (à déprécier) avec le gain latent de 1 100 € (qui ne se comptabilise pas) ; la dépréciation à constater est de 1 800 €, et non 700 €.",
    "rubric": [
      {
        "label": "Item a) permanence des méthodes correctement identifié et justifié",
        "points": 5
      },
      {
        "label": "Item b) indépendance des exercices (et/ou prudence) correctement identifié et justifié",
        "points": 5
      },
      {
        "label": "Item c) nominalisme / coût historique correctement identifié et justifié",
        "points": 5
      },
      {
        "label": "Item d) non-compensation identifiée, avec dépréciation correcte de 1 800 € (pas 700)",
        "points": 5
      }
    ],
    "competencyIds": [
      "cg-cutoff"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-titres-1",
    "domainId": "compta-generale",
    "type": "qcm",
    "title": "Classement comptable des titres selon l'intention de détention",
    "level": 3,
    "estimatedMinutes": 8,
    "statement": "Pour chacune des quatre situations suivantes, indiquez le numéro et l'intitulé du compte d'imputation, en justifiant brièvement.\nA) La SARL détient 1 500 actions Morin ; le capital de la SA Morin est composé de 10 000 actions, et elle souhaite les conserver le plus longtemps possible.\nB) Elle détient 120 actions « Chez Gigi » (capital : 2 000 actions) qu'elle veut conserver durablement, sans intervenir dans la gestion de la société.\nC) Elle détient 80 actions Jérôme acquises dans un but spéculatif.\nD) Elle détient 10 obligations Gilbert 5 % souscrites à l'émission pour leur bon rendement, remboursables dans 5 ans, sans intervention dans la gestion.\nIndiquez le compte de chaque ligne parmi : 261, 273, 503, 506.",
    "expectedAnswer": "A) Actions Morin → compte 261 - Titres de participation. La détention est durable et la participation représente 1 500 / 10 000 = 15 % du capital, soit plus de 10 % : influence présumée sur la gestion.\nB) Actions « Chez Gigi » → compte 273 - TIAP. Détention durable mais participation de 120 / 2 000 = 6 % seulement (< 10 %) et sans intervention dans la gestion : titres détenus pour leur rentabilité à plus ou moins longue échéance.\nC) Actions Jérôme → compte 503 - Actions (VMP). But spéculatif, gain à brève échéance, conservation < 1 an.\nD) Obligations Gilbert 5 % → compte 273 - TIAP. Détention durable, recherchée pour le rendement, sans intervention dans la gestion de l'émetteur (le 506 serait réservé à des obligations classées en VMP).",
    "rubric": [
      {
        "label": "Actions Morin : compte 261 + justification du seuil de 10 % (15 %)",
        "points": 5
      },
      {
        "label": "Actions Chez Gigi : compte 273 + justification (durable, < 10 %, sans gestion)",
        "points": 5
      },
      {
        "label": "Actions Jérôme : compte 503 + justification du but spéculatif",
        "points": 5
      },
      {
        "label": "Obligations Gilbert : compte 273 + justification (durable, rendement, sans gestion)",
        "points": 5
      }
    ],
    "competencyIds": [
      "cg-titres"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-titres-2",
    "domainId": "compta-generale",
    "type": "calculation",
    "title": "Régularisation des dépréciations de titres à l'inventaire",
    "level": 3,
    "estimatedMinutes": 22,
    "statement": "Au 31/12/N, le portefeuille comprend trois lignes. Pour chacune, calculez la dépréciation nécessaire, comparez-la à la dépréciation déjà constituée au 31/12/N-1, puis passez l'écriture d'ajustement au journal.\n1) Actions Morin (titres de participation, compte 261) : 1 000 titres à valeur d'entrée 15 € ; cours unitaire au 31/12/N = 13 € ; dépréciation antérieure (2961) = 3 000 €.\n2) Actions « Chez Gigi » (TIAP, compte 273) : 100 titres à valeur d'entrée 62 € ; cours unitaire au 31/12/N = 45 € ; dépréciation antérieure (2973) = 1 200 €.\n3) Actions Étoile des neiges (VMP, compte 503) : 15 titres à valeur d'entrée 90 € ; cours unitaire au 31/12/N = 60 € ; aucune dépréciation antérieure.\nRappel : seules les moins-values latentes sont dépréciées ; aucune compensation entre lignes.",
    "expectedAnswer": "1) Morin : valeur d'entrée 1 000 × 15 = 15 000 € ; valeur d'inventaire 1 000 × 13 = 13 000 € → dépréciation nécessaire 2 000 €. Antérieure 3 000 € : la dépréciation diminue de 1 000 € → REPRISE. Écriture : débit 2961 Dépréciations des titres de participation 1 000 / crédit 7866 Reprises sur dépréciations des éléments financiers 1 000.\n2) Chez Gigi : valeur d'entrée 100 × 62 = 6 200 € ; valeur d'inventaire 100 × 45 = 4 500 € → dépréciation nécessaire 1 700 €. Antérieure 1 200 € : la dépréciation augmente de 500 € → DOTATION complémentaire. Écriture : débit 6866 Dotations aux dépréciations des éléments financiers 500 / crédit 2973 Dépréciations des TIAP 500.\n3) Étoile des neiges : valeur d'entrée 15 × 90 = 1 350 € ; valeur d'inventaire 15 × 60 = 900 € → dépréciation nécessaire 450 €. Antérieure 0 € : création → DOTATION. Écriture : débit 6866 Dotations aux dépréciations des éléments financiers 450 / crédit 5903 Dépréciations des actions 450.\nContrôle : total des dotations = 500 + 450 = 950 € ; total des reprises = 1 000 €. (La ligne Morin reste isolée : sa reprise ne compense pas les dotations des deux autres lignes.)",
    "rubric": [
      {
        "label": "Morin : calcul correct (2 000 nécessaire) et reprise de 1 000 € bien orientée (2961 / 7866)",
        "points": 7
      },
      {
        "label": "Chez Gigi : calcul correct (1 700 nécessaire) et dotation complémentaire de 500 € (6866 / 2973)",
        "points": 7
      },
      {
        "label": "Étoile des neiges : calcul correct (450) et dotation de création de 450 € (6866 / 5903)",
        "points": 6
      }
    ],
    "competencyIds": [
      "cg-titres"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-emprunts-obligataires-1",
    "domainId": "compta-generale",
    "type": "calculation",
    "title": "Emission CSP : dette, prime, interets courus et ecriture de souscription",
    "level": 3,
    "estimatedMinutes": 25,
    "statement": "La societe CSP (cloture au 31/12) emet le 01/09/N 8 000 obligations de valeur nominale 1 000 EUR. Le prix d'emission est de 996 EUR et le prix de remboursement de 1 006 EUR. Chaque obligation porte un coupon annuel de 90 EUR, payable le 01/10 de chaque annee (premier coupon le 01/10/N+1). Travail a faire : 1) Calculer le montant de la dette a inscrire au compte 163, ainsi que la prime de remboursement a porter au compte 169. 2) Presenter au journal l'ecriture de souscription de l'emprunt (date 01/09/N). 3) Calculer le montant des interets courus a rattacher a l'exercice N au 31/12/N et indiquer les comptes mouvementes de l'ecriture d'inventaire correspondante.",
    "expectedAnswer": "1) Dette au compte 163 = 8 000 x 1 006 = 8 048 000 EUR (prix de remboursement). Prix d'emission = 8 000 x 996 = 7 968 000 EUR (compte 4671). Prime de remboursement (169) = (1 006 - 996) x 8 000 = 80 000 EUR. Controle : 7 968 000 + 80 000 = 8 048 000 EUR. 2) Ecriture du 01/09/N : Debit 4671 Obligataires, obligations a placer 7 968 000 ; Debit 169 Primes de remboursement des obligations 80 000 ; Credit 163 Autres emprunts obligataires 8 048 000. 3) Coupon annuel total = 90 x 8 000 = 720 000 EUR. Le premier coupon plein etant paye le 01/10/N+1, la date de jouissance (point de depart des interets) est le 01/10/N : du 01/10/N au 31/12/N courent 3 mois. Interets courus = 720 000 x 3/12 = 180 000 EUR. Ecriture d'inventaire au 31/12/N : Debit 661 Charges d'interets pour 180 000 ; Credit 16883 Interets courus sur autres emprunts obligataires pour 180 000 (ecriture contrepassee a la reouverture le 01/01/N+1).",
    "rubric": [
      {
        "label": "Dette au 163 (prix de remboursement) et prime au 169 correctement calculees",
        "points": 6
      },
      {
        "label": "Ecriture de souscription equilibree avec les bons comptes (4671, 169, 163)",
        "points": 7
      },
      {
        "label": "Calcul des interets courus avec prorata temporis (3 mois depuis la jouissance 01/10/N) = 180 000 EUR",
        "points": 4
      },
      {
        "label": "Comptes de l'ecriture d'inventaire (661 / 16883) et mention de la contrepassation",
        "points": 3
      }
    ],
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-emprunts-obligataires-2",
    "domainId": "compta-generale",
    "type": "justification",
    "title": "Justifier le traitement comptable de la prime et des frais d'emission",
    "level": 3,
    "estimatedMinutes": 15,
    "statement": "Un etudiant affirme : A l'emission d'un emprunt obligataire, on enregistre la dette au compte 163 pour le prix d'emission, et la prime de remboursement est une charge a comptabiliser immediatement en resultat l'annee de l'emission. Discuter cette affirmation en deux points : a) Pour quel montant la dette est-elle reellement inscrite au compte 163, et quelle est la definition comptable de la prime de remboursement selon le PCG ? b) Comment et sur quelle duree la charge que represente la prime de remboursement est-elle imputee au resultat ? Citer le compte de dotation utilise et les deux methodes admises par le PCG.",
    "expectedAnswer": "a) L'affirmation est fausse sur le montant : la dette est inscrite au credit du compte 163 pour le PRIX DE REMBOURSEMENT, pas le prix d'emission. Le prix d'emission est porte au debit du compte 4671. La prime de remboursement, au sens du PCG, est la difference entre le prix de remboursement et le prix d'emission ; le PCG regroupe sous cette appellation la prime d'emission negative et la prime de remboursement proprement dite. b) L'affirmation est fausse sur l'imputation : la prime n'est pas passee en charge immediatement. Etant une charge financiere repartie, elle est etalee sur la DUREE DE L'EMPRUNT par des dotations aux amortissements au debit du compte 6861 (Dotations aux amortissements des primes de remboursement des obligations). Le PCG admet deux methodes : amortissement au prorata des interets courus (conforme a la logique financiere), ou amortissement par fractions egales au prorata de la duree de l'emprunt. Tant qu'elle n'est pas amortie, la prime figure a l'actif du bilan, apres les charges a repartir sur plusieurs exercices.",
    "rubric": [
      {
        "label": "Correction du montant : dette au 163 = prix de remboursement (et non prix d'emission)",
        "points": 6
      },
      {
        "label": "Definition PCG de la prime = prix de remboursement - prix d'emission (regroupement des deux primes)",
        "points": 5
      },
      {
        "label": "Etalement sur la duree de l'emprunt via dotations au compte 6861 (pas en charge immediate)",
        "points": 6
      },
      {
        "label": "Citation des deux methodes admises (prorata des interets courus / fractions egales)",
        "points": 3
      }
    ],
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-constitution-entreprises-1",
    "domainId": "compta-generale",
    "type": "calculation",
    "title": "SA Les Delices du Perigord : capital, liberation et soldes",
    "level": 2,
    "estimatedMinutes": 25,
    "statement": "La SA 'Les Delices du Perigord' est constituee par M. Ostrowski et six autres actionnaires. M. Ostrowski apporte son entreprise : elements incorporels du fonds 50 000 €, installations techniques et materiels 30 000 €, stocks de marchandises 1 600 €, disponibilites en banque 2 400 €. La societe reprend un emprunt bancaire de 11 000 € et des dettes fournisseurs de 3 000 €. Les six autres actionnaires apportent chacun 5 000 € en numeraire, libere du minimum legal a la constitution. Travail a faire : (a) determiner le montant du capital social ; (b) determiner le montant total appele et verse a la constitution ; (c) indiquer le solde (sens et montant) des comptes 1011, 1013 et 109 a l'issue de la constitution ; (d) verifier le total du bilan d'ouverture.",
    "expectedAnswer": "(a) Apport net Ostrowski = (50 000 + 30 000 + 1 600 + 2 400) - (11 000 + 3 000) = 84 000 - 14 000 = 70 000 €. Numeraire = 6 x 5 000 = 30 000 €. Capital social = 70 000 + 30 000 = 100 000 €. (b) Nature liberee a 100 % = 70 000 ; numeraire libere du minimum legal SA (1/2) = 30 000 x 0,5 = 15 000. Total appele-verse = 70 000 + 15 000 = 85 000 €. (c) Compte 1011 'Capital souscrit non appele' : solde crediteur 15 000 € (fraction numeraire differee) ; compte 1013 'Capital souscrit appele verse' : solde crediteur 85 000 € ; compte 109 'Actionnaires : capital souscrit non appele' : solde debiteur 15 000 € (inscrit en tete d'actif). (d) Actif : 109 = 15 000, fonds commercial 50 000, materiel 30 000, stocks 1 600, disponibilites = 2 400 + 15 000 = 17 400, total = 114 000 €. Passif : capital 100 000, emprunt 11 000, fournisseurs 3 000, total = 114 000 €. Le bilan est equilibre.",
    "rubric": [
      {
        "label": "Capital social correctement determine (apport nature net + numeraire = 100 000)",
        "points": 6
      },
      {
        "label": "Montant appele-verse a la constitution (85 000) avec application du minimum legal au seul numeraire",
        "points": 6
      },
      {
        "label": "Sens et montant des soldes 1011, 1013 et 109",
        "points": 5
      },
      {
        "label": "Equilibre du bilan d'ouverture verifie a 114 000",
        "points": 3
      }
    ],
    "competencyIds": [
      "cg-constitution"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-constitution-entreprises-2",
    "domainId": "compta-generale",
    "type": "short-answer",
    "title": "Regles de liberation et frais de constitution",
    "level": 2,
    "estimatedMinutes": 12,
    "statement": "Repondez de maniere structuree : (1) Rappelez les regles de liberation applicables aux apports en nature et aux apports en numeraire dans une SA et dans une SARL lors de la constitution. (2) La SARL Match-Up recoit la facture du notaire pour ses frais de constitution. Citez les deux methodes d'enregistrement comptable autorisees par le PCG, en precisant laquelle est la methode de reference. (3) Quel est l'inconvenient principal de l'activation (immobilisation) des frais de constitution ?",
    "expectedAnswer": "(1) Les apports en nature sont integralement liberes des la constitution, quelle que soit la forme juridique. Les apports en numeraire peuvent etre liberes partiellement : au minimum 1/2 (50 %) a la constitution dans une SA (et SAS), au minimum 20 % dans une SARL ; le solde est appele par les dirigeants ou le gerant dans un delai maximal de 5 ans. (2) Methode de reference (preconisee par le PCG) : enregistrer les frais en charges par nature, imputees en totalite sur le resultat du premier exercice. Methode alternative : activer les frais au compte 2011 'Frais de constitution' (directement ou via le compte 721), puis les amortir lineairement sans prorata temporis sur 5 ans maximum. (3) Tant que les frais de constitution actives ne sont pas totalement amortis, la societe ne peut proceder a aucune distribution de dividendes.",
    "rubric": [
      {
        "label": "Regle de liberation des apports en nature (100 % a la constitution)",
        "points": 5
      },
      {
        "label": "Seuils de liberation du numeraire : 1/2 en SA, 20 % en SARL, solde sous 5 ans",
        "points": 7
      },
      {
        "label": "Identification des deux methodes et de la methode de reference (charges)",
        "points": 5
      },
      {
        "label": "Inconvenient : blocage de la distribution de dividendes jusqu'a amortissement complet",
        "points": 3
      }
    ],
    "competencyIds": [
      "cg-constitution"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-variations-capital-1",
    "domainId": "compta-generale",
    "type": "calculation",
    "title": "Augmentation en numéraire : prime, fonds appelés et écritures",
    "level": 4,
    "estimatedMinutes": 25,
    "statement": "Une SA au capital de 500 000 EUR (5 000 actions de nominal 100 EUR, intégralement libérées) décide en AGE d'émettre 1 000 actions nouvelles de numéraire au prix d'émission de 120 EUR, libérées du minimum légal à la souscription (la prime étant intégralement appelée). La souscription est intégrale et les fonds sont versés en banque. Travail demandé : (a) montant de l'augmentation en nominal et nouveau capital ; (b) montant de la prime d'émission ; (c) montant des fonds appelés et reçus à la souscription, et fraction restant à appeler ; (d) écriture de recueil des fonds (compte 4563) ; (e) écriture de constatation de l'augmentation de capital.",
    "expectedAnswer": "(a) Augmentation nominale = 1 000 x 100 = 100 000 EUR ; nouveau capital = 500 000 + 100 000 = 600 000 EUR. (b) Prime d'émission = (120 - 100) x 1 000 = 20 000 EUR. (c) Minimum appelé sur le nominal = quart de 100 000 = 25 000 EUR ; prime appelée en totalité = 20 000 EUR ; fonds reçus à la souscription = 25 000 + 20 000 = 45 000 EUR ; fraction du nominal restant à appeler = 75 000 EUR. (d) Recueil des fonds : débit 512 Banque 45 000 / crédit 4563 Actionnaires - Versements reçus sur augmentation de capital 45 000. (e) Constatation : débit 4563 pour 45 000 et débit 109 Actionnaires : capital souscrit non appelé pour 75 000 ; crédit 1011 Capital souscrit non appelé 75 000, crédit 1013 Capital souscrit appelé versé 25 000, crédit 1041 Primes d'émission 20 000. Contrôle : total débits 120 000 = total crédits 120 000.",
    "rubric": [
      {
        "label": "Prime d'émission et nouveau capital exacts",
        "points": 5
      },
      {
        "label": "Fonds appelés (quart du nominal + prime intégrale) et fraction non appelée corrects",
        "points": 6
      },
      {
        "label": "Écriture de recueil des fonds (4563) correcte",
        "points": 3
      },
      {
        "label": "Écriture de constatation équilibrée (1011, 1013, 1041, 109)",
        "points": 6
      }
    ],
    "competencyIds": [
      "cg-variations-capital"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-variations-capital-2",
    "domainId": "compta-generale",
    "type": "short-answer",
    "title": "Incorporation de réserves : droit d'attribution et nature de l'opération",
    "level": 4,
    "estimatedMinutes": 15,
    "statement": "Une SA au capital de 800 000 EUR (8 000 actions de nominal 100 EUR, entièrement libérées) augmente son capital de 100 000 EUR par incorporation de réserves (50 000 EUR de réserve légale et 50 000 EUR d'autres réserves), avec distribution d'actions gratuites. La valeur réelle de l'action avant l'opération est de 150 EUR. Répondre : (a) nombre d'actions gratuites émises ; (b) valeur réelle de l'action après l'augmentation et valeur théorique du droit d'attribution ; (c) combien d'actions anciennes faut-il posséder pour obtenir une action gratuite ; (d) en quoi cette opération se distingue-t-elle d'une augmentation en numéraire quant au flux de trésorerie et au compte crédité ?",
    "expectedAnswer": "(a) Nombre d'actions gratuites = réserves incorporées / valeur nominale = 100 000 / 100 = 1 000 actions ; le capital passe à 900 000 EUR (9 000 actions). (b) Valeur globale inchangée = 8 000 x 150 = 1 200 000 EUR répartie sur 9 000 actions, soit 1 200 000 / 9 000 = 133,33 EUR après ; valeur théorique du DA = 150 - 133,33 = 16,67 EUR. (c) Rapport d'attribution = 8 000 anciennes pour 1 000 nouvelles = 8 actions anciennes pour 1 action gratuite. (d) L'incorporation de réserves n'apporte aucun flux monétaire nouveau : c'est un simple virement interne aux capitaux propres. Comptablement, on débite le compte de réserve (106, et la réserve légale peut être incorporée) par le crédit du compte 1013 Capital souscrit appelé versé, sans intervention de compte de trésorerie, contrairement à l'augmentation en numéraire qui encaisse des fonds via le 4563.",
    "rubric": [
      {
        "label": "Nombre d'actions gratuites et nouveau capital",
        "points": 5
      },
      {
        "label": "Valeur après opération et valeur du DA correctes",
        "points": 6
      },
      {
        "label": "Rapport d'attribution (8 pour 1) justifié",
        "points": 4
      },
      {
        "label": "Distinction flux/compte crédité (pas de trésorerie, crédit 1013) explicitée",
        "points": 5
      }
    ],
    "competencyIds": [
      "cg-variations-capital"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-methode-abc-1",
    "domainId": "compta-analytique",
    "type": "calculation",
    "title": "Calcul d'un cout d'inducteur et imputation des charges indirectes (cas FONEA)",
    "level": 2,
    "estimatedMinutes": 20,
    "statement": "FONEA a identifie l'activite Maintenance informatique, dont l'inducteur est le nombre de jours de formation et les ressources consommees s'elevent a 30 700 EUR. Le nombre total de jours de formation est de 614 (la formation Manager des achats en consomme 550, la formation Certification acheteur 64). 1) Calculez le cout de l'inducteur de cette activite. 2) Determinez le montant de charges indirectes de Maintenance informatique impute a chacune des deux formations. 3) Expliquez en une phrase pourquoi imputer cette activite selon le nombre de jours de formation est plus pertinent qu'une repartition au prorata du chiffre d'affaires.",
    "expectedAnswer": "1) Cout de l'inducteur = 30 700 / 614 = 50 EUR par jour de formation. 2) Manager des achats : 550 x 50 = 27 500 EUR ; Certification acheteur : 64 x 50 = 3 200 EUR (total verifie : 27 500 + 3 200 = 30 700 EUR). 3) Le nombre de jours de formation reflete la consommation reelle de l'activite par chaque prestation, alors qu'une cle au prorata du CA imputerait les charges sans lien avec l'effort de maintenance reellement engage, faussant ainsi le cout de chaque formation.",
    "rubric": [
      {
        "label": "Cout de l'inducteur correct (30 700 / 614 = 50 EUR)",
        "points": 6
      },
      {
        "label": "Imputation correcte aux deux formations (27 500 et 3 200) avec verification du total",
        "points": 8
      },
      {
        "label": "Justification pertinente de l'inducteur face a la cle CA unique",
        "points": 6
      }
    ],
    "competencyIds": [
      "ca-abc"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-methode-abc-2",
    "domainId": "compta-analytique",
    "type": "justification",
    "title": "Subventionnement entre prestations : interpreter le passage de la cle CA a l'ABC",
    "level": 2,
    "estimatedMinutes": 15,
    "statement": "Chez FONEA, la repartition des charges indirectes au prorata du chiffre d'affaires (methode des centres d'analyse) rendait la formation Certification acheteur non profitable, tandis que la formation Manager des achats affichait un taux de profitabilite de 3,07 %. Avec la methode ABC, les taux deviennent respectivement 6,91 % et 1,93 %. En vous appuyant sur la notion de subventionnement, justifiez ce renversement et indiquez la decision a recommander a M. GOULARD quant au maintien des formations.",
    "expectedAnswer": "La cle unique au prorata du CA imputait les charges proportionnellement aux ventes. Or la formation Manager des achats consomme davantage d'activites indirectes (gestion administrative et maintenance plus lourdes du fait du nombre de sites, plus de jours d'utilisation des salles). La methode des centres d'analyse sous-estimait donc le cout de Manager des achats : cette formation etait subventionnee par Certification acheteur, dont le cout etait surestime. L'ABC corrige ce biais en imputant les charges selon les inducteurs reellement consommes : Certification acheteur devient profitable (6,91 %) et Manager des achats voit son taux baisser a 1,93 %. Recommandation : privilegier la methode ABC pour la pertinence de la repartition, et maintenir les deux formations, Manager des achats restant profitable et constituant le produit phare susceptible d'ouvrir de nouveaux debouches.",
    "rubric": [
      {
        "label": "Explication du mecanisme de la cle CA unique et de son biais",
        "points": 5
      },
      {
        "label": "Application correcte de la notion de subventionnement au cas (sens du transfert)",
        "points": 7
      },
      {
        "label": "Argumentaire en faveur de l'ABC",
        "points": 4
      },
      {
        "label": "Decision de maintien des deux formations justifiee",
        "points": 4
      }
    ],
    "competencyIds": [
      "ca-abc"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-cout-cible-1",
    "domainId": "compta-analytique",
    "type": "calculation",
    "title": "Du prix consommateur au coût cible global (cas dérivé Langelot)",
    "level": 3,
    "estimatedMinutes": 15,
    "statement": "La société Langelot envisage une seconde référence : un lot de 4 pots de sorbet vendu 4,80 € HT au consommateur final. Les GMS exigent une marge de 35 % du prix de vente HT au consommateur. La société estime ses charges hors composants à 30 % de son prix de vente aux GMS et veut dégager une marge de 10 % de ce même prix de vente aux GMS. Le coût estimé des composants ressort à : sorbet 4 x 0,30 = 1,20 € ; emballage 4 x 0,15 = 0,60 € ; suremballage 0,30 €. Travail demandé : (a) calculer le prix de vente de Langelot aux GMS ; (b) calculer le coût cible global des composants ; (c) calculer le coût estimé total et conclure sur l'existence et le sens de l'écart global.",
    "expectedAnswer": "(a) Marge GMS = 4,80 x 0,35 = 1,68 €. Prix de vente aux GMS = 4,80 - 1,68 = 3,12 €. (b) Charges hors composants + marge entreprise = 3,12 x (30 % + 10 %) = 3,12 x 40 % = 1,248 ≈ 1,25 €. Coût cible global = 3,12 - 1,25 = 1,87 € (1,872 € avant arrondi). (c) Coût estimé = 1,20 + 0,60 + 0,30 = 2,10 €. Écart global = coût estimé - coût cible = 2,10 - 1,87 = 0,23 €, soit un coût estimé supérieur d'environ 12 % au coût cible : l'entreprise doit chercher à réduire ses coûts (notamment emballage/suremballage) ou réévaluer le prix de vente.",
    "rubric": [
      {
        "label": "Prix de vente aux GMS correct (déduction de la marge distributeur)",
        "points": 6
      },
      {
        "label": "Coût cible global correct (application du 40 % sur le prix aux GMS puis soustraction)",
        "points": 8
      },
      {
        "label": "Coût estimé total exact et écart global chiffré",
        "points": 4
      },
      {
        "label": "Conclusion sur le sens de l'écart (réduction de coûts nécessaire)",
        "points": 2
      }
    ],
    "competencyIds": [
      "ca-cout-cible"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-cout-cible-2",
    "domainId": "compta-analytique",
    "type": "short-answer",
    "title": "Interpréter un écart coût estimé / coût cible par composant",
    "level": 3,
    "estimatedMinutes": 12,
    "statement": "Pour le lot de 4 pots de crème glacée Langelot, on relève par composant : crème glacée coût estimé 1,08 € pour un coût cible 1,52 € ; emballage coût estimé 0,60 € pour un coût cible 0,25 € ; suremballage coût estimé 0,30 € pour un coût cible 0,15 €. Travail demandé : pour chaque composant, indiquer le sens de l'écart, dire si la situation est a priori favorable ou défavorable, et proposer pour les composants problématiques une piste d'optimisation cohérente avec la perspective valeur-coût.",
    "expectedAnswer": "Crème glacée : coût estimé (1,08) INFÉRIEUR au coût cible (1,52), écart de -0,44 €. Situation a priori favorable : aucun effort de réduction n'est nécessaire ; l'entreprise peut même se demander s'il ne faut pas enrichir/améliorer ce composant central (forte valeur perçue) pour mieux satisfaire le client, sans pour autant dégrader la qualité reconnue de la crème. Emballage : coût estimé (0,60) SUPÉRIEUR au coût cible (0,25), écart +0,35 €. Suremballage : coût estimé (0,30) SUPÉRIEUR au coût cible (0,15), écart +0,15 €. Ces deux composants coûtent plus que leur valeur perçue : il faut réduire leur coût, par exemple en renonçant aux pots réutilisables au profit de pots/cartons recyclables moins coûteux mais respectant l'environnement, ou en cherchant d'autres fournisseurs, tout en maintenant la qualité attendue. Le rapprochement doit préserver la valeur perçue par le client.",
    "rubric": [
      {
        "label": "Sens correct des trois écarts (signe et comparaison estimé/cible)",
        "points": 6
      },
      {
        "label": "Qualification favorable (crème) / défavorable (emballages) justifiée",
        "points": 6
      },
      {
        "label": "Pistes d'optimisation pertinentes pour emballage et suremballage",
        "points": 5
      },
      {
        "label": "Rappel de la contrainte valeur-coût (ne pas dégrader la valeur perçue)",
        "points": 3
      }
    ],
    "competencyIds": [
      "ca-cout-cible"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-yield-management-1",
    "domainId": "compta-analytique",
    "type": "qcm",
    "title": "Arbitrage volume/structure et conditions du yield management",
    "level": 4,
    "estimatedMinutes": 12,
    "statement": "Repondez aux 4 questions a choix unique en justifiant chaque reponse en une phrase.\n\nQ1. Trois compagnies de croisiere vendent 400 cabines (P1 = 5 000 EUR, P2 = 3 500 EUR). A : 80 a 5 000 + 280 a 3 500. B : 248 a 5 000 + 40 a 3 500. C : 192 a 5 000 + 132 a 3 500. Laquelle pratique le yield management et maximise le CA ?\n  a) A   b) B   c) C\n\nQ2. Le taux d'occupation de l'entreprise C est de :\n  a) 90 %   b) 81 %   c) 72 %\n\nQ3. Parmi les conditions suivantes, laquelle n'est PAS requise pour pratiquer le yield management ?\n  a) capacite finie et difficilement ajustable a court terme\n  b) cout marginal d'un client supplementaire eleve\n  c) clientele segmentable selon la sensibilite au prix\n\nQ4. La 'regle d'etancheite' de la tarification differenciee sert a :\n  a) eviter qu'un client pret a payer le tarif fort n'accede au tarif faible (dilution tarifaire)\n  b) rendre la grille tarifaire lisible pour le client\n  c) aligner les prix sur ceux du marche",
    "expectedAnswer": "Q1 : c) C. C realise (192 x 5 000) + (132 x 3 500) = 960 000 + 462 000 = 1 422 000 EUR, contre 1 380 000 EUR pour A et B. C arbitre entre taux d'occupation et prix moyen au lieu de maximiser l'un des deux.\nQ2 : b) 81 %. Volume vendu C = 192 + 132 = 324 cabines ; 324 / 400 = 81 %.\nQ3 : b). Au contraire, le yield management exige un cout marginal FAIBLE (charges majoritairement fixes), ce qui rend profitables des tarifs tres bas.\nQ4 : a). L'etancheite (barrieres d'age, reservation a l'avance, non-annulation, etc.) empeche le report d'un client a fort consentement a payer vers un tarif reduit, condition d'efficacite de la tarification differenciee.",
    "rubric": [
      {
        "label": "Q1 bonne reponse (C) avec calcul du CA des trois compagnies",
        "points": 6
      },
      {
        "label": "Q2 bonne reponse (81 %) avec calcul 324/400",
        "points": 4
      },
      {
        "label": "Q3 bonne reponse (cout marginal faible et non eleve) justifiee",
        "points": 5
      },
      {
        "label": "Q4 bonne reponse (etancheite contre la dilution tarifaire)",
        "points": 5
      }
    ],
    "competencyIds": [
      "ca-yield"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-yield-management-2",
    "domainId": "compta-analytique",
    "type": "calculation",
    "title": "Decision d'allottement au cout marginal (cas Chez Ernest)",
    "level": 5,
    "estimatedMinutes": 20,
    "statement": "L'hotel 'Chez Ernest' (360 chambres, 180 jours par semestre, soit 64 800 chambres disponibles par semestre) presente pour le 2e semestre 2016 la structure de couts suivante : CA hebergement 4 100 000 EUR ; cout variable total 1 200 000 EUR ; cout fixe 4 600 000 EUR ; cout total 5 800 000 EUR. Le cout moyen par chambre louable est de 89,50 EUR, dont 18,50 EUR de cout variable. Le prix de vente officiel (tarif plein) est de 120 EUR.\nUn voyagiste propose un allottement (reservation contractuelle ferme) de 10 chambres par jour, soit 300 chambres par mois, au tarif de 60 EUR la chambre (reduction de 50 %). Le responsable des ventes refuse d'emblee, au motif que le cout moyen (89,50 EUR) depasse le prix propose (60 EUR).\n\n1) Le refus fonde sur le cout moyen complet est-il justifie ? Sur quel cout faut-il raisonner et pourquoi ?\n2) Calculez la marge sur cout variable degagee par une chambre vendue a 60 EUR, puis l'impact mensuel de l'allottement sur le resultat, en supposant qu'il n'evince aucune autre vente.\n3) En juin, le taux de remplissage atteint 100 % et les chambres se vendent au tarif plein de 120 EUR. Reexaminez la decision pour ce mois.",
    "expectedAnswer": "1) Le refus n'est pas justifie. Le cout moyen complet (89,50 EUR) integre des charges fixes deja engagees, qui ne varient pas avec une vente additionnelle. Comme la capacite existe (chambres invendues) et que la vente n'engendre aucun cout fixe supplementaire, il faut raisonner au COUT MARGINAL, ici assimile au cout variable unitaire de 18,50 EUR. La condition pour raisonner ainsi : disposer de capacite disponible et n'engager aucune charge de structure additionnelle.\n\n2) Marge sur cout variable par chambre = 60 - 18,50 = 41,50 EUR. Pour 300 chambres par mois : 41,50 x 300 = 12 450 EUR de marge additionnelle. Tant que les charges fixes restent inchangees, le resultat mensuel progresse de +12 450 EUR. L'allottement doit donc etre accepte hors periode de pleine capacite.\n\n3) En juin, le remplissage est de 100 % : accorder une chambre au voyagiste a 60 EUR oblige a renoncer a une vente individuelle a 120 EUR. Il faut alors integrer un cout d'opportunite. Marge perdue par chambre = (120 - 18,50) - (60 - 18,50) = 101,50 - 41,50 = 60 EUR de manque a gagner par chambre detournee. La decision s'inverse : en periode de saturation, l'allottement a tarif reduit detruit de la valeur et doit etre refuse pour ce mois.",
    "rubric": [
      {
        "label": "Q1 : rejet de l'argument du cout moyen et justification par le cout marginal/capacite disponible",
        "points": 6
      },
      {
        "label": "Q2 : marge sur cout variable 41,50 EUR/chambre et impact +12 450 EUR/mois",
        "points": 8
      },
      {
        "label": "Q3 : prise en compte du cout d'opportunite a 100 % et inversion motivee de la decision",
        "points": 6
      }
    ],
    "competencyIds": [
      "ca-yield"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-ecarts-1",
    "domainId": "compta-analytique",
    "type": "calculation",
    "title": "Décomposition de l'écart sur charges indirectes (atelier Finition, SARL Vanille)",
    "level": 4,
    "estimatedMinutes": 25,
    "statement": "Reprenez la SARL Vanille (production réelle 1 750 tables « Leslie » en octobre N). L'atelier « Finition » a pour unité d'œuvre l'heure de finition ; le standard est de 1,25 UO par table. Le budget mensuel préétabli du centre (activité normale 2 000 UO) comprend 64 000 € de charges variables et 48 000 € de charges fixes, soit un coût standard d'unité d'œuvre de 56 €. En octobre, le coût réel du centre s'élève à 124 320 € pour une activité réelle de 2 240 UO (coût réel de l'UO = 55,50 €). Travail à faire : 1) Calculer le coût variable standard unitaire et le coût budgété de l'activité réelle (budget flexible). 2) Calculer et qualifier l'écart sur rendement, l'écart sur budget et l'écart sur activité. 3) Vérifier que la somme des trois sous-écarts égale l'écart global du centre relatif à la production réelle.",
    "expectedAnswer": "1) Coût variable standard unitaire = 64 000 / 2 000 = 32 €/UO. Charges fixes prévues CFp = 48 000 €. Coût budgété de l'activité réelle CB = 32 x 2 240 + 48 000 = 71 680 + 48 000 = 119 680 €. Quantité préétablie d'UO pour la production réelle Qp* = 1,25 x 1 750 = 2 187,5 UO. 2) Écart sur rendement = (Qr - Qp*) x Cup = (2 240 - 2 187,5) x 56 = +2 940 € DÉFAVORABLE (on a consommé plus d'UO que le standard ne le prévoyait). Écart sur budget = (Qr x Cur) - CB = 124 320 - 119 680 = +4 640 € DÉFAVORABLE (prix des facteurs supérieur aux prévisions). Écart sur activité = CB - (Qr x Cup) = 119 680 - (2 240 x 56) = 119 680 - 125 440 = -5 760 € FAVORABLE (suractivité : meilleure absorption des charges fixes). 3) Somme = 2 940 + 4 640 - 5 760 = +1 820 € DÉFAVORABLE, ce qui correspond bien à l'écart global du centre : coût réel 124 320 - coût préétabli de la production réelle (2 187,5 x 56 = 122 500) = +1 820 €.",
    "rubric": [
      {
        "label": "Coût variable unitaire (32 €) et coût budgété CB (119 680 €) corrects",
        "points": 5
      },
      {
        "label": "Écart sur rendement correct, chiffré et qualifié (+2 940 € DÉF)",
        "points": 5
      },
      {
        "label": "Écart sur budget (+4 640 € DÉF) et écart sur activité (-5 760 € FAV) corrects et qualifiés",
        "points": 7
      },
      {
        "label": "Vérification : somme = écart global du centre (+1 820 € DÉF)",
        "points": 3
      }
    ],
    "competencyIds": [
      "ca-ecarts"
    ],
    "sourceChunkIds": []
  },
  {
    "id": "ex-ecarts-2",
    "domainId": "compta-analytique",
    "type": "mini-case",
    "title": "De l'écart sur résultat à l'écart sur marge sur coût préétabli (société Douglas)",
    "level": 4,
    "estimatedMinutes": 30,
    "statement": "La société Douglas vend des bouteilles d'encre indélébile. Pour juin N : ventes réelles 15 000 unités à 7,00 € (coût de revient réel 5,25 €/u) ; prévisions 17 000 unités à 6,50 € (coût de revient préétabli 5,20 €/u). Travail à faire : 1) Calculer l'écart total sur résultat et préciser son sens. 2) Décomposer cet écart en écart sur quantités vendues et écart sur marge unitaire (marge = prix - coût). 3) Décomposer l'écart sur marge unitaire en écart sur prix de vente unitaire et écart sur coût unitaire. 4) Calculer l'écart sur marge sur coût préétabli, expliquer en une phrase pourquoi cet indicateur isole mieux la performance commerciale que l'écart sur résultat, puis vérifier que cet écart diminué de l'écart sur coût unitaire redonne l'écart total sur résultat.",
    "expectedAnswer": "1) Résultat réel Rr = 15 000 x (7,00 - 5,25) = 26 250 € ; résultat prévu Rp = 17 000 x (6,50 - 5,20) = 22 100 €. Écart sur résultat = 26 250 - 22 100 = +4 150 € FAVORABLE (le résultat a progressé). 2) Mup = 6,50 - 5,20 = 1,30 € ; Mur = 7,00 - 5,25 = 1,75 €. Écart sur quantités vendues = (Qr - Qp) x Mup = (15 000 - 17 000) x 1,30 = -2 600 € DÉFAVORABLE. Écart sur marge unitaire = (Mur - Mup) x Qr = (1,75 - 1,30) x 15 000 = +6 750 € FAVORABLE. Vérification : -2 600 + 6 750 = +4 150 €. 3) Écart sur prix de vente unitaire = (Pur - Pup) x Qr = (7,00 - 6,50) x 15 000 = +7 500 € FAVORABLE ; écart sur coût unitaire = (Cur - Cup) x Qr = (5,25 - 5,20) x 15 000 = +750 € (coût en hausse, donc effet DÉFAVORABLE sur le résultat). Vérification : 7 500 - 750 = +6 750 €. 4) Marge réelle sur coût préétabli = (Pur - Cup) x Qr = (7,00 - 5,20) x 15 000 = 27 000 € ; marge prévue sur coût préétabli = (Pup - Cup) x Qp = (6,50 - 5,20) x 17 000 = 22 100 €. Écart sur marge sur coût préétabli = 27 000 - 22 100 = +4 900 € FAVORABLE. Il neutralise le coût réel (responsabilité des services d'approvisionnement et de production) et ne dépend que du prix de vente et des quantités, donc des seules variables commerciales. Vérification finale : 4 900 - 750 = +4 150 €, soit l'écart total sur résultat.",
    "rubric": [
      {
        "label": "Écart total sur résultat correct et qualifié favorable (+4 150 €)",
        "points": 4
      },
      {
        "label": "Décomposition quantités (-2 600 €) / marge unitaire (+6 750 €), puis prix de vente (+7 500 €) / coût unitaire (+750 €)",
        "points": 7
      },
      {
        "label": "Écart sur marge sur coût préétabli (+4 900 €) calculé et pertinence commerciale justifiée",
        "points": 6
      },
      {
        "label": "Vérification finale 4 900 - 750 = 4 150 €",
        "points": 3
      }
    ],
    "competencyIds": [
      "ca-ecarts"
    ],
    "sourceChunkIds": []
  }
];

export const comptaFlashcards: Flashcard[] = [
  {
    "id": "fc-operations-courantes-1",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-operations-courantes",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Les trois criteres d'une immobilisation selon le PCG ?",
    "back": "Un bien (1) controle, (2) destine a servir durablement (au-dela de l'exercice), (3) procurant des avantages economiques. Ni consomme au premier usage, ni destine a la revente.",
    "explanation": "Distingue immobilisation (classe 2) et charge (classe 6). Un bien loue ou en credit-bail n'est pas une immobilisation meme si controle.",
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les operations courantes - Fiche de cours",
        "sourceType": "course",
        "pageStart": 3,
        "pageEnd": 4,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-operations-courantes-2",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-operations-courantes",
    "domainId": "compta-generale",
    "type": "formula",
    "front": "Calcul du cout d'acquisition d'une immobilisation ?",
    "back": "Cout = Prix d'achat net HT (apres rabais, remises, ristournes, escomptes obtenus) + Couts directement attribuables (transport, installation, montage, essais).",
    "explanation": "Depenses non necessaires a la mise en etat de fonctionner et entretien courant exclus et passes en charges. Source : Fiche de cours, page 3.",
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les operations courantes - Fiche de cours",
        "sourceType": "course",
        "pageStart": 3,
        "pageEnd": 4,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-operations-courantes-3",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-operations-courantes",
    "domainId": "compta-generale",
    "type": "frequent-error",
    "front": "Des ramettes de papier figurent sur la facture d'un micro-ordinateur. Ou les comptabiliser ?",
    "back": "En charges, compte 606 (Achats non stockes). Les consommables ne sont pas des frais directement attribuables et ne s'integrent pas au cout de l'immobilisation.",
    "explanation": "Erreur classique : tout immobiliser car sur la meme facture. Isoler la part consommable. Idem pour le carburant a l'achat d'un vehicule.",
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les operations courantes - Fiche de cours",
        "sourceType": "course",
        "pageStart": 3,
        "pageEnd": 4,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-operations-courantes-4",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-operations-courantes",
    "domainId": "compta-generale",
    "type": "diagnostic",
    "front": "La TVA payee a l'achat d'un vehicule est-elle deductible ? Effet sur le cout ?",
    "back": "Tourisme : TVA NON deductible, integree au cout (2182 debite pour le TTC). Utilitaire (deux sieges avant), camionnette, camion : TVA deductible (44562).",
    "explanation": "La nature du vehicule change le montant immobilise. Point de controle systematique avant l'ecriture. Source : Fiche de cours, page 5.",
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les operations courantes - Fiche de cours",
        "sourceType": "course",
        "pageStart": 3,
        "pageEnd": 4,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-operations-courantes-5",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-operations-courantes",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Quels comptes pour l'acquisition a credit d'une immobilisation a TVA recuperable ?",
    "back": "Debit : compte d'immobilisation classe 2 (cout d'achat) + 44562 TVA deductible sur immobilisations. Credit : 404 Fournisseurs d'immobilisations (TTC).",
    "explanation": "Distinguer 404 (immobilisations) de 401 (exploitation), et 44562 (immobilisations) de 44566 (ABS). Source : Fiche de cours, page 3.",
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les operations courantes - Fiche de cours",
        "sourceType": "course",
        "pageStart": 3,
        "pageEnd": 4,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-travaux-cloture-1",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-travaux-cloture",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "À quel compte enregistre-t-on la variation de stock des BIENS ACHETÉS, et à quel compte celle des PRODUITS FABRIQUÉS ?",
    "back": "Biens achetés (marchandises, matières premières) : compte 603 — Variation des stocks (ex. 6031 MP, 6037 marchandises), qui est un compte de charges. Produits fabriqués et en-cours : compte 71 — Production stockée (ex. 71355 produits finis), qui est un compte de produits.",
    "explanation": "La distinction tient à la nature économique : déstocker des achats augmente les charges ; déstocker des produits diminue la production stockée (produit). C'est pourquoi 603 figure en charges et 71 en produits au compte de résultat.",
    "competencyIds": [
      "cg-cutoff"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les travaux de clôture - Fiche de cours",
        "sourceType": "course",
        "pageStart": 19,
        "pageEnd": 21,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-travaux-cloture-2",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-travaux-cloture",
    "domainId": "compta-generale",
    "type": "formula",
    "front": "Comment détermine-t-on s'il faut une dotation ou une reprise de dépréciation de stock par la méthode générale d'ajustement ?",
    "back": "On compare la dépréciation nécessaire sur le stock FINAL à la dépréciation constatée sur le stock INITIAL. Si dépréciation finale > initiale : dotation (débit 68173 / crédit 39) pour le complément. Si dépréciation finale < initiale : reprise (débit 39 / crédit 78173) pour la diminution.",
    "explanation": "On n'ajuste que la variation de la perte probable, pas le montant total. Ex. : dépréciation antérieure 1 235, nécessaire 950 → reprise de 285.",
    "competencyIds": [
      "cg-cutoff"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les travaux de clôture - Fiche de cours",
        "sourceType": "course",
        "pageStart": 19,
        "pageEnd": 21,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-travaux-cloture-3",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-travaux-cloture",
    "domainId": "compta-generale",
    "type": "diagnostic",
    "front": "À l'inventaire, la valeur actuelle d'un élément en stock est inférieure à sa valeur d'origine. Que doit-on faire et au nom de quel principe ?",
    "back": "Il faut constater une dépréciation du stock (débit 68173 Dotations aux dépréciations des stocks / crédit compte 39), en vertu du principe de prudence.",
    "explanation": "Le principe de prudence impose de constater toute perte probable (mévente, détérioration, chute de cours) mais interdit de comptabiliser un gain latent ; la valeur actuelle d'un stock est sa valeur vénale selon le prix du marché et les perspectives de vente.",
    "competencyIds": [
      "cg-cutoff"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les travaux de clôture - Fiche de cours",
        "sourceType": "course",
        "pageStart": 19,
        "pageEnd": 21,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-travaux-cloture-4",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-travaux-cloture",
    "domainId": "compta-generale",
    "type": "frequent-error",
    "front": "Vrai ou faux : on peut changer de méthode de valorisation des stocks (CUMP → PEPS) d'un exercice à l'autre pour présenter un bénéfice plus élevé.",
    "back": "Faux. Le principe de permanence des méthodes l'interdit : un changement n'est justifié que par un changement exceptionnel de situation de l'entreprise ou par une meilleure information (méthode préférentielle). Augmenter le bénéfice n'est pas un motif valable.",
    "explanation": "La permanence des méthodes garantit la comparabilité des comptes dans le temps ; sans elle, un analyste ne pourrait pas comparer les exercices.",
    "competencyIds": [
      "cg-cutoff"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les travaux de clôture - Fiche de cours",
        "sourceType": "course",
        "pageStart": 19,
        "pageEnd": 21,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-travaux-cloture-5",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-travaux-cloture",
    "domainId": "compta-generale",
    "type": "journal-entry",
    "front": "Stock de matières premières : stock initial brut 6 800 €, stock final brut 5 420 €. Passez les écritures de variation et donnez l'impact sur le résultat.",
    "back": "Annulation du SI : débit 6031 6 800 / crédit 310 6 800. Constatation du SF : débit 310 5 420 / crédit 6031 5 420. Solde du 6031 = 1 380 au débit : le stock a diminué, c'est une charge qui réduit le résultat de 1 380 €.",
    "explanation": "Pour les biens achetés, un déstockage (SF < SI) augmente les charges via le compte 6031, donc diminue le résultat ; un surstockage l'augmenterait (solde créditeur du 6031).",
    "competencyIds": [
      "cg-cutoff"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les travaux de clôture - Fiche de cours",
        "sourceType": "course",
        "pageStart": 19,
        "pageEnd": 21,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-titres-1",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-titres",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Quelles sont les quatre catégories comptables de titres du PCG et leur compte d'imputation principal ?",
    "back": "Titres de participation (261), TIAP - titres immobilisés de l'activité de portefeuille (273), autres titres immobilisés (271/272) et valeurs mobilières de placement - VMP (50, ex. 503 Actions, 506 Obligations).",
    "explanation": "Le critère est l'intention de détention et l'influence : conservation durable avec influence (≥ 10 % du capital) → participation ; conservation pour rentabilité sans intervention → TIAP ; détention durable subie hors deux premières catégories → autres titres immobilisés ; but spéculatif à moins d'un an → VMP.",
    "competencyIds": [
      "cg-titres"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les titres - Fiche de cours",
        "sourceType": "course",
        "pageStart": 5,
        "pageEnd": 6,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-titres-2",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-titres",
    "domainId": "compta-generale",
    "type": "formula",
    "front": "Comment se calcule la dépréciation d'un titre à l'inventaire, et que fait-on des plus-values latentes ?",
    "back": "Dépréciation = Valeur d'entrée − Valeur d'inventaire, uniquement lorsque ce résultat est positif (moins-value latente). Les plus-values latentes ne sont jamais comptabilisées.",
    "explanation": "Application du principe de prudence : on anticipe les pertes probables mais pas les gains non réalisés. La comparaison se fait titre par titre, sans compensation entre une moins-value sur un titre et une plus-value sur un autre.",
    "competencyIds": [
      "cg-titres"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les titres - Fiche de cours",
        "sourceType": "course",
        "pageStart": 5,
        "pageEnd": 6,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-titres-3",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-titres",
    "domainId": "compta-generale",
    "type": "frequent-error",
    "front": "Une dépréciation de titres passe de 3 000 € (N-1) à une dépréciation nécessaire de 2 000 € (N). Quelle écriture et pour quel montant ?",
    "back": "Une reprise de 1 000 € : débit 2961 (compte de dépréciation) / crédit 7866 Reprises sur dépréciations des éléments financiers, pour 1 000 € seulement.",
    "explanation": "On ajuste par différentiel et non sur le total. La dépréciation devant baisser de 3 000 à 2 000, on reprend l'excédent de 1 000 €. Une augmentation se serait traduite par une dotation au débit du compte 6866.",
    "competencyIds": [
      "cg-titres"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les titres - Fiche de cours",
        "sourceType": "course",
        "pageStart": 5,
        "pageEnd": 6,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-titres-4",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-titres",
    "domainId": "compta-generale",
    "type": "diagnostic",
    "front": "Pourquoi les obligations se comptabilisent-elles « au pied du coupon » à l'acquisition, et où passe l'intérêt couru payé au vendeur ?",
    "back": "Le coût d'acquisition ne comprend que le prix résultant de la cotation, hors intérêts courus. L'intérêt couru payé en plus est porté au débit d'un compte de produits financiers (762 ou 764), comme une avance sur le prochain coupon.",
    "explanation": "L'obligation est cotée en pourcentage du nominal et hors intérêts courus. Cette règle vaut aussi à l'inventaire et à la cession : le résultat de cession se calcule en comparant prix de cession et valeur d'acquisition tous deux au pied du coupon.",
    "competencyIds": [
      "cg-titres"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les titres - Fiche de cours",
        "sourceType": "course",
        "pageStart": 5,
        "pageEnd": 6,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-titres-5",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-titres",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Cession de titres : quels comptes utilise-t-on pour des titres de participation, et en quoi diffère la cession de VMP ?",
    "back": "Participation/autres titres immobilisés : deux écritures — produit de cession au crédit du 775 et sortie au débit du 675 (VCEAC) ; le résultat est exceptionnel. VMP : caractère financier, via le 667 (moins-value) ou le 767 (plus-value).",
    "explanation": "Les titres immobilisés se cèdent comme une immobilisation non amortissable (775 / 675). Les VMP, instruments de gestion de trésorerie, dégagent un résultat financier net enregistré directement en 667 ou 767.",
    "competencyIds": [
      "cg-titres"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les titres - Fiche de cours",
        "sourceType": "course",
        "pageStart": 5,
        "pageEnd": 6,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-emprunts-obligataires-1",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-emprunts-obligataires",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Pour quel montant la dette d'un emprunt obligataire est-elle inscrite au credit du compte 163 ?",
    "back": "Pour le prix de remboursement des obligations (nombre d'obligations x prix de remboursement), et non pour le nominal ni le prix d'emission.",
    "explanation": "Le PCG impose d'inscrire la dette au 163 a hauteur du prix de remboursement ; l'ecart avec le prix d'emission (debite au 4671) constitue la prime de remboursement portee au 169. C'est ce qui assure l'equilibre de l'ecriture de souscription.",
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les emprunts obligataires - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-emprunts-obligataires-2",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-emprunts-obligataires",
    "domainId": "compta-generale",
    "type": "formula",
    "front": "Comment calcule-t-on la prime de remboursement comptabilisee au compte 169 ?",
    "back": "Prime = (Prix de remboursement - Prix d'emission) x Nombre d'obligations.",
    "explanation": "Le PCG fusionne sous l'appellation prime de remboursement la prime d'emission negative et la prime de remboursement proprement dite ; on raisonne donc sur l'ecart prix de remboursement - prix d'emission, et non sur l'ecart au nominal. Ex. CSP : (1 006 - 996) x 8 000 = 80 000 EUR.",
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les emprunts obligataires - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-emprunts-obligataires-3",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-emprunts-obligataires",
    "domainId": "compta-generale",
    "type": "frequent-error",
    "front": "Vrai ou faux : la prime de remboursement est une charge a passer integralement en resultat l'annee de l'emission.",
    "back": "Faux. Elle est etalee sur la duree de l'emprunt par des dotations aux amortissements (compte 6861).",
    "explanation": "La prime est une charge financiere repartie sur plusieurs exercices. La duree d'amortissement est obligatoirement la duree de l'emprunt, selon l'une des deux methodes du PCG : prorata des interets courus ou fractions egales au prorata de la duree.",
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les emprunts obligataires - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-emprunts-obligataires-4",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-emprunts-obligataires",
    "domainId": "compta-generale",
    "type": "diagnostic",
    "front": "A l'inventaire, quel compte enregistre les interets courus non echus d'un emprunt obligataire, et ou figure-t-il au bilan ?",
    "back": "Le compte 16883 (Interets courus sur autres emprunts obligataires) ; il est regroupe au bilan dans le meme poste que le principal de la dette (compte 163).",
    "explanation": "L'ecriture d'interets courus (debit charges d'interets, credit 16883) rattache la charge a l'exercice par prorata temporis depuis la date de jouissance, puis est contrepassee a la reouverture des comptes au 01/01/N+1.",
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les emprunts obligataires - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-emprunts-obligataires-5",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-emprunts-obligataires",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Ou figurent au bilan les frais d'emission d'emprunt non encore amortis lorsque l'entreprise a choisi de les etaler ?",
    "back": "A l'actif, sous la rubrique Charges a repartir sur plusieurs exercices ; c'est le seul cas de charges a repartir qui subsiste dans le PCG.",
    "explanation": "En cas d'etalement, les frais (compte 6272) sont vires au 4816 par le credit du 791, puis amortis directement (debit 6812, credit 4816). Par permanence des methodes, l'option d'etalement s'applique alors a tous les emprunts obligataires emis.",
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les emprunts obligataires - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-constitution-entreprises-1",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-constitution-entreprises",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Quels types d'apports forment le capital social d'une societe, et lequel en est exclu ?",
    "back": "Les apports en numeraire et en nature forment le capital social. Les apports en industrie (connaissances techniques ou professionnelles) en sont exclus : ils donnent droit a une part du benefice mais ne comptent pas dans le capital. Ils sont interdits dans les SA.",
    "explanation": "Le capital represente l'engagement valorisable et liberable des associes. L'industrie n'etant ni cessible ni saisissable, elle ne peut garantir les tiers et reste hors capital.",
    "competencyIds": [
      "cg-constitution"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "La constitution des entreprises - Fiches de cours",
        "sourceType": "course",
        "pageStart": 2,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-constitution-entreprises-2",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-constitution-entreprises",
    "domainId": "compta-generale",
    "type": "formula",
    "front": "Quelle fraction des apports en numeraire doit etre liberee a la constitution en SA et en SARL ?",
    "back": "SA (et SAS) : au moins 1/2 (50 %) des apports en numeraire. SARL : au moins 20 %. Dans les deux cas, le solde est appele dans un delai maximal de 5 ans. Les apports en nature, eux, sont toujours liberes a 100 %.",
    "explanation": "La loi distingue la liberation du numeraire (fractionnable) de celle de la nature (integrale), car un bien apporte se transfere en une seule fois alors que le numeraire peut etre verse par appels successifs.",
    "competencyIds": [
      "cg-constitution"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "La constitution des entreprises - Fiches de cours",
        "sourceType": "course",
        "pageStart": 2,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-constitution-entreprises-3",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-constitution-entreprises",
    "domainId": "compta-generale",
    "type": "diagnostic",
    "front": "A l'issue de la constitution d'une SA, le compte 109 presente un solde debiteur de 15 000 €. Que represente-t-il et ou figure-t-il au bilan ?",
    "back": "Le compte 109 'Actionnaires : capital souscrit non appele' represente la fraction du capital numeraire promise mais non encore appelee (creance non exigible sur les actionnaires). Il figure en tete de l'actif, avant les immobilisations, en regard du poste 'Capital social' au passif.",
    "explanation": "Cas Les Delices du Perigord : numeraire 30 000 libere a 1/2, donc 15 000 non appeles. Le placer en tete d'actif met en parallele la creance et le capital affiche au passif.",
    "competencyIds": [
      "cg-constitution"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "La constitution des entreprises - Fiches de cours",
        "sourceType": "course",
        "pageStart": 2,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-constitution-entreprises-4",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-constitution-entreprises",
    "domainId": "compta-generale",
    "type": "frequent-error",
    "front": "Vrai ou faux : on peut liberer partiellement un apport en nature comme un apport en numeraire.",
    "back": "Faux. Les apports en nature doivent etre integralement liberes des la constitution, quelle que soit la forme juridique de la societe. Seuls les apports en numeraire peuvent etre liberes par fractions.",
    "explanation": "Le transfert de propriete d'un bien s'opere en une seule fois ; la liberation fractionnee (1/2 SA, 20 % SARL) ne concerne que l'argent.",
    "competencyIds": [
      "cg-constitution"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "La constitution des entreprises - Fiches de cours",
        "sourceType": "course",
        "pageStart": 2,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-constitution-entreprises-5",
    "moduleId": "module-compta-fondations",
    "conceptId": "concept-constitution-entreprises",
    "domainId": "compta-generale",
    "type": "journal-entry",
    "front": "Lors de la souscription du capital d'une SARL, quels comptes mouvemente-t-on pour la fraction immediatement appelee ?",
    "back": "On debite le compte 4561 'Associes - Comptes d'apport en societes' (creance sur les associes) par le credit du compte 1012 'Capital souscrit - appele, non verse'. La fraction differee, elle, est portee au debit du 109 par le credit du 1011.",
    "explanation": "La souscription enregistre la promesse d'apport : 4561 materialise la creance de la societe sur ses associes, soldee ensuite lors de la realisation effective des apports.",
    "competencyIds": [
      "cg-constitution"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "La constitution des entreprises - Fiches de cours",
        "sourceType": "course",
        "pageStart": 2,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-variations-capital-1",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-variations-capital",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Quels sont les quatre types d'augmentation de capital et quel organe les décide ?",
    "back": "Apports en numéraire, apports en nature, incorporation de réserves, conversion de dettes. La décision relève de l'AGE des actionnaires, car l'opération modifie les statuts.",
    "explanation": "Chaque modalité répond à un objectif distinct (financer un investissement, garantir les tiers, réduire l'endettement). Comme les statuts sont modifiés, seule l'AGE est compétente, avec dépôt au greffe et publication légale.",
    "competencyIds": [
      "cg-variations-capital"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les variations du capital des sociétés - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-variations-capital-2",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-variations-capital",
    "domainId": "compta-generale",
    "type": "formula",
    "front": "Comment calcule-t-on la prime d'émission et le nombre d'actions nouvelles à créer en numéraire ?",
    "back": "Prime d'émission = (Prix d'émission - Valeur nominale) x Nombre d'actions nouvelles. Nombre d'actions à créer = Montant des apports / Prix d'émission d'une action.",
    "explanation": "La prime représente l'excédent du prix d'émission sur le nominal ; elle s'apparente aux réserves accumulées par les anciens actionnaires et reste facultative (émission au pair si prime nulle).",
    "competencyIds": [
      "cg-variations-capital"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les variations du capital des sociétés - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-variations-capital-3",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-variations-capital",
    "domainId": "compta-generale",
    "type": "diagnostic",
    "front": "À la souscription d'une augmentation en numéraire, quelle part des apports doit être libérée au minimum ?",
    "back": "La prime d'émission en totalité et au minimum le quart du nominal des actions nouvelles. Le solde du nominal doit être versé dans un délai maximal de cinq ans.",
    "explanation": "Erreur classique : n'encaisser que le quart en oubliant la prime. La prime est toujours appelée et versée intégralement dès la souscription ; seul le nominal peut être appelé par fractions.",
    "competencyIds": [
      "cg-variations-capital"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les variations du capital des sociétés - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-variations-capital-4",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-variations-capital",
    "domainId": "compta-generale",
    "type": "frequent-error",
    "front": "Amortissement du capital et réduction de capital : quelle différence essentielle ?",
    "back": "L'amortissement rembourse aux actionnaires une partie de la valeur nominale par prélèvement sur réserves ou bénéfices distribuables, sans modifier le montant du capital. La réduction diminue effectivement le compte 101.",
    "explanation": "À l'amortissement, le capital reste inchangé et l'on subdivise le compte 1013 en 10131 Capital non amorti et 10132 Capital amorti ; les actions amorties deviennent des actions de jouissance.",
    "competencyIds": [
      "cg-variations-capital"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les variations du capital des sociétés - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-variations-capital-5",
    "moduleId": "module-compta-approfondie",
    "conceptId": "concept-variations-capital",
    "domainId": "compta-generale",
    "type": "concept",
    "front": "Quelle écriture comptabilise une augmentation de capital par conversion de dettes ?",
    "back": "On débite le compte de dette concerné (fournisseur, banque, compte courant d'associé) par le crédit du 1013 Capital souscrit appelé versé pour le nominal et du 1041 Primes d'émission pour la prime.",
    "explanation": "La conversion est assimilée à une augmentation en numéraire : les anciens actionnaires renoncent à leur DS, la dette convertie doit être liquide et exigible, et le nombre d'actions émises = créance convertie / prix d'émission.",
    "competencyIds": [
      "cg-variations-capital"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Les variations du capital des sociétés - Fiche de cours",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 3,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-methode-abc-1",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-methode-abc",
    "domainId": "compta-analytique",
    "type": "concept",
    "front": "En methode ABC, par quoi transitent les charges indirectes avant d'etre imputees aux produits ?",
    "back": "Par les activites, chacune mesuree par un inducteur de cout representatif de son volume.",
    "explanation": "L'ABC remplace la cle d'imputation globale unique par une imputation activite par activite, ce qui affine la repartition et tient compte de l'heterogeneite des activites (cas FONEA : 6 activites identifiees au lieu d'un seul critere, le CA).",
    "competencyIds": [
      "ca-abc"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance introduction",
        "sourceType": "course",
        "pageStart": 10,
        "pageEnd": 13,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-methode-abc-2",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-methode-abc",
    "domainId": "compta-analytique",
    "type": "formula",
    "front": "Comment calcule-t-on le cout unitaire d'un inducteur ?",
    "back": "Cout de l'inducteur = ressources consommees par l'activite / nombre total d'inducteurs.",
    "explanation": "Exemple FONEA : activite Prospection commerciale 69 000 EUR pour 690 contacts, soit 100 EUR par contact. Ce cout sert ensuite a imputer les charges indirectes a chaque prestation selon le nombre d'inducteurs qu'elle consomme.",
    "competencyIds": [
      "ca-abc"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance introduction",
        "sourceType": "course",
        "pageStart": 10,
        "pageEnd": 13,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-methode-abc-3",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-methode-abc",
    "domainId": "compta-analytique",
    "type": "frequent-error",
    "front": "Pourquoi une repartition des charges indirectes au seul prorata du chiffre d'affaires est-elle risquee ?",
    "back": "Parce qu'elle peut faire qu'une prestation en subventionne une autre, en surestimant le cout de l'une et en sous-estimant celui de l'autre.",
    "explanation": "Chez FONEA, la cle CA rendait Certification acheteur non profitable et masquait que Manager des achats etait subventionnee : l'ABC inverse le diagnostic (6,91 % contre 1,93 %).",
    "competencyIds": [
      "ca-abc"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance introduction",
        "sourceType": "course",
        "pageStart": 10,
        "pageEnd": 13,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-methode-abc-4",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-methode-abc",
    "domainId": "compta-analytique",
    "type": "diagnostic",
    "front": "Citez un interet et une limite majeurs de la methode ABC d'apres le cas FONEA.",
    "back": "Interet : repartition des charges indirectes beaucoup plus fine, adaptee aux prestations de services personnalisees. Limite : modele plus complexe et lourd, exigeant un systeme d'information adapte et l'adhesion du personnel.",
    "explanation": "Plus le nombre d'activites est eleve, plus le modele est lourd a gerer ; s'il est trop faible, on reintroduit de l'heterogeneite dans le cout des activites. La methode requiert de recueillir de nombreuses donnees (nb de jours, de contacts...).",
    "competencyIds": [
      "ca-abc"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance introduction",
        "sourceType": "course",
        "pageStart": 10,
        "pageEnd": 13,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-methode-abc-5",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-methode-abc",
    "domainId": "compta-analytique",
    "type": "concept",
    "front": "Que represente le taux de profitabilite d'une prestation et comment se calcule-t-il ?",
    "back": "Il mesure la part du chiffre d'affaires qui se transforme en resultat analytique : taux = resultat analytique / chiffre d'affaires.",
    "explanation": "FONEA Certification acheteur : resultat 15 200 EUR / CA 220 000 EUR = 6,91 %. C'est l'indicateur chiffre qui permet de comparer la performance des deux formations et d'eclairer la decision de maintien.",
    "competencyIds": [
      "ca-abc"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance introduction",
        "sourceType": "course",
        "pageStart": 10,
        "pageEnd": 13,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-cout-cible-1",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-cout-cible",
    "domainId": "compta-analytique",
    "type": "formula",
    "front": "Quelle est l'équation fondamentale qui définit le coût cible ?",
    "back": "Coût cible = Prix de vente imposé par le marché - Profit cible.",
    "explanation": "Elle inverse l'équation traditionnelle 'Prix = Coût + Marge' issue de la vision ingénieur. Dans la vision marketing, le prix est une donnée du marché et le coût devient la variable d'action à atteindre.",
    "competencyIds": [
      "ca-cout-cible"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance méthode du coût cible",
        "sourceType": "course",
        "pageStart": 4,
        "pageEnd": 8,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-cout-cible-2",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-cout-cible",
    "domainId": "compta-analytique",
    "type": "concept",
    "front": "Pourquoi la méthode du coût cible insiste-t-elle sur la phase de conception ?",
    "back": "Parce qu'environ 80 % des coûts du cycle de vie sont pré-engagés dès le lancement de la première unité en fabrication, même s'ils ne seront dépensés que plus tard.",
    "explanation": "Une fois la production lancée, on ne peut plus optimiser que les ~20 % de coûts opérationnels restants. C'est donc en amont, à la conception, que se joue l'essentiel de la profitabilité future du produit.",
    "competencyIds": [
      "ca-cout-cible"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance méthode du coût cible",
        "sourceType": "course",
        "pageStart": 4,
        "pageEnd": 8,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-cout-cible-3",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-cout-cible",
    "domainId": "compta-analytique",
    "type": "diagnostic",
    "front": "Le coût estimé d'un composant est INFÉRIEUR à son coût cible. Que faut-il en conclure ?",
    "back": "Situation a priori favorable : pas de réduction nécessaire. L'entreprise doit se demander si elle ne pourrait pas améliorer/enrichir le composant pour mieux satisfaire le client.",
    "explanation": "Le composant coûte moins que la valeur que le client lui attribue. Le risque n'est pas le surcoût mais une sous-qualité au regard des attentes ; on raisonne en rapport valeur-coût, pas en seule réduction.",
    "competencyIds": [
      "ca-cout-cible"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance méthode du coût cible",
        "sourceType": "course",
        "pageStart": 4,
        "pageEnd": 8,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-cout-cible-4",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-cout-cible",
    "domainId": "compta-analytique",
    "type": "frequent-error",
    "front": "Sur quelle base décompose-t-on le coût cible global entre les composants ?",
    "back": "Sur l'importance relative accordée par le client aux fonctions (valeur perçue), et non au prorata des coûts techniques estimés.",
    "explanation": "Répartir au prorata du coût estimé reproduirait la logique ingénieur et annulerait l'intérêt de la méthode. C'est l'écart entre valeur perçue et coût technique qui guide ensuite l'optimisation.",
    "competencyIds": [
      "ca-cout-cible"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance méthode du coût cible",
        "sourceType": "course",
        "pageStart": 4,
        "pageEnd": 8,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-cout-cible-5",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-cout-cible",
    "domainId": "compta-analytique",
    "type": "concept",
    "front": "Quelle technique utilise-t-on en phase de conception pour rapprocher le coût estimé du coût cible sans dégrader la valeur ?",
    "back": "L'analyse de la valeur, qui s'appuie sur une analyse fonctionnelle (recenser, classer, hiérarchiser et valoriser les fonctions du produit).",
    "explanation": "L'objectif est la qualité optimale, pas la qualité maximale : on élimine les tâches inutiles et on adapte le produit aux besoins réels du consommateur, en optimisant le rapport valeur/coût.",
    "competencyIds": [
      "ca-cout-cible"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance méthode du coût cible",
        "sourceType": "course",
        "pageStart": 4,
        "pageEnd": 8,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-yield-management-1",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-yield-management",
    "domainId": "compta-analytique",
    "type": "concept",
    "front": "Pourquoi une capacite de service non utilisee a l'instant t est-elle perdue ?",
    "back": "Parce que les services sont perissables et non stockables : contrairement a un bien materiel, le resultat d'une prestation non consommee a une date donnee ne peut etre reporte ni stocke.",
    "explanation": "C'est le fondement meme du management des capacites : un siege vide au decollage ou une chambre vide la nuit represente un manque a gagner irrecuperable, ce qui justifie de remplir au prix marginal plutot que de laisser vide.",
    "competencyIds": [
      "ca-yield"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance yield management",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 7,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-yield-management-2",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-yield-management",
    "domainId": "compta-analytique",
    "type": "formula",
    "front": "Quelle est la formule du RevPAR et sa decomposition ?",
    "back": "RevPAR = Chiffre d'affaires / Nombre de chambres disponibles = Prix moyen x Taux d'occupation.",
    "explanation": "Le denominateur retient les chambres DISPONIBLES (proposees a la vente), pas seulement vendues. La decomposition montre que le rendement provient simultanement du prix et de l'occupation, jamais d'une cause unique.",
    "competencyIds": [
      "ca-yield"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance yield management",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 7,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-yield-management-3",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-yield-management",
    "domainId": "compta-analytique",
    "type": "diagnostic",
    "front": "Un hotel affiche un RevPAR en hausse. Peut-on conclure que sa sante s'ameliore ?",
    "back": "Non. Une hausse du prix moyen peut masquer une chute du taux d'occupation (et inversement). Il faut decomposer le RevPAR en prix moyen ET taux d'occupation avant de conclure.",
    "explanation": "L'article de la revue l'hotellerie qualifie le RevPAR seul d'ecran de fumee : un hotel qui perd des clients mais releve ses prix peut afficher un RevPAR flatteur cachant une erosion de la frequentation.",
    "competencyIds": [
      "ca-yield"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance yield management",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 7,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-yield-management-4",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-yield-management",
    "domainId": "compta-analytique",
    "type": "frequent-error",
    "front": "Sur quel cout faut-il raisonner pour accepter une commande supplementaire a tarif reduit, quand la capacite est disponible ?",
    "back": "Sur le cout marginal (assimile au cout variable unitaire), pas sur le cout complet moyen : tant que le prix couvre le cout variable, la vente degage une marge qui ameliore le resultat, les charges fixes etant deja engagees.",
    "explanation": "Condition imperative : qu'il reste de la capacite et qu'aucune charge fixe additionnelle ne soit engagee. En periode de pleine capacite, il faut ajouter le cout d'opportunite de la vente evincee.",
    "competencyIds": [
      "ca-yield"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance yield management",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 7,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-yield-management-5",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-yield-management",
    "domainId": "compta-analytique",
    "type": "concept",
    "front": "Citez les trois principes operationnels du yield management.",
    "back": "1) Mettre en place une tarification differenciee par segments (avec barrieres d'etancheite). 2) Controler la structure de la demande via des contingents tarifaires (nombre de places affecte a chaque tarif). 3) Gerer dynamiquement ces contingents en revisant les quotas en temps reel selon la montee en charge des reservations.",
    "explanation": "Le principe 3 explique qu'en cas de remplissage insuffisant, des places a bas tarif peuvent etre reouvertes ; et qu'en cas de remplissage rapide, on bascule vers les tarifs superieurs. Le surbooking (vendre plus que la capacite reelle) decoule de la gestion des non-presentations.",
    "competencyIds": [
      "ca-yield"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance yield management",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 7,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-ecarts-1",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-ecarts",
    "domainId": "compta-analytique",
    "type": "formula",
    "front": "Comment décompose-t-on l'écart total sur coût, et quelle composante analyse-t-on réellement ?",
    "back": "Écart total = écart sur volume de production [(Vr - Vp) x Cup] + écart global relatif à la production réelle [(Cur - Cup) x Vr]. Seul le second est pertinent à analyser.",
    "explanation": "L'écart sur volume ne traduit qu'une différence du nombre d'unités produites, sans dysfonctionnement d'exploitation. L'écart relatif à la production réelle compare réel et préétabli sur la même base (Vr) et révèle les performances internes. Chez Vanille : +22 050 € (volume) + 6 030 € (production réelle) = +28 080 €.",
    "competencyIds": [
      "ca-ecarts"
    ],
    "status": "due",
    "dueAt": "2026-06-15T08:00:00.000Z",
    "intervalDays": 3,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance Les écarts sur coûts",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 12,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-ecarts-2",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-ecarts",
    "domainId": "compta-analytique",
    "type": "concept",
    "front": "Pour un écart sur charges directes, à quel coût valorise-t-on l'écart sur quantité, et pourquoi ?",
    "back": "Au coût unitaire standard (préétabli) : écart sur quantité = (Qr - Qp*) x Cup. L'écart sur prix, lui, s'applique aux quantités réelles : (Cur - Cup) x Qr.",
    "explanation": "Le responsable de la consommation physique (rendement, déchets, rebuts) n'a aucune prise sur les prix négociés par l'acheteur ; on neutralise donc l'effet prix en valorisant la quantité au standard. L'écart sur quantité est interne/physique, l'écart sur prix est externe/monétaire.",
    "competencyIds": [
      "ca-ecarts"
    ],
    "status": "learning",
    "dueAt": "2026-06-16T08:00:00.000Z",
    "intervalDays": 1,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance Les écarts sur coûts",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 12,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-ecarts-3",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-ecarts",
    "domainId": "compta-analytique",
    "type": "frequent-error",
    "front": "Vrai ou faux : un écart positif est toujours défavorable.",
    "back": "Faux. Sur les coûts, un écart positif (réel > prévu) est défavorable ; sur le chiffre d'affaires et le résultat, un écart positif est favorable (le sens du signe s'inverse).",
    "explanation": "La convention de calcul reste identique (réel - prévu), mais l'interprétation diffère : dépenser plus que prévu nuit (coûts), tandis que vendre ou gagner plus que prévu profite (CA, résultat).",
    "competencyIds": [
      "ca-ecarts"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance Les écarts sur coûts",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 12,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-ecarts-4",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-ecarts",
    "domainId": "compta-analytique",
    "type": "formula",
    "front": "Quelles sont les trois composantes de l'écart relatif à la production réelle d'un centre de charges indirectes ?",
    "back": "Écart sur rendement = (Qr - Qp*) x Cup ; écart sur budget = (Qr x Cur) - CB ; écart sur activité = CB - (Qr x Cup), avec CB = CVup x Qr + CFp. Rendement + budget + activité = écart total du centre.",
    "explanation": "Le mélange de charges variables et fixes impose de distinguer l'effet quantité d'UO (rendement), l'effet prix des facteurs (budget) et l'effet de sur/sous-absorption des charges fixes (activité). L'écart sur coût d'UO = budget + activité.",
    "competencyIds": [
      "ca-ecarts"
    ],
    "status": "new",
    "dueAt": "2026-06-18T08:00:00.000Z",
    "intervalDays": 0,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance Les écarts sur coûts",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 12,
        "effectiveDate": "2025-09-01"
      }
    ]
  },
  {
    "id": "fc-ecarts-5",
    "moduleId": "module-pilotage-performance",
    "conceptId": "concept-ecarts",
    "domainId": "compta-analytique",
    "type": "diagnostic",
    "front": "Pourquoi l'écart sur marge sur coût préétabli mesure-t-il mieux la performance commerciale que l'écart sur résultat ?",
    "back": "Parce qu'il valorise la marge avec le coût unitaire préétabli (Pur - Cup), neutralisant ainsi l'effet du coût réel ; il ne dépend que du prix de vente et des quantités vendues, donc des seules variables maîtrisées par les commerciaux.",
    "explanation": "Le coût réel relève des services d'approvisionnement et de production. Chez Douglas : écart sur marge sur coût préétabli = (7 - 5,20) x 15 000 - (6,50 - 5,20) x 17 000 = 27 000 - 22 100 = +4 900 €, et 4 900 - 750 (écart sur coût unitaire) = 4 150 € (écart total sur résultat).",
    "competencyIds": [
      "ca-ecarts"
    ],
    "status": "mastered",
    "dueAt": "2026-07-08T08:00:00.000Z",
    "intervalDays": 21,
    "sourceReferences": [
      {
        "pack": "compta-master",
        "document": "Pilotage et performance Les écarts sur coûts",
        "sourceType": "course",
        "pageStart": 1,
        "pageEnd": 12,
        "effectiveDate": "2025-09-01"
      }
    ]
  }
];

export const comptaModules: LearningModule[] = [
  {
    "id": "module-compta-fondations",
    "title": "Comptabilité générale — fondations",
    "domainId": "compta-generale",
    "tier": "fondations",
    "description": "Opérations courantes, constitution des sociétés et travaux de clôture : poser les automatismes d'enregistrement et de régularisation.",
    "objective": "Qualifier une opération, passer l'écriture et justifier le rattachement à la période.",
    "prerequisites": [
      "Débit/crédit",
      "Plan de comptes",
      "TVA collectée/déductible"
    ],
    "competencyIds": [
      "cg-operations-courantes",
      "cg-cutoff",
      "cg-constitution"
    ],
    "conceptIds": [
      "concept-operations-courantes",
      "concept-travaux-cloture",
      "concept-constitution-entreprises"
    ],
    "lessonIds": [
      "lesson-operations-courantes",
      "lesson-travaux-cloture",
      "lesson-constitution-entreprises"
    ],
    "exerciseIds": [
      "ex-operations-courantes-1",
      "ex-operations-courantes-2",
      "ex-travaux-cloture-1",
      "ex-travaux-cloture-2",
      "ex-constitution-entreprises-1",
      "ex-constitution-entreprises-2"
    ],
    "flashcardIds": [
      "fc-operations-courantes-1",
      "fc-operations-courantes-2",
      "fc-operations-courantes-3",
      "fc-operations-courantes-4",
      "fc-operations-courantes-5",
      "fc-travaux-cloture-1",
      "fc-travaux-cloture-2",
      "fc-travaux-cloture-3",
      "fc-travaux-cloture-4",
      "fc-travaux-cloture-5",
      "fc-constitution-entreprises-1",
      "fc-constitution-entreprises-2",
      "fc-constitution-entreprises-3",
      "fc-constitution-entreprises-4",
      "fc-constitution-entreprises-5"
    ],
    "estimatedMinutes": 150,
    "status": "in-progress",
    "progress": 20,
    "nextAction": "Terminer la révision due puis le cas de clôture."
  },
  {
    "id": "module-compta-approfondie",
    "title": "Comptabilité approfondie — financements et capital",
    "domainId": "compta-generale",
    "tier": "maitrise",
    "description": "Titres, emprunts obligataires et variations du capital : traiter les opérations de haut de bilan.",
    "objective": "Comptabiliser et évaluer les opérations de financement et de capital.",
    "prerequisites": [
      "Module fondations",
      "Notion d'actualisation",
      "Capitaux propres"
    ],
    "competencyIds": [
      "cg-titres",
      "cg-emprunts-obligataires",
      "cg-variations-capital"
    ],
    "conceptIds": [
      "concept-titres",
      "concept-emprunts-obligataires",
      "concept-variations-capital"
    ],
    "lessonIds": [
      "lesson-titres",
      "lesson-emprunts-obligataires",
      "lesson-variations-capital"
    ],
    "exerciseIds": [
      "ex-titres-1",
      "ex-titres-2",
      "ex-emprunts-obligataires-1",
      "ex-emprunts-obligataires-2",
      "ex-variations-capital-1",
      "ex-variations-capital-2"
    ],
    "flashcardIds": [
      "fc-titres-1",
      "fc-titres-2",
      "fc-titres-3",
      "fc-titres-4",
      "fc-titres-5",
      "fc-emprunts-obligataires-1",
      "fc-emprunts-obligataires-2",
      "fc-emprunts-obligataires-3",
      "fc-emprunts-obligataires-4",
      "fc-emprunts-obligataires-5",
      "fc-variations-capital-1",
      "fc-variations-capital-2",
      "fc-variations-capital-3",
      "fc-variations-capital-4",
      "fc-variations-capital-5"
    ],
    "estimatedMinutes": 170,
    "status": "in-progress",
    "progress": 20,
    "nextAction": "Débloquer après les fondations."
  },
  {
    "id": "module-pilotage-performance",
    "title": "Pilotage de la performance (analytique)",
    "domainId": "compta-analytique",
    "tier": "application",
    "description": "Méthode ABC, coût cible, yield management et analyse des écarts pour piloter la performance.",
    "objective": "Choisir et appliquer la bonne méthode de coût puis interpréter les écarts.",
    "prerequisites": [
      "Charges directes/indirectes",
      "Marge sur coût variable"
    ],
    "competencyIds": [
      "ca-abc",
      "ca-cout-cible",
      "ca-yield",
      "ca-ecarts"
    ],
    "conceptIds": [
      "concept-methode-abc",
      "concept-cout-cible",
      "concept-yield-management",
      "concept-ecarts"
    ],
    "lessonIds": [
      "lesson-methode-abc",
      "lesson-cout-cible",
      "lesson-yield-management",
      "lesson-ecarts"
    ],
    "exerciseIds": [
      "ex-methode-abc-1",
      "ex-methode-abc-2",
      "ex-cout-cible-1",
      "ex-cout-cible-2",
      "ex-yield-management-1",
      "ex-yield-management-2",
      "ex-ecarts-1",
      "ex-ecarts-2"
    ],
    "flashcardIds": [
      "fc-methode-abc-1",
      "fc-methode-abc-2",
      "fc-methode-abc-3",
      "fc-methode-abc-4",
      "fc-methode-abc-5",
      "fc-cout-cible-1",
      "fc-cout-cible-2",
      "fc-cout-cible-3",
      "fc-cout-cible-4",
      "fc-cout-cible-5",
      "fc-yield-management-1",
      "fc-yield-management-2",
      "fc-yield-management-3",
      "fc-yield-management-4",
      "fc-yield-management-5",
      "fc-ecarts-1",
      "fc-ecarts-2",
      "fc-ecarts-3",
      "fc-ecarts-4",
      "fc-ecarts-5"
    ],
    "estimatedMinutes": 215,
    "status": "not-started",
    "progress": 20,
    "nextAction": "Comparer ABC et coût cible sur un cas."
  }
];

export const comptaLearningDays: LearningDay[] = [
  {
    "day": 1,
    "title": "Les opérations courantes",
    "domainId": "compta-generale",
    "competencyIds": [
      "cg-operations-courantes"
    ],
    "lessonId": "lesson-operations-courantes",
    "exerciseId": "ex-operations-courantes-1",
    "minutes": 45,
    "status": "done"
  },
  {
    "day": 2,
    "title": "La constitution des sociétés",
    "domainId": "compta-generale",
    "competencyIds": [
      "cg-constitution"
    ],
    "lessonId": "lesson-constitution-entreprises",
    "exerciseId": "ex-constitution-entreprises-1",
    "minutes": 50,
    "status": "done"
  },
  {
    "day": 3,
    "title": "Les travaux de clôture",
    "domainId": "compta-generale",
    "competencyIds": [
      "cg-cutoff"
    ],
    "lessonId": "lesson-travaux-cloture",
    "exerciseId": "ex-travaux-cloture-1",
    "minutes": 55,
    "status": "today"
  },
  {
    "day": 4,
    "title": "La méthode ABC",
    "domainId": "compta-analytique",
    "competencyIds": [
      "ca-abc"
    ],
    "lessonId": "lesson-methode-abc",
    "exerciseId": "ex-methode-abc-1",
    "minutes": 55,
    "status": "next"
  },
  {
    "day": 5,
    "title": "La comptabilisation des titres",
    "domainId": "compta-generale",
    "competencyIds": [
      "cg-titres"
    ],
    "lessonId": "lesson-titres",
    "exerciseId": "ex-titres-1",
    "minutes": 55,
    "status": "next"
  },
  {
    "day": 6,
    "title": "La méthode du coût cible",
    "domainId": "compta-analytique",
    "competencyIds": [
      "ca-cout-cible"
    ],
    "lessonId": "lesson-cout-cible",
    "exerciseId": "ex-cout-cible-1",
    "minutes": 50,
    "status": "next"
  },
  {
    "day": 7,
    "title": "Les emprunts obligataires",
    "domainId": "compta-generale",
    "competencyIds": [
      "cg-emprunts-obligataires"
    ],
    "lessonId": "lesson-emprunts-obligataires",
    "exerciseId": "ex-emprunts-obligataires-1",
    "minutes": 55,
    "status": "locked"
  },
  {
    "day": 8,
    "title": "Les variations du capital",
    "domainId": "compta-generale",
    "competencyIds": [
      "cg-variations-capital"
    ],
    "lessonId": "lesson-variations-capital",
    "exerciseId": "ex-variations-capital-1",
    "minutes": 60,
    "status": "locked"
  },
  {
    "day": 9,
    "title": "Yield management et capacités",
    "domainId": "compta-analytique",
    "competencyIds": [
      "ca-yield"
    ],
    "lessonId": "lesson-yield-management",
    "exerciseId": "ex-yield-management-1",
    "minutes": 55,
    "status": "locked"
  },
  {
    "day": 10,
    "title": "Les écarts sur coûts et sur CA",
    "domainId": "compta-analytique",
    "competencyIds": [
      "ca-ecarts"
    ],
    "lessonId": "lesson-ecarts",
    "exerciseId": "ex-ecarts-1",
    "minutes": 55,
    "status": "locked"
  }
];
