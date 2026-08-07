import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ManualAssistedContentProvider, manualPayloadPath } from "../src/providers/manual-assisted";
import { createContentProvider, LiveProviderUnavailableError } from "../src/providers";
import { isPublishableGenerationMode, publishableGenerationModes } from "../src/types/metadata";
import type { GenerationRequest } from "../src/providers/types";
import type { SourceEnvelope } from "../src/envelope/build";

/**
 * Le mode assisté.
 *
 * Ce qui est vérifié ici est ce qui le distingue d'un mock renommé : l'absence
 * de charge utile est un échec et non un repli sur une fixture, une charge utile
 * hors schéma est refusée sans réparation, et le modèle rapporté porte
 * l'empreinte du fichier lu. Les fixtures de ce fichier sont fictives — aucun
 * extrait du corpus privé n'y figure.
 */

const PROMPT = { id: "flashcard-atomic", version: "v1" } as const;

const envelope = {
  sourcePackId: "pack-test",
  chapterSlug: "chapitre-test"
} as unknown as SourceEnvelope;

const schema = z.object({ cards: z.array(z.object({ front: z.string().min(1) })).min(1) });

function requestFor(): GenerationRequest<z.infer<typeof schema>> {
  return {
    schema,
    prompt: PROMPT as unknown as GenerationRequest<unknown>["prompt"],
    instruction: "consigne de test",
    envelope,
    label: "test"
  };
}

describe("provider assisté", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "manual-assisted-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writePayload(value: unknown): Promise<void> {
    const path = manualPayloadPath(root, "pack-test", "chapitre-test", PROMPT.id);
    await mkdir(join(root, "pack-test", "chapitre-test"), { recursive: true });
    await writeFile(path, typeof value === "string" ? value : JSON.stringify(value), "utf8");
  }

  it("refuse quand aucune charge utile n'a été rédigée, sans retomber sur une fixture", async () => {
    const provider = new ManualAssistedContentProvider({ rootDir: root, author: "auteur-test" });
    const result = await provider.generateStructuredContent(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toMatch(/aucune charge utile rédigée/);
    // La preuve que ce n'est pas un mock déguisé : le refus nomme le fichier
    // attendu et ne propose aucun contenu de remplacement.
    expect(result.error).toContain("chapitre-test/flashcard-atomic.json");
    expect(result.error).toMatch(/aucune fixture/i);
  });

  it("ne divulgue pas le chemin absolu du poste dans son refus", async () => {
    const provider = new ManualAssistedContentProvider({ rootDir: root, author: "auteur-test" });
    const result = await provider.generateStructuredContent(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain(root);
  });

  it("accepte une charge utile conforme et rapporte le mode assisté", async () => {
    await writePayload({ cards: [{ front: "recto de test" }] });
    const provider = new ManualAssistedContentProvider({ rootDir: root, author: "auteur-test" });
    const result = await provider.generateStructuredContent(requestFor());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mode).toBe("manual-assisted");
    expect(result.data.cards).toHaveLength(1);
    expect(result.repairAttempts).toBe(0);
  });

  it("fait porter au modèle l'empreinte du fichier lu", async () => {
    const provider = new ManualAssistedContentProvider({ rootDir: root, author: "auteur-test" });

    await writePayload({ cards: [{ front: "première rédaction" }] });
    const first = await provider.generateStructuredContent(requestFor());

    await writePayload({ cards: [{ front: "seconde rédaction" }] });
    const second = await provider.generateStructuredContent(requestFor());

    expect(first.model).toMatch(/^manual-assisted:auteur-test:[a-f0-9]{12}$/);
    // Deux rédactions différentes ne peuvent pas se faire passer l'une pour
    // l'autre dans les métadonnées d'un brouillon.
    expect(second.model).not.toBe(first.model);
  });

  it("refuse une charge utile hors schéma sans tenter de la réparer", async () => {
    await writePayload({ cards: [{ front: "" }] });
    const provider = new ManualAssistedContentProvider({ rootDir: root, author: "auteur-test" });
    const result = await provider.generateStructuredContent(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/ne respecte pas son schéma/);
    expect(result.repairAttempts).toBe(0);
  });

  it("refuse un JSON illisible en le disant", async () => {
    await writePayload("{ ceci n'est pas du JSON");
    const provider = new ManualAssistedContentProvider({ rootDir: root, author: "auteur-test" });
    const result = await provider.generateStructuredContent(requestFor());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/n'est pas un JSON valide/);
  });
});

describe("sélection du provider", () => {
  it("exige une racine et un auteur pour le mode assisté", () => {
    expect(() => createContentProvider("manual-assisted", {})).toThrow(LiveProviderUnavailableError);
  });

  it("construit le provider assisté quand les options sont fournies", () => {
    const provider = createContentProvider("manual-assisted", {}, {
      rootDir: "/quelque/part",
      author: "auteur-test"
    });

    expect(provider.mode).toBe("manual-assisted");
    expect(provider.name).toBe("manual-assisted");
  });

  it("ne demande aucune configuration pour le mock, et ne le rend jamais publiable", () => {
    expect(createContentProvider("mock", {}).mode).toBe("mock");
    expect(isPublishableGenerationMode("mock")).toBe(false);
  });
});

describe("frontière de publication", () => {
  it("n'accepte que live et manual-assisted", () => {
    expect([...publishableGenerationModes]).toEqual(["live", "manual-assisted"]);
    expect(isPublishableGenerationMode("live")).toBe(true);
    expect(isPublishableGenerationMode("manual-assisted")).toBe(true);
    expect(isPublishableGenerationMode("mock")).toBe(false);
    // Un mode inventé plus tard est refusé par défaut : la liste blanche oblige
    // la décision à être prise, plutôt que d'être héritée par oubli.
    expect(isPublishableGenerationMode("nouveau-mode")).toBe(false);
  });
});
