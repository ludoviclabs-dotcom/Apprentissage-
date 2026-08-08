import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { listDrafts, writeDraft } from "../store/draft-store";
import type { ContentDraft, ContentPayload } from "../types/artifact";
import type { NormativeContext } from "../types/normative-context";
import { checkNormativeContext, classifyNormativeContext } from "../validation/normative";
import { versionedAccount } from "../validation/normative-accounts";
import { draftsRoot, fail, parseCommonOptions, repoRoot, resolveContext, UsageError } from "./shared";

/**
 * `pnpm content:classify-normative --chapter "Emprunts obligataires"`
 *
 * Classe les brouillons d'un chapitre selon le référentiel que leurs comptes
 * désignent, et rend un rapport.
 *
 * ELLE NE RÉÉCRIT AUCUNE RÉPONSE ATTENDUE. C'est la propriété qui rend la
 * commande sûre à lancer, et elle est structurelle : le contenu (`draft.content`)
 * n'est jamais touché, ni en mode rapport, ni en mode `--apply`. Remplacer 791
 * par 481 dans une écriture changerait son nombre de lignes, ses montants et son
 * barème — ce serait réécrire l'exercice, pas le classer. Ce travail se fait à
 * la main et se relit.
 *
 * PAR DÉFAUT ELLE N'ÉCRIT QUE LE RAPPORT. `--apply` pose en plus le contexte
 * normatif proposé sur chaque brouillon et ajuste le statut ; il conserve
 * l'état antérieur de chaque brouillon dans un dossier de reprise avant de
 * toucher quoi que ce soit, et n'ouvre jamais un contenu approuvé — seule une
 * action humaine peut sortir un contenu de cet état.
 */

const REPORT_PATH = join("data", "generated", "review", "emprunts-normative-migration-report.json");
const BACKUP_DIR = join("data", "generated", "checkpoints", "normative-pre-apply");

interface ReportEntry {
  artifactId: string;
  contentType: string;
  title: string;
  status: string;
  /** Les comptes versionnés rencontrés, champs typés et prose confondus. */
  accountsFound: string[];
  /** Ceux qui viennent d'une ligne d'écriture ou d'une liste de comptes requis. */
  accountsInAnswer: string[];
  currentProfile: string | null;
  proposedProfile: string;
  proposedScoringPolicy: string;
  proposedDisclosures: NormativeContext["customAccountDisclosures"];
  conflict: string[];
  actionRequired: string;
  risk: "faible" | "moyen" | "eleve";
}

function resolvePath(candidate: string): string {
  return isAbsolute(candidate) ? candidate : join(repoRoot, candidate);
}

function payloadOf(draft: ContentDraft): ContentPayload {
  return { contentType: draft.contentType, content: draft.content } as ContentPayload;
}

/**
 * Ce qu'il faut faire du contenu, et à quel point c'est urgent.
 *
 * Les trois niveaux ne mesurent pas la gravité de l'erreur mais le risque
 * *pour l'apprenant* : un contenu noté sur un traitement remplacé corrigerait
 * une bonne réponse en faux, ce qui est le pire cas ; un sous-compte non
 * déclaré induit en erreur sans corriger de travers ; un contenu qui n'emploie
 * aucun compte versionné ne risque rien.
 */
function assess(
  draft: ContentDraft,
  classification: ReturnType<typeof classifyNormativeContext>,
  accountsInAnswer: readonly string[]
): { actionRequired: string; risk: ReportEntry["risk"] } {
  if (classification.ambiguous) {
    return {
      actionRequired:
        "Arbitrage humain : le contenu mélange deux traitements ou emploie un compte officiel non sourcé. Réécriture à la main, puis relecture.",
      risk: "eleve"
    };
  }

  const legacyInAnswer = accountsInAnswer.filter(
    (accountNumber) => versionedAccount(accountNumber)?.kind === "legacy"
  );

  if (legacyInAnswer.length > 0) {
    return {
      actionRequired: `Réponse attendue fondée sur ${legacyInAnswer.join(", ")} : classer en « support d'origine » (comparaison seule), ou réécrire l'attendu selon le plan 2026. Ne pas noter en l'état.`,
      risk: "eleve"
    };
  }

  if (classification.customSubdivisions.length > 0) {
    return {
      actionRequired: `Déclarer ${classification.customSubdivisions.join(", ")} comme sous-compte(s) et indiquer le compte parent officiel.`,
      risk: "moyen"
    };
  }

  if (classification.accountsFound.length === 0) {
    return {
      actionRequired: "Aucun compte versionné : poser le référentiel courant sans autre reprise.",
      risk: "faible"
    };
  }

  return {
    actionRequired: draft.normativeContext
      ? "Référentiel déjà déclaré : vérifier qu'il correspond aux comptes employés."
      : "Poser le référentiel courant.",
    risk: "faible"
  };
}

/**
 * Le contexte que le classement propose.
 *
 * Les notes de divergence sont écrites ici plutôt que laissées au relecteur :
 * c'est le classement qui a constaté l'écart, et le lui faire redécouvrir en
 * relisant les numéros de compte serait lui demander de refaire le travail.
 */
