import { comptaGeneraleV1ExerciseVersions } from "./compta-generale-v1";
import { excelLabExerciseVersions } from "./excel-lab";
import { assertValidEvaluationSpec, type EvaluationType } from "./evaluators";
import { exercises } from "./learning";

/**
 * Authored evaluation specifications, one per migrated exercise.
 *
 * These are what the previous grader lacked. `RubricItem` is `{ label, points }`
 * and `Exercise.expectedAnswer` is prose, so the old engine derived its
 * expectations from the criterion's own wording — which is why quoting the
 * criterion scored full marks and a correct answer in other words scored zero.
 *
 * Migration is per exercise. An exercise absent from this list keeps the previous
 * grader behind `legacy_rubric` and behaves exactly as before.
 */

export interface AuthoredExerciseVersion {
  id: string;
  exerciseId: string;
  version: number;
  evaluationType: EvaluationType;
  spec: unknown;
  /** Golden cases: the author's own statement of how this must grade. */
  testCases: Array<{
    name: string;
    submission: unknown;
    expectedScore: number;
    /** Optional per-criterion outcomes, keyed by criterion id. */
    expectedOutcomes?: Record<string, "met" | "partial" | "missed">;
  }>;
}

export const authoredExerciseVersions: AuthoredExerciseVersion[] = [
  {
    id: "exv-ias37-comparison-1",
    exerciseId: "ex-ias37-comparison",
    version: 1,
    evaluationType: "short_text_rubric",
    spec: {
      criteria: [
        {
          id: "criteres",
          label: "Critères IAS 37",
          points: 7,
          anyOf: ["ias 37", "obligation actuelle", "critere", "criteres", "conditions de comptabilisation"],
          errorKind: "accounting-treatment",
          hint: "Nommer les critères de comptabilisation retenus par IAS 37."
        },
        {
          id: "documentation",
          label: "Degré de documentation",
          points: 4,
          anyOf: ["documentation", "documente", "justificatif", "piece justificative"],
          errorKind: "source-quality",
          hint: "Préciser le niveau de documentation exigé."
        },
        {
          id: "estimation",
          label: "Meilleure estimation",
          points: 5,
          anyOf: ["meilleure estimation", "estimation", "valeur attendue"],
          errorKind: "reasoning",
          hint: "Expliquer comment la meilleure estimation est retenue."
        },
        {
          id: "annexe",
          label: "Traitement en annexe",
          points: 4,
          anyOf: ["annexe", "passif eventuel", "information en annexe"],
          errorKind: "accounting-treatment",
          hint: "Indiquer le traitement lorsque les critères ne sont pas satisfaits."
        }
      ]
    },
    testCases: [
      {
        // The seeded model answer. The previous grader scored it 3/20.
        name: "reponse-modele",
        submission: {
          kind: "text",
          text:
            "La note doit comparer les critères, le degré de documentation, la meilleure estimation, " +
            "et le traitement annexe si les critères ne sont pas satisfaits."
        },
        expectedScore: 20
      },
      {
        name: "hors-sujet",
        submission: { kind: "text", text: "Le chiffre d'affaires progresse et la trésorerie reste stable." },
        expectedScore: 0
      }
    ]
  },
  {
    id: "exv-ecriture-provision-simple-1",
    exerciseId: "ex-ecriture-provision-simple",
    version: 1,
    evaluationType: "journal_entry",
    spec: {
      expectedLines: [
        { account: "6815", debit: 14000, label: "Dotation aux provisions d'exploitation" },
        { account: "1511", credit: 14000, label: "Provision pour risques et charges" }
      ]
    },
    testCases: [
      {
        name: "ecriture-exacte",
        submission: {
          kind: "journal",
          lines: [
            { account: "6815", debit: 14000 },
            { account: "1511", credit: 14000 }
          ]
        },
        expectedScore: 20
      },
      {
        // The previous grader scored this 20/20 — higher than the correct entry.
        name: "sens-inverse",
        submission: {
          kind: "journal",
          lines: [
            { account: "6815", credit: 14000 },
            { account: "1511", debit: 14000 }
          ]
        },
        // Accounts and balance still stand; direction and amounts do not, because
        // a magnitude posted to the wrong side is not a correct amount.
        expectedScore: 9.23,
        expectedOutcomes: { accounts: "met", direction: "missed", amounts: "missed", balance: "met" }
      }
    ]
  },
  {
    id: "exv-provision-qcm-conditions-1",
    exerciseId: "ex-provision-qcm-conditions",
    version: 1,
    evaluationType: "multiple_choice",
    spec: {
      label: "Conditions de comptabilisation d'une provision",
      options: [
        { id: "obligation", label: "Obligation actuelle résultant d'un événement passé" },
        { id: "sortie", label: "Sortie probable de ressources" },
        { id: "estimation", label: "Estimation fiable du montant" },
        {
          id: "paiement",
          label: "Paiement déjà effectué",
          rationale: "Un paiement déjà effectué éteint l'obligation : il n'y a plus rien à provisionner."
        }
      ],
      correctOptionIds: ["obligation", "sortie", "estimation"]
    },
    testCases: [
      {
        name: "trois-conditions",
        submission: { kind: "choice", selectedOptionIds: ["obligation", "sortie", "estimation"] },
        expectedScore: 20
      },
      {
        // Previously full marks: the old rubric only sought the substrings
        // "exclusion" and "paiement" anywhere in the prose.
        name: "retient-le-distracteur",
        submission: { kind: "choice", selectedOptionIds: ["obligation", "sortie", "paiement"] },
        // Zero, not a partial mark: the penalty is measured against the number of
        // distractors, and this question has exactly one. Choosing the excluded
        // criterion is the misconception the item is built to detect, so it
        // cancels the two correct picks.
        expectedScore: 0
      },
      {
        name: "coche-tout",
        submission: {
          kind: "choice",
          selectedOptionIds: ["obligation", "sortie", "estimation", "paiement"]
        },
        expectedScore: 0
      }
    ]
  },
  {
    id: "exv-provision-calcul-fourchette-1",
    exerciseId: "ex-provision-calcul-fourchette",
    version: 1,
    evaluationType: "numeric",
    spec: {
      expected: 14000,
      toleranceAbs: 1,
      unit: "EUR",
      label: "Point central de la fourchette"
    },
    testCases: [
      { name: "valeur-exacte", submission: { kind: "numeric", value: 14000 }, expectedScore: 20 },
      {
        // The previous grader gave 20/20 for 13 000 as readily as for 14 000.
        name: "valeur-fausse",
        submission: { kind: "numeric", value: 13000 },
        expectedScore: 0
      }
    ]
  },
  // The comptabilité générale v1 module (PR-05). Unlike the exercises migrated
  // one at a time above, every exercise of that module ships a specification, so
  // nothing in it falls back to the rubric matcher.
  ...comptaGeneraleV1ExerciseVersions,
  // The Excel Finance Lab (PR-06): every exercise graded by the `spreadsheet`
  // evaluator, value and formula checked separately.
  ...excelLabExerciseVersions
];

