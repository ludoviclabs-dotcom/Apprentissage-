import { advanceAfterValidation, listDrafts, writeDraft } from "../store/draft-store";
import type { ContentDraft, ContentPayload } from "../types/artifact";
import { toValidationMetadata, validateContent } from "../validation/engine";
import { draftsRoot, fail, parseCommonOptions, resolveContext, UsageError } from "./shared";

/**
 * `pnpm content:validate-generated --chapter "Emprunts obligataires"`
 *
 * Rejoue les contrôles déterministes sur les brouillons déjà produits, et met à
 * jour leur statut. Un contenu approuvé n'est jamais rétrogradé par cette
 * commande : seule une action humaine peut le sortir de son état.
 */

async function main(): Promise<void> {
  const options = parseCommonOptions(process.argv.slice(2));
  const { corpus, chapter } = await resolveContext(options);

  const storeOptions = {
    rootDir: draftsRoot(options),
    packId: options.sourcePack,
    chapterSlug: chapter.chapterSlug
  };

  const drafts = await listDrafts(storeOptions);

  if (drafts.length === 0) {
    console.log(`Aucun brouillon pour « ${chapter.chapterLabel} ». Lancer d'abord pnpm content:generate.`);
    return;
  }

  const siblings: ContentPayload[] = [];
  let passed = 0;
  let failed = 0;
  let unchanged = 0;
  let totalWarnings = 0;

  for (const draft of drafts) {
    const payload = { contentType: draft.contentType, content: draft.content } as ContentPayload;
    const result = validateContent({
      payload,
      corpus: corpus.index,
      siblings,
      normativeContext: draft.normativeContext
    });
    const timestamp = new Date().toISOString();
    totalWarnings += result.warnings.length;

    if (result.passed) {
      passed += 1;
      siblings.push(payload);
    } else {
      failed += 1;
    }

    if (draft.status === "approved") {
      // Un approuvé est signalé s'il ne passe plus, mais son statut ne bouge pas :
      // seule une action humaine peut le rouvrir.
      unchanged += 1;

      if (!result.passed) {
        console.log(
          `  ⚠ ${draft.title} est approuvé mais ne passe plus les contrôles — ${result.blockingReasons[0] ?? ""}`
        );
      }

      continue;
    }

    if (draft.status === "rejected") {
      // Un rejet reste un rejet tant qu'il n'est pas repris explicitement.
      unchanged += 1;
      continue;
    }

    // Le statut suit la validation en n'empruntant que des transitions légales ;
    // la commande n'écrit jamais un statut de sa propre autorité.
    const refreshed = {
      ...draft,
      validationMetadata: toValidationMetadata(result, timestamp),
      updatedAt: timestamp
    } as ContentDraft;

    const advanced = advanceAfterValidation(
      refreshed,
      result.passed,
      timestamp,
      "cli:validate-generated",
      result.passed ? undefined : result.blockingReasons.slice(0, 3).join(" | ").slice(0, 2000)
    );

    if (advanced.status === draft.status) {
      unchanged += 1;
    }

    await writeDraft(storeOptions, advanced);
  }

  console.log(`Chapitre            : ${chapter.chapterLabel}`);
  console.log(`Brouillons contrôlés: ${drafts.length}`);
  console.log(`Contrôles passés    : ${passed}`);
  console.log(`Contrôles échoués   : ${failed}`);
  console.log(`Statuts inchangés   : ${unchanged}`);
  console.log(`Avertissements      : ${totalWarnings}`);

  if (options.verbose) {
    console.log("");
    for (const draft of await listDrafts(storeOptions)) {
      console.log(`[${draft.status}] ${draft.contentType} — ${draft.title}`);
      for (const issue of draft.validationMetadata?.errors ?? []) {
        console.log(`    ✖ ${issue.code}${issue.path ? ` (${issue.path})` : ""} : ${issue.message}`);
      }
      for (const issue of draft.validationMetadata?.warnings ?? []) {
        console.log(`    ⚠ ${issue.code}${issue.path ? ` (${issue.path})` : ""} : ${issue.message}`);
      }
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  if (error instanceof UsageError) {
    console.error(`\n✖ ${error.message}`);
    console.error('\nUsage : pnpm content:validate-generated --chapter "Emprunts obligataires" [--verbose]');
    process.exit(1);
  }

  fail(error);
});
