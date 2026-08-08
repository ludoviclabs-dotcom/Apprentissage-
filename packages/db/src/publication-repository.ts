import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { canUseDatabase, createDb } from "./client";
import {
  chapterActivityEventsTable,
  contentPublicationAuditTable,
  errorJournalTable,
  publishedContentVersionsTable,
  remediationTasksTable,
  reviewQueueTable
} from "./drizzle-schema";
import { withUserContext } from "./user-context";

/**
 * The publication registry (PR-15), its audit trail, and the learner activity a
 * published chapter records.
 *
 * WHAT THIS FILE IS *NOT*. It is not where published content comes from. The
 * snapshots live in `content/published/`, committed, and the public pages read
 * them there — which is what lets the chapter work with no database at all, as
 * the rest of the cockpit does. Mirroring them here gives an install that
 * persists a queryable registry and, above all, an audit trail: a file has no
 * author, and "who published this, when, replacing what" is exactly the fact the
 * review workflow must be able to answer.
 *
 * A write that lands nowhere reports {@link PublicationWriteResult} with
 * `status: "unavailable"` rather than returning quietly, so a caller can never
 * mistake "there was no database" for "it is recorded". The file store is the
 * one that must succeed; this one is allowed to be absent.
 *
 * NOTHING IS IMPORTED FROM `@finance/content-publication`. That package does not
 * depend on this one, and reaching for its Zod schemas would close the loop. The
 * JSON columns stay `unknown`, exactly as the draft repository leaves them.
 */

export type PublicationWriteResult =
  | { status: "written" }
  | { status: "unavailable"; reason: string };

const DATABASE_DISABLED = "FINANCE_HUB_USE_DATABASE is not true, or DATABASE_URL is not set";

/**
 * Failures that mean "this store could not be reached", not "this write was
 * refused".
 *
 * THE DISTINCTION IS THE WHOLE POINT. A configured-but-unreachable database and
 * a database that *rejected* the row are different facts, and only the first one
 * is an availability problem. Collapsing them would swallow `23505` — the unique
 * violation that says another version was published first — and turn a
 * "reload and try again" into a silent "nothing was recorded". So the list is a
 * whitelist of causes, and every other error is re-thrown untouched, exactly as
 * before.
 *
 * The two families it covers are the two an install actually hits: the server
 * never answered, or it answered and migration 0014/0015 was never applied. Both
 * are the operator's problem and neither is the reviewer's fault; both deserve
 * "the store is unavailable", not "internal error".
 */
const UNAVAILABLE_CODES: ReadonlyMap<string, string> = new Map([
  ["ECONNREFUSED", "the database refused the connection"],
  ["ENOTFOUND", "the database host could not be resolved"],
  ["ETIMEDOUT", "the database did not answer in time"],
  ["EHOSTUNREACH", "the database host is unreachable"],
  ["ENETUNREACH", "the database network is unreachable"],
  ["ECONNRESET", "the database connection was reset"],
  ["CONNECT_TIMEOUT", "the database did not answer in time"],
  ["CONNECTION_CLOSED", "the database connection closed"],
  ["CONNECTION_ENDED", "the database connection ended"],
  ["CONNECTION_DESTROYED", "the database connection was destroyed"],
  ["3D000", "the database named in DATABASE_URL does not exist"],
  ["28P01", "the database rejected the credentials"],
  ["28000", "the database rejected the credentials"],
  ["42P01", "the publication tables are missing: run the migrations (0014)"],
  ["42703", "the publication columns are missing: run the migrations (0015)"]
]);

/**
 * Exported so the whitelist can be exercised without a server.
 *
 * The install this runs on has no local PostgreSQL, so a test that proved the
 * classification by *causing* a connection failure would prove it on one machine
 * and skip on the next. The classification is a pure function of the error code;
 * testing it as one is both honest and portable.
 */
export function publicationWriteUnavailabilityReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = String((error as { code?: unknown }).code);
  const reason = UNAVAILABLE_CODES.get(code);

  // The code alone, never the message: postgres-js puts host and port in it, and
  // this string reaches an administration screen.
  return reason ? `${reason} (${code})` : null;
}

/**
 * Runs a publication write, turning an unreachable store into a reported result.
 *
 * A caller reading `{ status: "unavailable" }` knows nothing was recorded — the
 * transaction is atomic, so there is no half-written state to reason about — and
 * can say so. A caller receiving a thrown error knows the write was *refused*,
 * which is a different conversation to have with the reviewer.
 */
async function runPublicationWrite(write: () => Promise<void>): Promise<PublicationWriteResult> {
  try {
    await write();
  } catch (error) {
    const reason = publicationWriteUnavailabilityReason(error);

    if (reason === null) {
      throw error;
    }

    return { status: "unavailable", reason };
  }

  return { status: "written" };
}

export interface PublishedVersionInput {
  id: string;
  sourceArtifactId: string;
  artifactType: string;
  title: string;
  slug: string;
  domain: string;
  module: string;
  chapter: string;
  chapterLabel: string;
  contentSnapshot: unknown;
  sourceReferencesSnapshot: unknown;
  publicationVersion: number;
  publishedAt: string;
  publishedBy: string;
  generationMetadataSnapshot: unknown;
  validationMetadataSnapshot: unknown;
  reviewMetadataSnapshot: unknown;
  contentHash: string;
  previousPublishedVersionId: string | null;
  /**
   * The referential this version is true against, copied whole.
   *
   * `null` only for a row that never had one — a publication written before
   * migration 0015. A *new* publication with a null context is refused upstream
   * by the publication guard: the storage layer stores what it is given, and the
   * decision of what may be published belongs where the rules live.
   */
  normativeContextSnapshot: unknown | null;
  /**
   * Derived from the snapshot, never authored separately.
   *
   * They exist so that "what is published in this chapter, and what may grade a
   * learner" is answerable without selecting a JSONB column for every row — the
   * summary query behind the chapter screens and the spaced-repetition queue.
   */
  normativeProfile: string | null;
  scoringPolicy: string | null;
}

export interface PublicationAuditInput {
  action: "publish" | "republish" | "archive";
  versionId: string;
  previousVersionId: string | null;
  artifactType: string;
  chapter: string;
  slug: string;
  publicationVersion: number;
  actor: string;
  comment?: string | null;
  contentHash: string;
}

export interface PublicationAuditRecord extends PublicationAuditInput {
  id: string;
  occurredAt: string;
}

/** postgres-js hands back `2027-07-28 00:00:00+00`; timestamps leave as ISO. */
function toIso(value: string): string {
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));

  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

/**
 * Records a publication and archives the version it replaces, in one
 * transaction.
 *
 * THE ARCHIVE MUST HAPPEN INSIDE THE INSERT'S TRANSACTION. The partial unique
 * index of migration 0014 allows exactly one `published` row per (type, chapter,
 * slug); inserting first and archiving after would violate it and abort, and
 * archiving first outside a transaction would leave the chapter with *no* active
 * version if the insert then failed. Doing both in one transaction makes the
 * intermediate state unobservable and the failure total.
 */
export async function recordPublishedVersion(
  version: PublishedVersionInput,
  audit: PublicationAuditInput
): Promise<PublicationWriteResult> {
  if (!canUseDatabase()) {
    return { status: "unavailable", reason: DATABASE_DISABLED };
  }

  return runPublicationWrite(() =>
    createDb().transaction(async (tx) => {
      if (version.previousPublishedVersionId) {
        await tx
          .update(publishedContentVersionsTable)
          .set({ status: "archived", archivedAt: version.publishedAt })
          .where(eq(publishedContentVersionsTable.id, version.previousPublishedVersionId));
      }

      await tx.insert(publishedContentVersionsTable).values({
        ...version,
        status: "published",
        archivedAt: null
      });

      await tx.insert(contentPublicationAuditTable).values({
        action: audit.action,
        versionId: audit.versionId,
        previousVersionId: audit.previousVersionId,
        artifactType: audit.artifactType,
        chapter: audit.chapter,
        slug: audit.slug,
        publicationVersion: audit.publicationVersion,
        actor: audit.actor,
        comment: audit.comment ?? null,
        contentHash: audit.contentHash
      });
    })
  );
}

