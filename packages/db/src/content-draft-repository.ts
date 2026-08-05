import { and, asc, desc, eq } from "drizzle-orm";
import { canUseDatabase, createDb } from "./client";
import { contentDraftTransitionsTable, contentDraftsTable } from "./drizzle-schema";

/**
 * The content factory's drafts (PR-14), and the trail of what was decided about
 * each of them.
 *
 * NO USER CONTEXT, ON PURPOSE. Both tables are administration content: they have
 * no `user_id`, no row level security, and carry no personal data — see
 * migration 0013 for the full reasoning. So every query here runs on a plain
 * connection, exactly as the public certificate projection does, and the access
 * control lives in the routes (`requireAdmin`), not in a policy.
 *
 * NOTHING IS IMPORTED FROM `@finance/content-generation`. That package already
 * depends on nothing here, and reaching for its Zod schemas would close the loop
 * into a cycle between the two packages. The status and content-type
 * enumerations below are therefore restated as plain string unions — they mirror
 * `contentDraftStatuses` and `contentTypes`, and the CHECK constraints of
 * migration 0013 are what keeps all three in step. The JSON columns stay
 * `unknown` for the same reason: their shapes belong to the factory's schemas,
 * and the caller parses them there.
 *
 * SEEDED MODE. Without a database the factory writes its drafts to disk, under
 * `data/generated/drafts/`, and that store is the source of truth for this lot.
 * Reads here return empty, which is truthful — this table holds nothing. Writes
 * report {@link ContentDraftWriteResult} with `status: "unavailable"` rather
 * than returning quietly, so a caller can never mistake "there was no database
 * to write to" for "it is saved".
 */

/** Mirrors `contentDraftStatuses`; there is no `published`, deliberately. */
export const contentDraftStatusNames = [
  "draft",
  "validation_failed",
  "needs_review",
  "approved",
  "rejected"
] as const;

export type ContentDraftStatusName = (typeof contentDraftStatusNames)[number];

/** Mirrors `contentTypes` in the factory's `types/artifact.ts`. */
export const contentDraftTypeNames = [
  "smart_revision_sheet",
  "flashcard",
  "calculation_exercise",
  "journal_entry_exercise",
  "error_diagnosis_exercise",
  "progressive_case"
] as const;

export type ContentDraftTypeName = (typeof contentDraftTypeNames)[number];

/**
 * A stored draft, as it comes back out.
 *
 * The four JSON fields are `unknown`: this package holds no opinion on their
 * shape, and handing back a lie about it would be worse than handing back
 * nothing. The caller parses them with the factory's schemas.
 */
export interface ContentDraftRecord {
  id: string;
  contentType: ContentDraftTypeName;
  status: ContentDraftStatusName;
  chapterSlug: string;
  chapterLabel: string;
  /** `domainId` on the factory's envelope; the column has always been `domain`. */
  domain: string;
  title: string;
  difficulty: number;
  payload: unknown;
  generationMetadata: unknown;
  /** Null until the validators have run — not the same as an empty report. */
  validationMetadata: unknown;
  reviewMetadata: unknown;
  sourcePackId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * What an upsert needs. `revision` and the two optional metadata blocks fall
 * back to the column defaults of migration 0013 when they are left out.
 */
export interface ContentDraftInput {
  id: string;
  contentType: ContentDraftTypeName;
  status: ContentDraftStatusName;
  chapterSlug: string;
  chapterLabel: string;
  domain: string;
  title: string;
  difficulty: number;
  payload: unknown;
  generationMetadata: unknown;
  validationMetadata?: unknown;
  reviewMetadata?: unknown;
  sourcePackId: string;
  revision?: number;
}

export interface ContentDraftFilters {
  chapterSlug?: string;
  status?: string;
  contentType?: string;
}

export interface ContentDraftTransitionRecord {
  id: string;
  draftId: string;
  fromStatus: ContentDraftStatusName | null;
  toStatus: ContentDraftStatusName;
  actor: string;
  comment: string | null;
  occurredAt: string;
}

export interface RecordDraftTransitionInput {
  draftId: string;
  /** Null for the first transition: a generated draft comes from nowhere. */
  fromStatus: ContentDraftStatusName | null;
  toStatus: ContentDraftStatusName;
  /** A human account, or a machine origin (`cli:generate`, `validator`). */
  actor: string;
  comment?: string | null;
}

/**
 * The outcome of a write. A discriminated union rather than a bare `void`: the
 * seeded-mode branch has to be visible to the caller, because "no database" and
 * "written" are the two facts a review screen must never confuse.
 */
export type ContentDraftWriteResult =
  | { status: "written" }
  | { status: "unavailable"; reason: string };

const DATABASE_DISABLED = "FINANCE_HUB_USE_DATABASE is not true, or DATABASE_URL is not set";

/**
 * Thrown when a column constrained by migration 0013 hands back a value outside
 * its enumeration — which can only mean the CHECK was dropped. Coercing to a
 * default instead, as the certificate projection does for a status it can safely
 * assume active, would silently relabel an approved draft.
 */
export class ContentDraftIntegrityError extends Error {
  constructor(
    readonly column: string,
    readonly value: string
  ) {
    super(`content_drafts.${column} holds "${value}", which is not a value this schema allows.`);
    this.name = "ContentDraftIntegrityError";
  }
}

function asMember<T extends string>(value: string, allowed: readonly T[], column: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ContentDraftIntegrityError(column, value);
  }