function proposedContext(
  classification: ReturnType<typeof classifyNormativeContext>
): NormativeContext {
  const legacy = classification.legacyAccounts;

  return {
    profile: classification.proposedProfile,
    status:
      classification.proposedProfile === "anc-2026-current"
        ? "current"
        : classification.proposedProfile === "course-original"
          ? "legacy"
          : "custom",
    effectiveFrom: classification.proposedProfile === "anc-2026-current" ? "2026-01-01" : undefined,
    effectiveTo: classification.proposedProfile === "course-original" ? "2025-12-31" : undefined,
    scoringPolicy: classification.proposedScoringPolicy,
    sourceVersionIds: [],
    supersededByProfile:
      classification.proposedProfile === "course-original" ? "anc-2026-current" : undefined,
    customAccountDisclosures: classification.proposedDisclosures,
    versionConflictNotes: legacy.map((accountNumber) => {
      const account = versionedAccount(accountNumber);

      return {
        code: "compte-remplace",
        severity: "warning" as const,
        message:
          `Le compte ${accountNumber} (${account?.label ?? "sans libellé"}) relève du traitement du support d'origine` +
          `${account?.supersededBy ? `, remplacé par ${account.supersededBy} au 1er janvier 2026` : ""}.`,
        sourceIds: []
      };
    })
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const options = parseCommonOptions(argv.filter((flag) => flag !== "--apply"));
  const { chapter } = await resolveContext(options);

  const storeOptions = {
    rootDir: draftsRoot(options),
    packId: options.sourcePack,
    chapterSlug: chapter.chapterSlug
  };

  const drafts = await listDrafts(storeOptions);

  if (drafts.length === 0) {
    throw new UsageError(
      `Aucun brouillon pour « ${chapter.chapterLabel} » : rien à classer. Lancer d'abord pnpm content:generate.`
    );
  }

  const entries: ReportEntry[] = [];
  const now = new Date().toISOString();
  let applied = 0;
  let untouched = 0;

  for (const draft of drafts) {
    const payload = payloadOf(draft);
    const classification = classifyNormativeContext(payload);
    const context = proposedContext(classification);

    // Le contrôle est rejoué *avec* le contexte proposé : c'est la seule façon
    // de dire si la proposition suffit, ou si le contenu reste en défaut une
    // fois classé — auquel cas il demande une reprise, pas un classement.
    const withProposal = checkNormativeContext({ payload, normativeContext: context });
    const accountsInAnswer = [
      ...new Set(
        withProposal.occurrences
          .filter((occurrence) => occurrence.structured)
          .map((occurrence) => occurrence.accountNumber)
      )
    ].sort();

    const assessment = assess(draft, classification, accountsInAnswer);
    const conflict = [
      ...classification.reasons.slice(1),
      ...withProposal.errors.map((problem) => `${problem.code} : ${problem.message}`)
    ];

    entries.push({
      artifactId: draft.id,
      contentType: draft.contentType,
      title: draft.title,
      status: draft.status,
      accountsFound: classification.accountsFound,
      accountsInAnswer,
      currentProfile: draft.normativeContext?.profile ?? null,
      proposedProfile: classification.proposedProfile,
      proposedScoringPolicy: classification.proposedScoringPolicy,
      proposedDisclosures: classification.proposedDisclosures,
      conflict,
      actionRequired: assessment.actionRequired,
      risk: assessment.risk
    });

    if (!apply) {
      continue;
    }

    if (draft.status === "approved") {
      // Un contenu approuvé porte une signature humaine. Le reclasser d'office
      // reviendrait à modifier ce qui a été signé sans que personne le sache.
      untouched += 1;
      continue;
    }

    const backupPath = join(resolvePath(BACKUP_DIR), `${draft.id}.json`);
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

    const blocked = withProposal.errors.length > 0 || classification.ambiguous;

    await writeDraft(storeOptions, {
      ...draft,
      normativeContext: context,
      // Le contenu reste intact : seuls le référentiel, le statut et la trace
      // changent. `content` n'apparaît nulle part dans cette écriture.
      status: blocked ? "validation_failed" : "needs_review",
      reviewMetadata: { ...draft.reviewMetadata, revision: draft.reviewMetadata.revision + 1 },
      history: [
        ...draft.history,
        {
          fromStatus: draft.status,
          toStatus: blocked ? "validation_failed" : "needs_review",
          occurredAt: now,
          actor: "cli:classify-normative",
          comment: `Référentiel proposé : ${classification.proposedProfile} (${classification.proposedScoringPolicy}). ${assessment.actionRequired}`.slice(
            0,
            2000
          )
        }
      ],
      updatedAt: now
    } as ContentDraft);

    applied += 1;
  }

  const report = {
    generatedAt: now,
    chapter: chapter.chapterLabel,
    chapterSlug: chapter.chapterSlug,
    mode: apply ? "apply" : "report-only",
    contentCount: entries.length,
    counts: {
      byProposedProfile: entries.reduce<Record<string, number>>((tally, entry) => {
        tally[entry.proposedProfile] = (tally[entry.proposedProfile] ?? 0) + 1;
        return tally;
      }, {}),
      byRisk: entries.reduce<Record<string, number>>((tally, entry) => {
        tally[entry.risk] = (tally[entry.risk] ?? 0) + 1;
        return tally;
      }, {}),
      withConflict: entries.filter((entry) => entry.conflict.length > 0).length
    },
    entries
  };

  const reportPath = resolvePath(REPORT_PATH);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`\n${entries.length} contenu(s) classé(s) pour « ${chapter.chapterLabel} ».`);
  console.log(`Profils proposés : ${JSON.stringify(report.counts.byProposedProfile)}`);
  console.log(`Risque : ${JSON.stringify(report.counts.byRisk)}`);
  console.log(`Contenus en conflit : ${report.counts.withConflict}`);
  console.log(`Rapport : ${REPORT_PATH}`);

  if (apply) {
    console.log(`Brouillons mis à jour : ${applied} · approuvés laissés intacts : ${untouched}`);
    console.log(`État antérieur conservé sous : ${BACKUP_DIR}`);
  } else {
    console.log("Aucun brouillon modifié. Relancer avec --apply pour poser les référentiels proposés.");
  }
}

main().catch(fail);