/** Archives an active version without replacing it, and records the act. */
export async function recordArchivedVersion(
  versionId: string,
  archivedAt: string,
  audit: PublicationAuditInput
): Promise<PublicationWriteResult> {
  if (!canUseDatabase()) {
    return { status: "unavailable", reason: DATABASE_DISABLED };
  }

  return runPublicationWrite(() =>
    createDb().transaction(async (tx) => {
      await tx
        .update(publishedContentVersionsTable)
        .set({ status: "archived", archivedAt })
        .where(eq(publishedContentVersionsTable.id, versionId));

      await tx.insert(contentPublicationAuditTable).values({
        action: audit.action,
        versionId: audit.versionId,
        previousVersionId: audit.previousVersionId,
        artifactType: audit.artifactType,
        chapter: audit.chapter,
        slug: audit.slug,
        publicationVersion: audit.publicationVersion,
        actor: audit.actor,
        comment: audit.comment ?? null,
        contentHash: audit.contentHash
      });
    })
  );
}

/**
 * A chapter's publication trail, most recent first, paginated.
 *
 * Paginated rather than complete: a chapter republished weekly for a year is
 * fifty rows, and an administration screen that loads a whole history to show
 * ten lines is the shape that gets slow silently.
 */
export async function getPublicationAudit(
  chapter: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PublicationAuditRecord[]> {
  if (!canUseDatabase()) {
    return [];
  }

  const rows = await createDb()
    .select()
    .from(contentPublicationAuditTable)
    .where(eq(contentPublicationAuditTable.chapter, chapter))
    .orderBy(desc(contentPublicationAuditTable.occurredAt))
    .limit(Math.min(options.limit ?? 25, 100))
    .offset(options.offset ?? 0);

  return rows.map((row) => ({
    id: row.id,
    action: row.action as PublicationAuditInput["action"],
    versionId: row.versionId,
    previousVersionId: row.previousVersionId,
    artifactType: row.artifactType,
    chapter: row.chapter,
    slug: row.slug,
    publicationVersion: row.publicationVersion,
    actor: row.actor,
    comment: row.comment,
    contentHash: row.contentHash,
    occurredAt: toIso(row.occurredAt)
  }));
}

// --- Learner activity on a published chapter -------------------------------

export interface ChapterActivityInput {
  module: string;
  chapter: string;
  kind: string;
  artifactId: string;
  succeeded: boolean;
  /** 0–20 when the activity is graded; null for a consultation. */
  score: number | null;
}

export interface ChapterActivityRecord extends ChapterActivityInput {
  id: string;
  occurredAt: string;
}

/**
 * Records one activity.
 *
 * Runs inside `withUserContext`, like every other owned write: the row level
 * security policy of migration 0014 is keyed on `app_current_user_id()`, and a
 * write outside that context is refused by the database rather than landing on
 * somebody else's history.
 *
 * A consultation is deduplicated by the caller, not here: `sheet_viewed` fires
 * on every page load, and one row per reload would make "fiche consultée" the
 * loudest signal in the progression for the least meaningful reason.
 */
export async function recordChapterActivity(
  userId: string,
  activity: ChapterActivityInput
): Promise<PublicationWriteResult> {
  if (!canUseDatabase()) {
    return { status: "unavailable", reason: DATABASE_DISABLED };
  }

  await withUserContext(userId, async (tx) => {
    await tx.insert(chapterActivityEventsTable).values({
      userId,
      module: activity.module,
      chapter: activity.chapter,
      kind: activity.kind,
      artifactId: activity.artifactId,
      succeeded: activity.succeeded,
      score: activity.score === null ? null : activity.score.toFixed(2)
    });
  });

  return { status: "written" };
}

/** Has this learner already recorded this activity on this artifact? */
export async function hasChapterActivity(
  userId: string,
  chapter: string,
  kind: string,
  artifactId: string
): Promise<boolean> {
  if (!canUseDatabase()) {
    return false;
  }

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({ one: sql<number>`1` })
      .from(chapterActivityEventsTable)
      .where(
        and(
          eq(chapterActivityEventsTable.chapter, chapter),
          eq(chapterActivityEventsTable.kind, kind),
          eq(chapterActivityEventsTable.artifactId, artifactId)
        )
      )
      .limit(1);

    return rows.length > 0;
  });
}

