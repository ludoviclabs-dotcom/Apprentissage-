import "server-only";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyAnnotationTransition,
  correctAnnotation,
  pageImageHash,
  visualAnnotationPlanSchema,
  type AnnotationReviewStatus,
  type VisualAnnotation,
  type VisualAnnotationPlan
} from "@finance/content-generation";
import { notFound } from "next/navigation";
import { resolveAdmin } from "@/lib/auth/require-admin";
import { getEnv } from "@/lib/env";

/**
 * Accès serveur aux annotations de sources visuelles.
 *
 * Le magasin est le plan lui-même, sous `data/generated/review/`, hors Git —
 * comme les brouillons de contenu. Ce module est la seule porte : il ne rend
 * jamais un chemin de fichier, seulement des annotations et des images, pour
 * qu'aucune information sur l'arborescence privée n'atteigne le navigateur.
 */

function repoDataDir(): string {
  const candidates = [join(process.cwd(), "..", "..", "data"), join(process.cwd(), "data")];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const PLAN_PATH = join(repoDataDir(), "generated", "review", "titres-visual-annotation-plan.json");
const VISUAL_ROOT = join(repoDataDir(), "generated", "visual");

/** Le plan complet, ou `undefined` quand aucun n'a été produit ici. */
export async function loadPlan(): Promise<VisualAnnotationPlan | undefined> {
  if (!existsSync(PLAN_PATH)) {
    return undefined;
  }

  return visualAnnotationPlanSchema.parse(JSON.parse(await readFile(PLAN_PATH, "utf8")));
}

/**
 * Écriture par fichier temporaire puis renommage : un lecteur concurrent voit
 * soit l'ancien plan, soit le nouveau, jamais un fichier tronqué. Les décisions
 * survivent au redémarrage puisqu'elles sont sur disque, pas en mémoire.
 */
async function writePlan(plan: VisualAnnotationPlan, raw: Record<string, unknown>): Promise<void> {
  const merged = { ...raw, annotations: plan.annotations };
  const temporary = `${PLAN_PATH}.tmp`;

  await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  await rename(temporary, PLAN_PATH);
}

export async function findAnnotation(annotationId: string): Promise<VisualAnnotation | undefined> {
  return (await loadPlan())?.annotations.find((annotation) => annotation.annotationId === annotationId);
}

/**
 * L'empreinte du rendu actuellement sur disque.
 *
 * `undefined` quand aucun rendu n'existe : l'appelant doit distinguer « le
 * rendu a changé » de « il n'y a pas de rendu », et l'approbation refuse les
 * deux — mais pas pour la même raison.
 */
export async function currentImageHash(annotation: VisualAnnotation): Promise<string | undefined> {
  const image = await readImage(annotation);
  return image ? pageImageHash(image) : undefined;
}

/**
 * Le PNG de la page, résolu côté serveur.
 *
 * Le nom de fichier n'est jamais pris d'une requête : il est dérivé de
 * l'identifiant de document et du numéro de page portés par l'annotation
 * elle-même. Un identifiant fabriqué ne peut donc pas remonter l'arborescence.
 */
export async function readImage(annotation: VisualAnnotation): Promise<Uint8Array | undefined> {
  const safeDocument = annotation.documentId.replace(/[^a-zA-Z0-9-]/g, "");
  const file = `${safeDocument}-p${String(annotation.pageNumber).padStart(2, "0")}.png`;
  const path = join(VISUAL_ROOT, "titres", file);

  if (!existsSync(path)) {
    return undefined;
  }

  return new Uint8Array(await readFile(path));
}

export interface AnnotationDecision {
  annotationId: string;
  to: Extract<AnnotationReviewStatus, "approved" | "rejected" | "needs_human_review">;
  actor: string;
  reason?: string;
}

/** Applique une décision et la persiste. Lève si la machine à états refuse. */
export async function decide(decision: AnnotationDecision): Promise<VisualAnnotation> {
  const raw = JSON.parse(await readFile(PLAN_PATH, "utf8")) as Record<string, unknown>;
  const plan = visualAnnotationPlanSchema.parse(raw);
  const index = plan.annotations.findIndex(
    (annotation) => annotation.annotationId === decision.annotationId
  );

  if (index === -1) {
    throw new Error(`annotation « ${decision.annotationId} » introuvable`);
  }

  const annotation = plan.annotations[index];
  const updated = applyAnnotationTransition({
    annotation,
    to: decision.to,
    actor: decision.actor,
    occurredAt: new Date().toISOString(),
    reason: decision.reason,
    renderedImageHash: await currentImageHash(annotation)
  });

  plan.annotations[index] = updated;
  await writePlan(plan, raw);

  return updated;
}

export interface AnnotationCorrection {
  annotationId: string;
  transcription?: string | null;
  structuredFacts?: VisualAnnotation["structuredFacts"];
  confidence?: VisualAnnotation["confidence"];
}

export async function correct(correction: AnnotationCorrection): Promise<VisualAnnotation> {
  const raw = JSON.parse(await readFile(PLAN_PATH, "utf8")) as Record<string, unknown>;
  const plan = visualAnnotationPlanSchema.parse(raw);
  const index = plan.annotations.findIndex(
    (annotation) => annotation.annotationId === correction.annotationId
  );

  if (index === -1) {
    throw new Error(`annotation « ${correction.annotationId} » introuvable`);
  }

  const { annotationId: _id, ...changes } = correction;
  const updated = correctAnnotation(plan.annotations[index], changes);

  plan.annotations[index] = updated;
  await writePlan(plan, raw);

  return updated;
}

/** Vrai quand le rendu ne correspond plus à ce sur quoi l'annotation porte. */
export function isStale(annotation: VisualAnnotation, renderedHash: string | undefined): boolean {
  if (annotation.pageImageHash === null) {
    return false;
  }

  return renderedHash !== undefined && renderedHash !== annotation.pageImageHash;
}

/**
 * Ordre de revue : le bloquant d'abord, puis l'incertain.
 *
 * Rien n'est masqué. Un tri qui reléguerait les cas difficiles en fin de file
 * les ferait traiter en dernier, quand l'attention baisse — l'inverse de ce
 * qu'on veut.
 */
const PRIORITY_RANK: Record<VisualAnnotation["priority"], number> = {
  BLOCKING: 0,
  USEFUL: 1,
  OPTIONAL: 2
};

const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

export function sortForReview(annotations: readonly VisualAnnotation[]): VisualAnnotation[] {
  return [...annotations].sort((left, right) => {
    const byPriority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];

    if (byPriority !== 0) {
      return byPriority;
    }

    const byConfidence =
      (CONFIDENCE_RANK[left.confidence ?? "low"] ?? 0) - (CONFIDENCE_RANK[right.confidence ?? "low"] ?? 0);

    return byConfidence !== 0 ? byConfidence : left.annotationId.localeCompare(right.annotationId);
  });
}

export function digest(image: Uint8Array): string {
  return createHash("sha256").update(image).digest("hex");
}

/**
 * Garde d'accès, identique à celle de la relecture de contenu : drapeau
 * d'instance puis rôle administrateur, et 404 plutôt que 403 — annoncer
 * « interdit » confirmerait que l'espace existe.
 */
export async function requireAnnotationAccess(): Promise<{ actor: string }> {
  if (!getEnv().CONTENT_REVIEW_ENABLED) {
    notFound();
  }

  const admin = await resolveAdmin();

  if (!admin) {
    notFound();
  }

  return { actor: admin.actor };
}

export async function requireAnnotationApiAccess(): Promise<
  { actor: string; response?: never } | { actor?: never; response: Response }
> {
  const refusal = Response.json({ error: "Ressource introuvable" }, { status: 404 });

  if (!getEnv().CONTENT_REVIEW_ENABLED) {
    return { response: refusal };
  }

  const admin = await resolveAdmin();

  return admin ? { actor: admin.actor } : { response: refusal };
}
