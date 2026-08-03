import { describe, expect, it } from "vitest";
import {
  VELOCITE_BALANCE_AVANT_INVENTAIRE,
  VELOCITE_CLIENTS_NET,
  VELOCITE_MOUVEMENTS_INVENTAIRE,
  VELOCITE_RESULTAT,
  VELOCITE_TOTAL_BILAN,
  VELOCITE_TRIAL_BALANCE_TOTAL,
  activeCurriculum,
  buildBalanceSheet,
  buildClosingLedger,
  buildControlSheet,
  buildIncomeStatement,
  clientCycleLeadSchedule,
  comptaArreteAnnuelCase,
  comptaCaseStudies,
  comptaClotureMensuelleCase,
  comptaGeneraleClotureExercises,
  comptaGeneraleClotureExerciseVersions,
  comptaGeneraleClotureLevelByExercise,
  comptaGeneraleClotureSources,
  comptaGeneraleV1MiniCase,
  comptaGeneraleV1Sources,
  evaluateTrack,
  getAttemptEvidenceKinds,
  getModuleLevelForExercise,
  getPublishedTrackLevels,
  isBalanced,
  resolveSourceReference,
  trialBalanceTotals,
  velociteInventoryEntries,
  type MasteryEvent
} from "../src";
import { COMPTA_GENERALE_V1_TRACK } from "../src/compta-generale-v1";

describe("le dossier de la SARL Vélo Cité", () => {
  it("la balance après inventaire est équilibrée au total publié", () => {
    const totals = trialBalanceTotals();

    expect(totals.balanced).toBe(true);
    expect(totals.totalDebit).toBe(VELOCITE_TRIAL_BALANCE_TOTAL);
  });

  it("le compte de résultat et le bilan racontent le même résultat", () => {
    const income = buildIncomeStatement();
    const sheet = buildBalanceSheet();

    expect(income.resultat).toBe(VELOCITE_RESULTAT);
    expect(sheet.resultat).toBe(VELOCITE_RESULTAT);
    expect(sheet.totalActif).toBe(VELOCITE_TOTAL_BILAN);
    expect(sheet.totalPassif).toBe(VELOCITE_TOTAL_BILAN);
    expect(sheet.balanced).toBe(true);
  });

  it("la feuille maîtresse clients agrège au montant que l'énoncé N4 cite", () => {
    expect(clientCycleLeadSchedule().net).toBe(VELOCITE_CLIENTS_NET);
  });

  it("chaque écriture d'inventaire du dossier est équilibrée", () => {
    for (const entry of velociteInventoryEntries) {
      expect(isBalanced(entry.lines, 0), entry.id).toBe(true);
    }
  });

  it("les mouvements d'inventaire relient balance avant et après", () => {
    const debits = velociteInventoryEntries
      .flatMap((entry) => entry.lines)
      .reduce((sum, line) => sum + (line.debit ?? 0), 0);

    expect(debits).toBe(VELOCITE_MOUVEMENTS_INVENTAIRE);
    expect(VELOCITE_BALANCE_AVANT_INVENTAIRE + debits).toBe(VELOCITE_TRIAL_BALANCE_TOTAL);
  });

  it("le grand livre rejoue l'inventaire : comptes d'inventaire ouverts à zéro", () => {
    const ledger = buildClosingLedger();
    const byAccount = new Map(ledger.map((account) => [account.account, account]));

    // Les comptes créés par l'inventaire n'existent pas avant lui.
    for (const account of ["486", "487", "408", "416", "418", "491", "1511", "397", "6811", "6815", "6037"]) {
      expect(byAccount.get(account)?.openingBalance, account).toBe(0);
    }

    // Le stock ouvre au stock initial de l'énoncé de variation.
    expect(byAccount.get("37")?.openingBalance).toBe(6800);
  });

  it("la feuille de contrôle est entièrement verte sur le dossier publié", () => {
    for (const check of buildControlSheet()) {
      expect(check.passed, check.label).toBe(true);
    }
  });

  it("la feuille de contrôle détecte une balance faussée", () => {
    const corrupted = buildControlSheet([
      { account: "512", label: "Banque", debit: 100 },
      { account: "101", label: "Capital", credit: 90 }
    ]);
    const balanceCheck = corrupted.find((check) => check.id === "balance-equilibree");

    expect(balanceCheck?.passed).toBe(false);
  });
});