/**
 * Everything this learner did on one chapter.
 *
 * Empty without a database, and empty for a visitor with no account — both are
 * truthful, and both make `computeChapterProgress` answer "not started" rather
 * than inventing a figure.
 */
export async function getChapterActivity(
  userId: string,
  module: string,
  chapter: string
): Promise<ChapterActivityRecord[]> {
  if (!canUseDatabase()) {
    return [];
  }

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(chapterActivityEventsTable)
      .where(
        and(
          eq(chapterActivityEventsTable.module, module),
          eq(chapterActivityEventsTable.chapter, chapter)
        )
      )
      .orderBy(desc(chapterActivityEventsTable.occurredAt));

    return rows.map((row) => ({
      id: row.id,
      module: row.module,
      chapter: row.chapter,
      kind: row.kind,
      artifactId: row.artifactId,
      succeeded: row.succeeded,
      score: row.score === null ? null : Number(row.score),
      occurredAt: toIso(row.occurredAt)
    }));
  });
}

// --- Error journal and remediation for a published chapter -----------------
//
// Both reuse the tables PR-03 and PR-04 already own — `error_journal` and
// `remediation_tasks` — rather than adding a chapter-specific pair. A learner
// who fails a published exercise and a learner who fails a catalogue one have
// made the same kind of mistake, and giving them two separate journals to
// consult would be one journal too many.

export interface ChapterErrorJournalInput {
  exerciseId: string;
  correctionId: string;
  category: string;
  summary: string;
  competencyIds: string[];
  nextAction: string;
}

/**
 * Adds one entry to the learner's error journal.
 *
 * The id is derived from the correction id and the category so a second failure
 * on the same artifact updates the entry instead of stacking a duplicate: an
 * exercise failed four times is one thing to revisit, not four.
 */
export async function addErrorJournalEntry(
  userId: string,
  entry: ChapterErrorJournalInput
): Promise<boolean> {
  if (!canUseDatabase()) {
    return false;
  }

  await withUserContext(userId, async (tx) => {
    await tx
      .insert(errorJournalTable)
      .values({
        id: `${entry.correctionId}-${entry.category}`,
        userId,
        exerciseId: entry.exerciseId,
        correctionId: entry.correctionId,
        category: entry.category,
        summary: entry.summary,
        competencyIds: entry.competencyIds,
        nextAction: entry.nextAction
      })
      .onConflictDoUpdate({
        target: errorJournalTable.id,
        set: {
          summary: entry.summary,
          nextAction: entry.nextAction,
          competencyIds: entry.competencyIds
        }
      });
  });

  return true;
}

export interface ChapterRemediationInput {
  /** The published version that was failed. */
  artifactId: string;
  competencyId: string | null;
  microLesson: string;
  nextAction: string;
  /** The retest date: the same day the item itself comes back. */
  dueAt: string;
}

/**
 * Opens — or refreshes — the one remediation task a failed chapter activity
 * earns.
 *
 * One open task per (user, item), like `openRemediationTask` in the review
 * repository: a learner who fails the same exercise three times needs one thing
 * to do, dated on the most recent retest, not three identical lines.
 */
