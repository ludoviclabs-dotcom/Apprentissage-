import { buildSourceEnvelope, DEFAULT_MAX_INPUT_CHARS } from "../envelope/build";
import { generateDrafts, parseKinds, restrictKindsForDomain } from "../generate/orchestrator";
import { createContentProvider, resolveMaxInputChars } from "../providers";
import { saveDrafts } from "../store/draft-store";
import type { ContentPayload } from "../types/artifact";
import { listDrafts } from "../store/draft-store";
import { draftsRoot, fail, manualOptions, parseCommonOptions, resolveContext, UsageError } from "./shared";

/**
 * `pnpm content:generate --chapter "Emprunts obligataires" --mode mock`
 *
 * Génère des brouillons, jamais du contenu publié. Le mode par défaut est
 * `mock` : aucune clé d'API n'est nécessaire, et aucun appel réseau n'est émis.
 */

async function main(): Promise<void> {
  const options = parseCommonOptions(process.argv.slice(2));
  const requestedKinds = parseKinds(options.types);
  const { corpus, chapter } = await resolveContext(options);

  // Le domaine décide de ce qui peut être produit : l'ISO ne se transforme pas
  // en exercices sans licence explicite.
  const restriction = restrictKindsForDomain(requestedKinds, chapter.domainId, process.env);
  const kinds = restriction.allowed;

  const envelope = buildSourceEnvelope(corpus.index, {
    chapterSlug: chapter.chapterSlug,
    chapterLabel: chapter.chapterLabel,
    sourcePackId: options.sourcePack,
    maxInputChars: resolveMaxInputChars(process.env, DEFAULT_MAX_INPUT_CHARS)
  });

  console.log(`Chapitre        : ${chapter.chapterLabel} (${chapter.chapterSlug})`);
  console.log(`Domaine         : ${envelope.domainId}`);
  console.log(`Pack            : ${options.sourcePack}`);
  console.log(`Mode            : ${options.mode}`);
  console.log(`Types demandés  : ${requestedKinds.join(", ")}`);

  if (restriction.refused.length > 0) {
    console.log(`Types refusés   : ${restriction.refused.join(", ")}`);
    console.log(`  ${restriction.reason}`);
  }

  if (kinds.length === 0) {
    console.error(
      `\n✖ Aucun type de contenu n'est autorisé pour le domaine « ${chapter.domainId} » avec cette demande.`
    );
    process.exit(1);
  }

  console.log("");
  console.log("Sources sélectionnées :");

  for (const document of envelope.documents) {
    const pages = document.degradedPages.length > 0
      ? ` — pages dégradées : ${document.degradedPages.join(", ")}`
      : "";
    console.log(
      `  - ${document.title} [${document.category}] ${document.pageCount} pages, ${document.chunks.length} fragments${pages}`
    );
  }

  console.log("");
  console.log(`Caractères transmis : ${envelope.totalChars} / ${envelope.maxInputChars}`);

  if (envelope.excluded.length > 0) {
    console.log(`Fragments exclus    : ${envelope.excluded.length}`);
    for (const item of envelope.excluded.slice(0, 10)) {
      console.log(`  - ${item.chunkId} : ${item.reason}`);
    }
  }

  if (options.dryRun) {
    console.log("");
    console.log("— DRY RUN — aucun contenu généré, aucune écriture, aucun appel au fournisseur.");
    console.log(`Types qui seraient générés : ${kinds.join(", ")}`);
    return;
  }

  const provider = createContentProvider(
    options.mode,
    process.env,
    options.mode === "manual-assisted" ? manualOptions(options) : undefined
  );
  const storeOptions = {
    rootDir: draftsRoot(options),
    packId: options.sourcePack,
    chapterSlug: chapter.chapterSlug
  };

  // Les contenus déjà retenus servent de référence pour la détection de doublons.
  const existingDrafts = await listDrafts(storeOptions);
  const existing: ContentPayload[] = existingDrafts
    .filter((draft) => draft.status !== "validation_failed" && draft.status !== "rejected")
    .map((draft) => ({ contentType: draft.contentType, content: draft.content }) as ContentPayload);

  const { drafts, outcomes } = await generateDrafts({
    kinds,
    envelope,
    corpus: corpus.index,
    provider,
    now: () => new Date(),
    existing
  });

  const limited = options.limit ? drafts.slice(0, options.limit) : drafts;
  const summary = await saveDrafts(storeOptions, limited, { force: options.force });

  console.log("");
  console.log(`Fournisseur     : ${provider.name} (modèle ${provider.model})`);
  console.log("");
  console.log("Résultat par type :");

  for (const outcome of outcomes) {
    if (outcome.skippedReason) {
      console.log(`  - ${outcome.kind} : rien produit — ${outcome.skippedReason}`);
      continue;
    }
    console.log(
      `  - ${outcome.kind} : ${outcome.produced} en needs_review, ${outcome.failed} en validation_failed`
    );
  }

  console.log("");
  console.log(`Brouillons créés     : ${summary.created}`);
  console.log(`Révisions écrites    : ${summary.revised}`);
  console.log(`Approuvés préservés  : ${summary.skippedApproved}`);
  console.log(`Existants conservés  : ${summary.skippedExisting}${options.force ? "" : " (utiliser --force pour régénérer)"}`);
  console.log(`Dossier              : ${storeOptions.rootDir}`);

  if (options.verbose) {
    console.log("");
    for (const draft of limited) {
      console.log(`  [${draft.status}] ${draft.contentType} — ${draft.title}`);
      for (const issue of draft.validationMetadata?.errors ?? []) {
        console.log(`      ✖ ${issue.code} : ${issue.message}`);
      }
    }
  }

  console.log("");
  console.log("Aucun contenu n'est publié. Relire dans /admin/content-review avant toute suite.");
}

main().catch((error) => {
  if (error instanceof UsageError) {
    console.error(`\n✖ ${error.message}`);
    console.error(
      '\nUsage : pnpm content:generate --chapter "Emprunts obligataires" [--mode mock|live|manual-assisted]\n' +
        "        [--types sheet,flashcards,calculations,journal_entries,error_diagnoses,case]\n" +
        "        [--dry-run] [--force] [--limit N] [--source-pack <id>] [--output <dossier>] [--verbose]\n" +
        "        [--author <nom>] [--manual-input <dossier>]   (mode manual-assisted)"
    );
    process.exit(1);
  }

  fail(error);
});