export class UnknownAuthoredExerciseError extends Error {
  constructor(exerciseId: string) {
    super(`Authored version references unknown exercise "${exerciseId}".`);
    this.name = "UnknownAuthoredExerciseError";
  }
}

/**
 * Validation boundary for authored content. Run by the seed and by the tests, so
 * a malformed specification fails where it is written rather than when a learner
 * submits an answer to it.
 */
export function assertValidAuthoredVersions(versions = authoredExerciseVersions): void {
  const knownExercises = new Set(exercises.map((exercise) => exercise.id));
  const seenIds = new Set<string>();
  const seenExerciseVersions = new Set<string>();

  for (const version of versions) {
    if (seenIds.has(version.id)) {
      throw new Error(`Duplicate exercise version id "${version.id}".`);
    }

    seenIds.add(version.id);

    if (!knownExercises.has(version.exerciseId)) {
      throw new UnknownAuthoredExerciseError(version.exerciseId);
    }

    const key = `${version.exerciseId}@${version.version}`;

    if (seenExerciseVersions.has(key)) {
      throw new Error(`Duplicate version ${version.version} for exercise "${version.exerciseId}".`);
    }

    seenExerciseVersions.add(key);
    assertValidEvaluationSpec(version.evaluationType, version.spec);

    if (version.testCases.length === 0) {
      // A migrated exercise with no golden case can be silently re-marked by a
      // later spec edit. Requiring one makes that impossible.
      throw new Error(`Exercise version "${version.id}" ships no test case.`);
    }
  }
}
