import { and, eq, sql } from "drizzle-orm";
import { parseCellKey } from "@finance/domain";
import { canUseDatabase } from "./client";
import { labWorkbooksTable } from "./drizzle-schema";
import { withUserContext } from "./user-context";

/**
 * The learner's grid drafts (PR-12b).
 *
 * Every function is guarded by `canUseDatabase()` and returns its empty value
 * in seeded mode — the same convention as every repository here. A grid that
 * cannot be saved is not an error; it is the lab as it always worked, starting
 * empty on each visit.
 *
 * The stored shape is the raw inputs, exactly as typed: `{"B12": "=SOMME(...)"}`.
 * Nothing evaluated is stored, because a stored result could disagree with what
 * the engine computes after a content update, and a draft must never look like
 * an authority on values.
 */

/** Mirror of the submission bounds in `app/api/exercises/attempts/route.ts`. */
const MAX_DRAFT_CELLS = 40;
const MAX_DRAFT_INPUT_LENGTH = 200;

export type WorkbookDraftCells = Record<string, string | number>;

export class InvalidWorkbookDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkbookDraftError";
  }
}

export function assertValidDraftCells(cells: WorkbookDraftCells): void {
  const entries = Object.entries(cells);

  if (entries.length > MAX_DRAFT_CELLS) {
    throw new InvalidWorkbookDraftError(
      `Un brouillon est limité à ${MAX_DRAFT_CELLS} cellules (${entries.length} reçues).`
    );
  }

  for (const [key, value] of entries) {
    if (!parseCellKey(key)) {
      throw new InvalidWorkbookDraftError(`« ${key} » n'est pas une référence de cellule.`);
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new InvalidWorkbookDraftError(`La cellule ${key} porte un nombre non fini.`);
      }
    } else if (typeof value === "string") {
      if (value.length > MAX_DRAFT_INPUT_LENGTH) {
        throw new InvalidWorkbookDraftError(
          `La cellule ${key} dépasse ${MAX_DRAFT_INPUT_LENGTH} caractères.`
        );
      }
    } else {
      throw new InvalidWorkbookDraftError(`La cellule ${key} doit contenir un texte ou un nombre.`);
    }
  }
}

/** The saved draft for one exercise, or null — no database, or nothing saved. */
export async function getWorkbookDraft(
  userId: string,
  exerciseId: string
): Promise<WorkbookDraftCells | null> {
  if (!canUseDatabase()) {
    return null;
  }

  return withUserContext(userId, async (db) => {
    const rows = await db
      .select({ cells: labWorkbooksTable.cellsJson })
      .from(labWorkbooksTable)
      .where(
        and(eq(labWorkbooksTable.userId, userId), eq(labWorkbooksTable.exerciseId, exerciseId))
      )
      .limit(1);

    const cells = rows[0]?.cells;

    return cells && typeof cells === "object" ? (cells as WorkbookDraftCells) : null;
  });
}

/**
 * Saves (or replaces) the draft for one exercise. Returns whether anything was
 * persisted, with the reason when nothing was — the caller surfaces it as an
 * ordinary state, not a failure.
 */
export async function saveWorkbookDraft(
  userId: string,
  exerciseId: string,
  cells: WorkbookDraftCells
): Promise<{ saved: boolean; reason: string | null }> {
  if (!canUseDatabase()) {
    return { saved: false, reason: "database-disabled" };
  }

  assertValidDraftCells(cells);

  await withUserContext(userId, async (db) => {
    await db
      .insert(labWorkbooksTable)
      .values({ userId, exerciseId, cellsJson: cells })
      .onConflictDoUpdate({
        target: [labWorkbooksTable.userId, labWorkbooksTable.exerciseId],
        set: { cellsJson: cells, updatedAt: sql`now()` }
      });
  });

  return { saved: true, reason: null };
}
