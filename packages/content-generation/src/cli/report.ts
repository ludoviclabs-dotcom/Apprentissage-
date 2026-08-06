import { listDrafts } from "../store/draft-store";
import { contentTypeLabels, type ContentType } from "../types/artifact";
import type { ContentDraftStatus } from "../types/status";
import { draftsRoot, fail, parseCommonOptions, resolveContext, UsageError } from "./shared";

/**
 * `pnpm content:report --chapter "Emprunts obligataires"`
 *
 * Rapport de couverture d'un chapitre : ce qui a été produit, ce qui bloque, et
 * surtout ce qui **manque** parce que les sources ne le couvrent pas. Ce dernier
 * point est l'information utile — un chapitre sans corrigé produit moins
 * d'exercices, et le rapport doit le dire plutôt que de le masquer.
 */

/** Repères indicatifs du pilote ; un écart est un signal, pas une faute. */
const EXPECTED_COVERAGE: Partial<Record<ContentType, { min: number; max: number }>> = {
  smart_revision_sheet: { min: 1, max: 1 },
  flashcard: { min: 8, max: 15 },
  calculation_exercise: { min: 3, max: 5 },
  journal_entry_exercise: { min: 2, max: 4 },
  error_diagnosis_exercise: { min: 2, max: 4 },
  progressive_case: { min: 1, max: 1 }
};

async function main(): Promise<void> {
  const options = parseCommonOptions(process.argv.slice(2));
  const { chapter } = await resolveContext(options);

  const drafts = await listDrafts({
    rootDir: draftsRoot(options),
    packId: options.sourcePack,
    chapterSlug: chapter.chapterSlug
  });

  console.log(`Rapport — ${chapter.chapterLabel} (${chapter.chapterSlug})`);
  console.log(`Domaine : ${chapter.domainId} | Pack : ${options.sourcePack}`);
  console.log("");

  if (drafts.length === 0) {
    console.log("Aucun brouillon. Lancer : pnpm content:generate --chapter \"" + chapter.chapterLabel + '"');
    return;
  }

  const byStatus = new Map<ContentDraftStatus, number>();
  const byType = new Map<ContentType, number>();
  const approvableByType = new Map<ContentType, number>();

  for (const draft of drafts) {
    byStatus.set(draft.status, (byStatus.get(draft.status) ?? 0) + 1);
    byType.set(draft.contentType, (byType.get(draft.contentType) ?? 0) + 1);

    if (draft.status === "needs_review" || draft.status === "approved") {
      approvableByType.set(draft.contentType, (approvableByType.get(draft.contentType) ?? 0) + 1);
    }
  }

  console.log("Par statut :");
  for (const status of ["needs_review", "approved", "validation_failed", "rejected", "draft"] as const) {
    const count = byStatus.get(status) ?? 0;
    if (count > 0) {
      console.log(`  ${status.padEnd(18)} ${count}`);
    }
  }

  console.log("");
  console.log("Couverture par type :");

  for (const [contentType, expected] of Object.entries(EXPECTED_COVERAGE) as Array<
    [ContentType, { min: number; max: number }]
  >) {
    const usable = approvableByType.get(contentType) ?? 0;
    const total = byType.get(contentType) ?? 0;
    const label = contentTypeLabels[contentType].padEnd(22);
    const marker = usable < expected.min ? "⚠" : " ";
    console.log(
      `  ${marker} ${label} ${usable} exploitable(s) sur ${total} produit(s) — repère ${expected.min}-${expected.max}`
    );
  }

  const gaps = (Object.entries(EXPECTED_COVERAGE) as Array<[ContentType, { min: number; max: number }]>).filter(
    ([contentType, expected]) => (approvableByType.get(contentType) ?? 0) < expected.min
  );

  if (gaps.length > 0) {
    console.log("");
    console.log("Couverture insuffisante — causes probables :");
    for (const [contentType] of gaps) {
      const produced = byType.get(contentType) ?? 0;
      console.log(
        produced === 0
          ? `  - ${contentTypeLabels[contentType]} : aucun contenu produit, les sources ne couvrent probablement pas ce format.`
          : `  - ${contentTypeLabels[contentType]} : ${produced} produit(s) mais bloqué(s) par les contrôles (voir content:validate-generated --verbose).`
      );
    }
  }

  const blocking = drafts.filter((draft) => draft.status === "validation_failed");

  if (blocking.length > 0) {
    console.log("");
    console.log(`Contenus bloqués (${blocking.length}) :`);
    for (const draft of blocking) {
      const first = draft.validationMetadata?.blockingReasons[0] ?? "raison non renseignée";
      console.log(`  - [${draft.contentType}] ${draft.title}`);
      console.log(`      ${first}`);
    }
  }

  const warnings = drafts.flatMap((draft) =>
    (draft.validationMetadata?.warnings ?? []).map((issue) => `${draft.title} — ${issue.message}`)
  );

  if (warnings.length > 0) {
    console.log("");
    console.log(`Avertissements (${warnings.length}) :`);
    for (const warning of warnings.slice(0, 15)) {
      console.log(`  ⚠ ${warning}`);
    }
    if (warnings.length > 15) {
      console.log(`  … et ${warnings.length - 15} autre(s).`);
    }
  }

  const modes = new Set(drafts.map((draft) => draft.generationMetadata.mode));
  console.log("");
  console.log(`Mode de génération : ${[...modes].join(", ")}`);
  if (modes.has("mock")) {
    console.log("  ⚠ Des contenus proviennent de FIXTURES techniques (mode mock), pas d'une génération réelle.");
  }
  console.log("Aucun de ces contenus n'est publié : la publication n'existe pas dans ce lot.");
}

main().catch((error) => {
  if (error instanceof UsageError) {
    console.error(`\n✖ ${error.message}`);
    console.error('\nUsage : pnpm content:report --chapter "Emprunts obligataires"');
    process.exit(1);
  }

  fail(error);
});
