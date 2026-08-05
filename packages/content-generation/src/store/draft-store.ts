import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentDraftSchema, type ContentDraft } from "../types/artifact";
import { assertTransition, type ContentDraftStatus, type StatusTransition } from "../types/status";

/**
 * Stockage des brouillons sur disque, sous `data/generated/drafts/<pack>/<chapitre>/`.
 *
 * Le disque est la source de vérité de ce lot : la base n'est pas requise pour
 * générer ni relire, ce qui garde la fabrique utilisable sur une installation
 * locale sans PostgreSQL. La migration `0013` fournit la table équivalente pour
 * les installations qui persistent, sans que ce chemin en dépende.
 *
 * Le dossier est git-ignoré : un brouillon contient du texte issu des PDF privés.
 */

export interface DraftStoreOptions {
  rootDir: string;
  packId: string;
  chapterSlug: string;
}

function chapterDir(options: DraftStoreOptions): string {
  return join(options.rootDir, options.packId, options.chapterSlug);
}

export async function listDrafts(options: DraftStoreOptions): Promise<ContentDraft[]> {
  const directory = chapterDir(options);

  if (!existsSync(directory)) {
    return [];
  }

  const drafts: ContentDraft[] = [];

  for (const fileName of (await readdir(directory)).sort()) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    drafts.push(contentDraftSchema.parse(JSON.parse(await readFile(join(directory, fileName), "utf8"))));
  }

  return drafts;
}

export async function readDraft(options: DraftStoreOptions, draftId: string): Promise<ContentDraft | undefined> {
  const path = join(chapterDir(options), `${draftId}.json`);

  if (!existsSync(path)) {
    return undefined;
  }

  return contentDraftSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function writeDraft(options: DraftStoreOptions, draft: ContentDraft): Promise<void> {
  const directory = chapterDir(options);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${draft.id}.json`),
    `${JSON.stringify(contentDraftSchema.parse(draft), null, 2)}\n`,
    "utf8"
  );
}

export interface SaveSummary {
  /** Nouveaux brouillons écrits. */
  created: number;
  /** Brouillons existants remplacés par une nouvelle révision (`--force`). */
  revised: number;
  /** Approuvés laissés intacts — jamais écrasés, même avec `--force`. */
  skippedApproved: number;
  /** Existants laissés en l'état faute de `--force`. */
  skippedExisting: number;
}

/**
 * Écrit un lot de brouillons.
 *
 * Trois règles, dans cet ordre :
 *
 * 1. un contenu `approved` n'est **jamais** écrasé, `--force` compris — c'est la
 *    garantie qu'une régénération ne détruit pas un travail de relecture ;
 * 2. sans `--force`, un brouillon existant est laissé tel quel, pour ne pas
 *    effacer une revue en cours ;
 * 3. avec `--force`, il est remplacé par une **nouvelle révision** : le numéro
 *    de révision est incrémenté, la date de création et l'historique complet
 *    sont conservés.
 */
export async function saveDrafts(
  options: DraftStoreOptions,
  drafts: readonly ContentDraft[],
  mode: { force: boolean }
): Promise<SaveSummary> {
  const summary: SaveSummary = { created: 0, revised: 0, skippedApproved: 0, skippedExisting: 0 };

  for (const draft of drafts) {
    const existing = await readDraft(options, draft.id);

    if (!existing) {
      await writeDraft(options, draft);
      summary.created += 1;
      continue;
    }

    if (existing.status === "approved") {
      summary.skippedApproved += 1;
      continue;
    }

    if (!mode.force) {
      summary.skippedExisting += 1;
      continue;
    }

    await writeDraft(options, {
      ...draft,
      reviewMetadata: {
        ...draft.reviewMetadata,
        revision: existing.reviewMetadata.revision + 1
      },
      createdAt: existing.createdAt,
      history: [...existing.history, ...draft.history]
    } as ContentDraft);
    summary.revised += 1;
  }

  return summary;
}

/**
 * Fait suivre au brouillon la conséquence de sa validation, en n'empruntant que
 * des transitions légales.
 *
 * Un contenu réparé doit pouvoir repartir : depuis `validation_failed`, le seul
 * chemin autorisé passe par `draft`, donc la remontée vers `needs_review` en
 * emprunte deux — les deux sont inscrites à l'historique. Sans cela, corriger un
 * contenu en échec le laissait dans une impasse, inapprouvable à jamais.
 *
 * Depuis `needs_review`, un échec ne rétrograde pas le statut : la machine à
 * états ne l'autorise pas, et c'est l'approbation qui refusera après avoir
 * revalidé. Depuis `approved` ou `rejected`, rien ne bouge — seule une action
 * humaine sort un contenu de ces états.
 */
export function advanceAfterValidation(
  draft: ContentDraft,
  passed: boolean,
  occurredAt: string,
  actor: string,
  comment?: string
): ContentDraft {
  const chain: ContentDraftStatus[] = [];

  if (passed) {
    if (draft.status === "validation_failed") {
      chain.push("draft", "needs_review");
    } else if (draft.status === "draft") {
      chain.push("needs_review");
    }
  } else if (draft.status === "draft") {
    chain.push("validation_failed");
  }

  return chain.reduce<ContentDraft>(
    (current, to) =>
      applyTransition({
        draft: current,
        to,
        actor,
        occurredAt,
        // Le motif n'a de sens que sur la transition qui constate l'échec.
        comment: to === "validation_failed" ? comment : undefined
      }),
    draft
  );
}

export interface TransitionInput {
  draft: ContentDraft;
  to: ContentDraftStatus;
  actor: string;
  comment?: string;
  occurredAt: string;
}

/**
 * Applique une transition de statut en la validant d'abord. Le statut courant
 * lu sur le brouillon fait foi — jamais celui qu'un appelant prétend avoir.
 */
export function applyTransition(input: TransitionInput): ContentDraft {
  assertTransition(input.draft.status, input.to);

  const transition: StatusTransition = {
    fromStatus: input.draft.status,
    toStatus: input.to,
    occurredAt: input.occurredAt,
    actor: input.actor,
    comment: input.comment
  };

  return {
    ...input.draft,
    status: input.to,
    updatedAt: input.occurredAt,
    reviewMetadata: {
      ...input.draft.reviewMetadata,
      reviewedBy: input.actor,
      reviewedAt: input.occurredAt,
      reviewNote: input.comment ?? input.draft.reviewMetadata.reviewNote
    },
    history: [...input.draft.history, transition]
  } as ContentDraft;
}