export async function openChapterRemediation(
  userId: string,
  input: ChapterRemediationInput
): Promise<boolean> {
  if (!canUseDatabase()) {
    return false;
  }

  await withUserContext(userId, async (tx) => {
    const open = await tx
      .select({ id: remediationTasksTable.id })
      .from(remediationTasksTable)
      .where(
        and(
          eq(remediationTasksTable.itemType, "exercise"),
          eq(remediationTasksTable.itemRef, input.artifactId),
          eq(remediationTasksTable.status, "open")
        )
      )
      .limit(1);

    if (open[0]) {
      await tx
        .update(remediationTasksTable)
        .set({
          dueAt: input.dueAt,
          microLesson: input.microLesson,
          nextAction: input.nextAction
        })
        .where(eq(remediationTasksTable.id, open[0].id));

      return;
    }

    await tx.insert(remediationTasksTable).values({
      userId,
      itemType: "exercise",
      itemRef: input.artifactId,
      competencyId: input.competencyId,
      reason: "failed-attempt",
      microLesson: input.microLesson,
      nextAction: input.nextAction,
      exerciseId: input.artifactId,
      status: "open",
      dueAt: input.dueAt
    });
  });

  return true;
}

// --- Spaced repetition for published flashcards ----------------------------
//
// The schedule lives in `review_queue`, the PR-04 table, keyed on the published
// version id. It is not a second queue: `(item_type, item_ref)` is exactly the
// shape that table was built for, and `source` distinguishes where an entry came
// from. A published card and a catalogue card are scheduled by the same ladder,
// stored in the same place, and readable by the same query.
//
// Without this, the interval shown after a self-assessment was theatre: the
// number came from `REVIEW_INTERVAL_DAYS` and was never written anywhere, so
// reopening the session offered every card again as if nothing had been rated.

export interface ChapterCardReviewInput {
  /** The published version id of the card. */
  artifactId: string;
  rating: string;
  reviewedAt: string;
  dueAt: string;
  intervalDays: number;
  /** True when the learner rated `forgotten`. */
  lapsed: boolean;
}

/**
 * Records one self-assessment of a published card.
 *
 * `onConflictDoUpdate` on the table's own unique key: one row per (learner,
 * card), updated in place. The counters only ever move forward — a re-review
 * must not reset the history it is part of.
 */
export async function recordChapterCardReview(
  userId: string,
  input: ChapterCardReviewInput
): Promise<PublicationWriteResult> {
  if (!canUseDatabase()) {
    return { status: "unavailable", reason: DATABASE_DISABLED };
  }

  await withUserContext(userId, async (tx) => {
    await tx
      .insert(reviewQueueTable)
      .values({
        userId,
        itemType: "flashcard",
        itemRef: input.artifactId,
        dueAt: input.dueAt,
        intervalDays: input.intervalDays,
        lastRating: input.rating,
        lastReviewedAt: input.reviewedAt,
        reviewCount: 1,
        lapseCount: input.lapsed ? 1 : 0,
        source: "published"
      })
      .onConflictDoUpdate({
        target: [reviewQueueTable.userId, reviewQueueTable.itemType, reviewQueueTable.itemRef],
        set: {
          dueAt: input.dueAt,
          intervalDays: input.intervalDays,
          lastRating: input.rating,
          lastReviewedAt: input.reviewedAt,
          reviewCount: sql`${reviewQueueTable.reviewCount} + 1`,
          lapseCount: input.lapsed
            ? sql`${reviewQueueTable.lapseCount} + 1`
            : reviewQueueTable.lapseCount
        }
      });
  });

  return { status: "written" };
}

export interface ChapterCardSchedule {
  artifactId: string;
  dueAt: string;
  intervalDays: number;
  lastRating: string | null;
  reviewCount: number;
}

/**
 * The schedule of the cards this learner has already rated, among those given.
 *
 * Scoped to the ids the chapter actually publishes: a learner who worked on a
 * card that has since been archived should not have it resurface, and querying
 * the whole queue to filter in memory would return every card of every module.
 */