  // Sound: `includes` has just established membership, which the compiler cannot
  // carry across a widened `readonly string[]`.
  return value as T;
}

/** postgres-js hands back `2027-07-28 00:00:00+00`; timestamps leave as ISO. */
function toIso(value: string): string {
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));

  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

const draftColumns = {
  id: contentDraftsTable.id,
  contentType: contentDraftsTable.contentType,
  status: contentDraftsTable.status,
  chapterSlug: contentDraftsTable.chapterSlug,
  chapterLabel: contentDraftsTable.chapterLabel,
  domain: contentDraftsTable.domain,
  title: contentDraftsTable.title,
  difficulty: contentDraftsTable.difficulty,
  payload: contentDraftsTable.payload,
  generationMetadata: contentDraftsTable.generationMetadata,
  validationMetadata: contentDraftsTable.validationMetadata,
  reviewMetadata: contentDraftsTable.reviewMetadata,
  sourcePackId: contentDraftsTable.sourcePackId,
  revision: contentDraftsTable.revision,
  createdAt: contentDraftsTable.createdAt,
  updatedAt: contentDraftsTable.updatedAt
};

interface DraftRow {
  id: string;
  contentType: string;
  status: string;
  chapterSlug: string;
  chapterLabel: string;
  domain: string;
  title: string;
  difficulty: number;
  payload: unknown;
  generationMetadata: unknown;
  validationMetadata: unknown;
  reviewMetadata: unknown;
  sourcePackId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

function toDraftRecord(row: DraftRow): ContentDraftRecord {
  return {
    ...row,
    contentType: asMember(row.contentType, contentDraftTypeNames, "content_type"),
    status: asMember(row.status, contentDraftStatusNames, "status"),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt)
  };
}

/**
 * The drafts matching every filter given, most recently touched first.
 *
 * The filters are plain strings because they arrive from a query string: a value
 * outside the enumerations simply matches nothing, which is the right answer for
 * `?status=published` and does not need to be an error.
 *
 * Returns an empty array in seeded mode — this table genuinely holds nothing
 * then, and the disk store is where the drafts are.
 */
export async function listContentDrafts(
  filters: ContentDraftFilters = {}
): Promise<ContentDraftRecord[]> {
  if (!canUseDatabase()) {
    return [];
  }

  const conditions = [
    filters.chapterSlug === undefined
      ? undefined
      : eq(contentDraftsTable.chapterSlug, filters.chapterSlug),
    filters.status === undefined ? undefined : eq(contentDraftsTable.status, filters.status),
    filters.contentType === undefined
      ? undefined
      : eq(contentDraftsTable.contentType, filters.contentType)
  ];

  const rows = await createDb()
    .select(draftColumns)
    .from(contentDraftsTable)
    // `and()` collapses to undefined when nothing is filtered, which drizzle
    // reads as "no WHERE clause".
    .where(and(...conditions))
    .orderBy(desc(contentDraftsTable.updatedAt));

  return rows.map(toDraftRecord);
}