describe("niveaux 3 et 4", () => {
  it("le track publie quatre niveaux et chaque nouvel exercice appartient au sien", () => {
    const levels = getPublishedTrackLevels(activeCurriculum, COMPTA_GENERALE_V1_TRACK);

    expect(levels.map((level) => level.level)).toEqual([1, 2, 3, 4]);

    for (const exercise of comptaGeneraleClotureExercises) {
      const levelId = comptaGeneraleClotureLevelByExercise[exercise.id];

      expect(levelId, exercise.id).toBe(
        exercise.level === 3 ? "level-compta-generale-v1-3" : "level-compta-generale-v1-4"
      );
      // Le registre des modules — celui que lit la soumission — donne la même
      // réponse : la page, le niveau et l'API ne peuvent pas diverger.
      expect(getModuleLevelForExercise(exercise.id), exercise.id).toBe(levelId);
    }
  });

  it("chaque exercice N3/N4 possède une spécification typée avec cas dorés", () => {
    const byExercise = new Map(
      comptaGeneraleClotureExerciseVersions.map((version) => [version.exerciseId, version])
    );

    for (const exercise of comptaGeneraleClotureExercises) {
      const version = byExercise.get(exercise.id);

      expect(version, exercise.id).toBeDefined();
      expect(version?.evaluationType, exercise.id).not.toBe("legacy_rubric");
      expect(version?.testCases.length ?? 0, exercise.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("un énoncé numérique ne contient jamais sa propre réponse", () => {
    for (const version of comptaGeneraleClotureExerciseVersions) {
      if (version.evaluationType !== "numeric") {
        continue;
      }

      const exercise = comptaGeneraleClotureExercises.find(
        (candidate) => candidate.id === version.exerciseId
      );
      const expected = (version.spec as { expected: number }).expected;
      const rendered = expected.toLocaleString("fr-FR");

      expect(exercise?.statement.includes(rendered), `${version.exerciseId} → ${rendered}`).toBe(false);
    }
  });

  it("se débloque dans l'ordre : N3 après N2, N4 après N3", () => {
    const levels = getPublishedTrackLevels(activeCurriculum, COMPTA_GENERALE_V1_TRACK).map(
      (level) => ({
        levelId: level.id,
        criticalCompetencies: level.criticalCompetencyIds.map((competencyId) => ({
          competencyId,
          strength: 80
        }))
      })
    );
    const rules = activeCurriculum.rules;

    const eventsFor = (levelId: string): MasteryEvent[] =>
      (["direct", "retention", "caseStudy", "explanation", "finalDiagnostic"] as const).map(
        (kind, index) => ({
          levelId,
          kind,
          scorePercent: 85,
          occurredAt: `2026-08-0${index + 1}T00:00:00.000Z`
        })
      );

    // N1 et N2 acquis, N3 travaillé au-dessus du seuil : N3 passe, N4 reste
    // fermé tant que N3 n'est pas acquis d'un point de vue du gating séquentiel.
    const beforeN3 = evaluateTrack(
      levels,
      {
        events: [...eventsFor("level-compta-generale-v1-3")],
        acquiredLevelIds: ["level-compta-generale-v1-1", "level-compta-generale-v1-2"]
      },
      rules
    );

    expect(beforeN3.map((snapshot) => snapshot.status)).toEqual([
      "passed",
      "passed",
      "passed",
      "available"
    ]);

    // Le même travail fourni sur N4 une fois N3 acquis : toute la verticale passe.
    const afterN4 = evaluateTrack(
      levels,
      {
        events: [...eventsFor("level-compta-generale-v1-3"), ...eventsFor("level-compta-generale-v1-4")],
        acquiredLevelIds: [
          "level-compta-generale-v1-1",
          "level-compta-generale-v1-2",
          "level-compta-generale-v1-3"
        ]
      },
      rules
    );

    expect(afterN4.map((snapshot) => snapshot.status)).toEqual(["passed", "passed", "passed", "passed"]);

    // Sans N2, N3 reste verrouillé quel que soit le score.
    const gated = evaluateTrack(
      levels,
      {
        events: eventsFor("level-compta-generale-v1-3"),
        acquiredLevelIds: ["level-compta-generale-v1-1"]
      },
      rules
    );

    expect(gated[2]?.status).toBe("locked");
    expect(gated[3]?.status).toBe("locked");
  });
});

describe("case studies", () => {
  it("chaque étape référence un exercice du bon niveau et une pièce du dossier", () => {
    for (const caseStudy of comptaCaseStudies) {
      const documentIds = new Set(caseStudy.documents.map((document) => document.id));

      expect(caseStudy.steps.length).toBeGreaterThanOrEqual(5);

      for (const step of caseStudy.steps) {
        expect(documentIds.has(step.documentId), `${caseStudy.id} → ${step.documentId}`).toBe(true);
        expect(
          comptaGeneraleClotureLevelByExercise[step.exerciseId],
          `${caseStudy.id} → ${step.exerciseId}`
        ).toBe(caseStudy.levelId);
      }
    }
  });

  it("la dernière étape de chaque cas clôt le diagnostic du niveau", () => {
    for (const caseStudy of comptaCaseStudies) {
      const lastStep = caseStudy.steps.at(-1);

      expect(lastStep).toBeDefined();

      const kinds = getAttemptEvidenceKinds({
        exerciseId: lastStep?.exerciseId ?? "",
        levelId: caseStudy.levelId,
        context: "case_study"
      });

      expect(kinds, caseStudy.id).toContain("caseStudy");
      expect(kinds, caseStudy.id).toContain("finalDiagnostic");
    }
  });

  it("une étape intermédiaire fournit une preuve caseStudy, jamais le diagnostic", () => {
    const step = comptaClotureMensuelleCase.steps[0];
    const kinds = getAttemptEvidenceKinds({
      exerciseId: step.exerciseId,
      levelId: comptaClotureMensuelleCase.levelId,
      context: "case_study"
    });

    expect(kinds).toContain("caseStudy");
    expect(kinds).not.toContain("finalDiagnostic");
  });

  it("le contexte case_study ne se réclame pas depuis un exercice hors cas", () => {
    const kinds = getAttemptEvidenceKinds({
      exerciseId: "ex-cgv1-pca",
      levelId: "level-compta-generale-v1-3",
      context: "case_study"
    });

    expect(kinds).toContain("direct");
    expect(kinds).not.toContain("caseStudy");
  });
});

describe("sources", () => {
  it("chaque référence du module résout vers un asset seedé, pages comprises", () => {
    const references = [
      ...comptaGeneraleV1Sources,
      ...comptaGeneraleClotureSources,
      ...comptaGeneraleV1MiniCase.sourceReferences,
      ...comptaClotureMensuelleCase.sourceReferences,
      ...comptaArreteAnnuelCase.sourceReferences
    ];

    expect(references.length).toBeGreaterThan(0);

    for (const reference of references) {
      const resolved = resolveSourceReference(reference);

      expect(resolved, `${reference.pack} :: ${reference.document}`).not.toBeNull();
    }
  });

  it("refuse une page hors pagination ou un référentiel inconnu", () => {
    expect(
      resolveSourceReference({
        pack: "pcg-anc-2026",
        document: "Plan comptable général — comptes et fonctionnement",
        pageStart: 130,
        pageEnd: 200
      })
    ).toBeNull();

    expect(
      resolveSourceReference({ pack: "pack-invente", document: "Norme imaginaire" })
    ).toBeNull();
  });

  it("chaque type de source reste identifiable (cours, référence, note)", () => {
    const types = new Set(comptaGeneraleClotureSources.map((source) => source.sourceType));

    expect(types.has("course")).toBe(true);
    expect(types.has("official-reference")).toBe(true);
    expect(types.has("personal-note")).toBe(true);
  });
});