export async function getChapterCardSchedules(
  userId: string,
  artifactIds: readonly string[]
): Promise<ChapterCardSchedule[]> {
  if (!canUseDatabase() || artifactIds.length === 0) {
    return [];
  }

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({
        itemRef: reviewQueueTable.itemRef,
        dueAt: reviewQueueTable.dueAt,
        intervalDays: reviewQueueTable.intervalDays,
        lastRating: reviewQueueTable.lastRating,
        reviewCount: reviewQueueTable.reviewCount
      })
      .from(reviewQueueTable)
      .where(
        and(
          eq(reviewQueueTable.itemType, "flashcard"),
          inArray(reviewQueueTable.itemRef, [...artifactIds])
        )
      );

    return rows.map((row) => ({
      artifactId: row.itemRef,
      dueAt: toIso(row.dueAt),
      intervalDays: row.intervalDays,
      lastRating: row.lastRating,
      reviewCount: row.reviewCount
    }));
  });
}

// --- Reading published content ---------------------------------------------
//
// THIS IS THE PRODUCTION SOURCE OF TRUTH. The committed store under
// `content/published/` is a development and test convenience; a deployment
// serves what this table holds. The two are kept apart deliberately: a file
// store is reviewable in a diff and needs no database, but it cannot be
// queried, cannot enforce "one active version" across concurrent publishers,
// and travels with the bundle rather than with the data. Production wants the
// second set of properties.
//
// Every read below filters on `status = 'published'`. A caller cannot ask for a
// draft or an archived version, because no function here offers one.

export interface PublishedVersionRow {
  id: string;
  sourceArtifactId: string;
  artifactType: string;
  title: string;
  slug: string;
  domain: string;
  module: string;
  chapter: string;
  chapterLabel: string;
  contentSnapshot: unknown;
  sourceReferencesSnapshot: unknown;
  publicationVersion: number;
  publishedAt: string;
  publishedBy: string;
  generationMetadataSnapshot: unknown;
  validationMetadataSnapshot: unknown;
  reviewMetadataSnapshot: unknown;
  contentHash: string;
  status: string;
  previousPublishedVersionId: string | null;
  archivedAt: string | null;
  normativeContextSnapshot: unknown | null;
  normativeProfile: string | null;
  scoringPolicy: string | null;
}

/**
 * Summary columns — what a chapter page needs to decide what it offers, without
 * loading a single content snapshot.
 *
 * The JSON columns are deliberately absent: listing a chapter's twenty
 * activities would otherwise drag twenty full snapshots across the wire to
 * render a tab bar.
 */
export interface PublishedVersionSummary {
  id: string;
  artifactType: string;
  module: string;
  chapter: string;
  slug: string;
  title: string;
  publicationVersion: number;
  publishedAt: string;
  contentHash: string;
  /**
   * Le référentiel, sans ouvrir l'instantané.
   *
   * `null` sur une ligne antérieure à la migration 0015 : l'appelant la lit
   * alors comme le référentiel en vigueur, ce qu'elle signifiait quand elle a
   * été écrite. Le magasin de fichiers porte les deux mêmes champs dans son
   * index, pour que les deux pilotes répondent la même chose.
   */
  normativeProfile: string | null;
  scoringPolicy: string | null;
}

const summaryColumns = {
  id: publishedContentVersionsTable.id,
  artifactType: publishedContentVersionsTable.artifactType,
  module: publishedContentVersionsTable.module,
  chapter: publishedContentVersionsTable.chapter,
  slug: publishedContentVersionsTable.slug,
  title: publishedContentVersionsTable.title,
  publicationVersion: publishedContentVersionsTable.publicationVersion,
  publishedAt: publishedContentVersionsTable.publishedAt,
  contentHash: publishedContentVersionsTable.contentHash,
  normativeProfile: publishedContentVersionsTable.normativeProfile,
  scoringPolicy: publishedContentVersionsTable.scoringPolicy
};