/** One draft, or null — no database, or no such id. */
export async function getContentDraft(id: string): Promise<ContentDraftRecord | null> {
  if (!canUseDatabase()) {
    return null;
  }

  const rows = await createDb()
    .select(draftColumns)
    .from(contentDraftsTable)
    .where(eq(contentDraftsTable.id, id))
    .limit(1);

  const row = rows[0];

  return row ? toDraftRecord(row) : null;
}

/**
 * Writes a draft, replacing the row of the same id.
 *
 * Replacing is the intended behaviour: the id is derived from the generation
 * inputs, so a second run over unchanged sources is the same draft and must not
 * fork a copy. What a replacement must never lose is the history — it lives in
 * `content_draft_transitions`, which this never touches — nor `created_at`,
 * which is left out of the conflict branch so the row keeps the date it first
 * appeared.
 */
export async function upsertContentDraft(
  draft: ContentDraftInput
): Promise<ContentDraftWriteResult> {
  if (!canUseDatabase()) {
    return { status: "unavailable", reason: DATABASE_DISABLED };
  }

  const updatedAt = new Date().toISOString();
  const values = {
    id: draft.id,
    contentType: draft.contentType,
    status: draft.status,
    chapterSlug: draft.chapterSlug,
    chapterLabel: draft.chapterLabel,
    domain: draft.domain,
    title: draft.title,
    difficulty: draft.difficulty,
    payload: draft.payload,
    generationMetadata: draft.generationMetadata,
    validationMetadata: draft.validationMetadata ?? null,
    sourcePackId: draft.sourcePackId,
    updatedAt
  };

  await createDb()
    .insert(contentDraftsTable)
    .values({
      ...values,
      // Left to the column defaults of migration 0013 when the caller says
      // nothing, rather than guessed at here.
      ...(draft.reviewMetadata === undefined ? {} : { reviewMetadata: draft.reviewMetadata }),
      ...(draft.revision === undefined ? {} : { revision: draft.revision })
    })
    .onConflictDoUpdate({
      target: contentDraftsTable.id,
      set: {
        ...values,
        ...(draft.reviewMetadata === undefined ? {} : { reviewMetadata: draft.reviewMetadata }),
        ...(draft.revision === undefined ? {} : { revision: draft.revision })
      }
    });

  return { status: "written" };
}

/**
 * Appends one entry to a draft's trail.
 *
 * Append-only by construction: there is no update and no delete here, and the
 * foreign key means an entry for an unknown draft is refused by the database
 * rather than accumulating as an orphan. That refusal surfaces as a thrown
 * error, which is the point — a trail that quietly drops entries is worse than
 * no trail.
 *
 * The transition itself is not validated here: `assertTransition` in the factory
 * owns the state machine, and restating its table in this package would give the
 * two copies somewhere to disagree.
 */
export async function recordDraftTransition(
  input: RecordDraftTransitionInput
): Promise<ContentDraftWriteResult> {
  if (!canUseDatabase()) {
    return { status: "unavailable", reason: DATABASE_DISABLED };
  }

  await createDb().insert(contentDraftTransitionsTable).values({
    draftId: input.draftId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actor: input.actor,
    comment: input.comment ?? null
  });

  return { status: "written" };
}

/** A draft's trail, oldest first — a history reads forwards. Empty with no database. */
export async function getDraftTransitions(
  draftId: string
): Promise<ContentDraftTransitionRecord[]> {
  if (!canUseDatabase()) {
    return [];
  }

  const rows = await createDb()
    .select({
      id: contentDraftTransitionsTable.id,
      draftId: contentDraftTransitionsTable.draftId,
      fromStatus: contentDraftTransitionsTable.fromStatus,
      toStatus: contentDraftTransitionsTable.toStatus,
      actor: contentDraftTransitionsTable.actor,
      comment: contentDraftTransitionsTable.comment,
      occurredAt: contentDraftTransitionsTable.occurredAt
    })
    .from(contentDraftTransitionsTable)
    .where(eq(contentDraftTransitionsTable.draftId, draftId))
    .orderBy(asc(contentDraftTransitionsTable.occurredAt));

  return rows.map((row) => ({
    ...row,
    fromStatus:
      row.fromStatus === null
        ? null
        : asMember(row.fromStatus, contentDraftStatusNames, "from_status"),
    toStatus: asMember(row.toStatus, contentDraftStatusNames, "to_status"),
    occurredAt: toIso(row.occurredAt)
  }));
}