/**
 * Raised when the database is the configured source of truth and a read fails.
 *
 * Distinct from "returns nothing": a chapter with no published content and a
 * chapter whose store is unreachable are different facts, and a page that shows
 * the same empty state for both tells the reader a falsehood. The message
 * carries no connection string — the cause is logged server-side, never
 * rendered.
 */
export class PublishedContentUnavailableError extends Error {
  constructor(readonly reason: unknown) {
    super("le contenu publié est momentanément indisponible");
    this.name = "PublishedContentUnavailableError";
  }
}

/** Active versions of one chapter, summary columns only. */
export async function listPublishedChapterVersions(
  module: string,
  chapter: string
): Promise<PublishedVersionSummary[]> {
  try {
    const rows = await createDb()
      .select(summaryColumns)
      .from(publishedContentVersionsTable)
      .where(
        and(
          eq(publishedContentVersionsTable.module, module),
          eq(publishedContentVersionsTable.chapter, chapter),
          eq(publishedContentVersionsTable.status, "published")
        )
      )
      .orderBy(asc(publishedContentVersionsTable.slug));

    return rows.map((row) => ({ ...row, publishedAt: toIso(row.publishedAt) }));
  } catch (error) {
    throw new PublishedContentUnavailableError(error);
  }
}

/** Active versions of a whole module, summary columns only. */
export async function listPublishedModuleVersions(
  module: string
): Promise<PublishedVersionSummary[]> {
  try {
    const rows = await createDb()
      .select(summaryColumns)
      .from(publishedContentVersionsTable)
      .where(
        and(
          eq(publishedContentVersionsTable.module, module),
          eq(publishedContentVersionsTable.status, "published")
        )
      )
      .orderBy(asc(publishedContentVersionsTable.chapter), asc(publishedContentVersionsTable.slug));

    return rows.map((row) => ({ ...row, publishedAt: toIso(row.publishedAt) }));
  } catch (error) {
    throw new PublishedContentUnavailableError(error);
  }
}

/**
 * One active version, in full.
 *
 * `status = 'published'` is part of the predicate rather than checked by the
 * caller: an archived version must be unreachable *by id*, or an identifier
 * captured before an archival would stay a door onto withdrawn content.
 */
export async function getPublishedVersion(id: string): Promise<PublishedVersionRow | undefined> {
  try {
    const rows = await createDb()
      .select()
      .from(publishedContentVersionsTable)
      .where(
        and(
          eq(publishedContentVersionsTable.id, id),
          eq(publishedContentVersionsTable.status, "published")
        )
      )
      .limit(1);

    const row = rows[0];

    return row
      ? {
          ...row,
          publishedAt: toIso(row.publishedAt),
          archivedAt: row.archivedAt === null ? null : toIso(row.archivedAt)
        }
      : undefined;
  } catch (error) {
    throw new PublishedContentUnavailableError(error);
  }
}

/** Every version of one logical identity, active and archived, newest first. */
export async function getPublishedVersionHistory(
  artifactType: string,
  chapter: string,
  slug: string
): Promise<
  Array<PublishedVersionSummary & { status: string; archivedAt: string | null; publishedBy: string }>
> {
  try {
    const rows = await createDb()
      .select({
        ...summaryColumns,
        status: publishedContentVersionsTable.status,
        archivedAt: publishedContentVersionsTable.archivedAt,
        publishedBy: publishedContentVersionsTable.publishedBy
      })
      .from(publishedContentVersionsTable)
      .where(
        and(
          eq(publishedContentVersionsTable.artifactType, artifactType),
          eq(publishedContentVersionsTable.chapter, chapter),
          eq(publishedContentVersionsTable.slug, slug)
        )
      )
      .orderBy(desc(publishedContentVersionsTable.publicationVersion));

    return rows.map((row) => ({
      ...row,
      publishedAt: toIso(row.publishedAt),
      archivedAt: row.archivedAt === null ? null : toIso(row.archivedAt)
    }));
  } catch (error) {
    throw new PublishedContentUnavailableError(error);
  }
}
