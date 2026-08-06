import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSourceEnvelope,
  createContentProvider,
  CURRENT_PROMPT_VERSIONS,
  generateDrafts,
  generationKinds,
  getPrompt,
  listDrafts,
  LiveProviderUnavailableError,
  MockContentProvider,
  parseKinds,
  PROMPT_KEYS,
  renderEnvelope,
  restrictKindsForDomain,
  saveDrafts,
  SHARED_RULES,
  applyTransition,
  writeDraft,
  type ContentDraft
} from "../src";
import { testCorpus } from "./fixtures";

const NOW = () => new Date("2026-08-05T10:00:00.000Z");

function envelope() {
  return buildSourceEnvelope(testCorpus, {
    chapterSlug: "les-emprunts-obligataires",
    chapterLabel: "Les emprunts obligataires",
    sourcePackId: "test-pack"
  });
}

describe("enveloppe de sources", () => {
  it("ne mélange pas les chapitres et reste déterministe", () => {
    const first = envelope();
    const second = envelope();

    expect(first.inputHash).toEqual(second.inputHash);
    expect(first.documents).toHaveLength(2);
    expect(first.documents.every((document) => document.chunks.length > 0)).toBe(true);
  });

  it("place le cours avant les énoncés", () => {
    expect(envelope().documents[0].category).toBe("course");
  });

  it("refuse un chapitre absent du corpus", () => {
    expect(() =>
      buildSourceEnvelope(testCorpus, {
        chapterSlug: "chapitre-inexistant",
        chapterLabel: "Inexistant",
        sourcePackId: "test-pack"
      })
    ).toThrow(/aucun document/);
  });

  it("consigne ce qui est exclu plutôt que de tronquer en silence", () => {
    const tight = buildSourceEnvelope(testCorpus, {
      chapterSlug: "les-emprunts-obligataires",
      chapterLabel: "Les emprunts obligataires",
      sourcePackId: "test-pack",
      maxInputChars: 40
    });

    expect(tight.excluded.length).toBeGreaterThan(0);
    expect(tight.excluded[0].reason).toContain("limite");
  });

  it("signale les pages dégradées au générateur", () => {
    expect(renderEnvelope(envelope())).toContain("extraction dégradée");
  });

  it("ne transmet aucun chemin de fichier au générateur", () => {
    const rendered = renderEnvelope(envelope());
    expect(rendered).not.toContain(".pdf");
    expect(rendered).not.toMatch(/[A-Za-z]:[\\/]/);
  });

  it("transmet la liste fermée des templates de calcul autorisés", () => {
    expect(renderEnvelope(envelope())).toContain("TEMPLATES DE CALCUL AUTORISÉS");
  });
});

describe("prompts versionnés", () => {
  it("expose une version pour chaque famille de contenu", () => {
    for (const [id, version] of Object.entries(CURRENT_PROMPT_VERSIONS)) {
      const prompt = getPrompt(id, version);
      expect(prompt, `${id}.${version}`).toBeDefined();
      expect(prompt?.version).toMatch(/^v\d+$/);
    }
  });

  it("porte les consignes de non-invention et de citation dans chaque prompt", () => {
    expect(SHARED_RULES).toContain("NON-INVENTION");
    expect(SHARED_RULES).toContain("CITATION OBLIGATOIRE");

    for (const key of PROMPT_KEYS) {
      const [id, version] = key.split(".");
      const prompt = getPrompt(id, version);
      expect(prompt?.systemPrompt).toContain("NON-INVENTION");
      expect(prompt?.systemPrompt).toContain("JSON UNIQUEMENT");
    }
  });
});

describe("provider", () => {
  it("génère en mock sans aucune clé d'API", async () => {
    const provider = createContentProvider("mock", {});
    expect(provider.mode).toBe("mock");
    expect(provider).toBeInstanceOf(MockContentProvider);
  });

  it("refuse le mode live tant que CONTENT_AI_ENABLED n'est pas activé", () => {
    expect(() => createContentProvider("live", {})).toThrow(LiveProviderUnavailableError);
    expect(() => createContentProvider("live", { CONTENT_AI_ENABLED: "false" })).toThrow(
      /CONTENT_AI_ENABLED/
    );
  });

  it("refuse le mode live si aucun fournisseur réel n'est configuré", () => {
    expect(() =>
      createContentProvider("live", { CONTENT_AI_ENABLED: "true", CONTENT_AI_PROVIDER: "openai" })
    ).toThrow(/n'est pas configuré/);
  });
});

describe("génération de brouillons", () => {
  it("produit des brouillons validés et conserve prompt, version et empreinte", async () => {
    const { drafts } = await generateDrafts({
      kinds: ["flashcards"],
      envelope: envelope(),
      corpus: testCorpus,
      provider: new MockContentProvider(),
      now: NOW
    });

    expect(drafts.length).toBeGreaterThan(0);

    for (const draft of drafts) {
      expect(draft.generationMetadata.mode).toBe("mock");
      expect(draft.generationMetadata.promptId).toBe("flashcard-atomic");
      expect(draft.generationMetadata.promptVersion).toBe("v1");
      expect(draft.generationMetadata.inputHash).toMatch(/^[a-f0-9]{64}$/);
      // Aucun brouillon ne naît approuvé ni publié.
      expect(["needs_review", "validation_failed"]).toContain(draft.status);
      expect(draft.history[0].toStatus).toBe("draft");
    }
  });

  it("ne produit jamais un contenu directement approuvé", async () => {
    const { drafts } = await generateDrafts({
      kinds: ["flashcards", "calculations"],
      envelope: envelope(),
      corpus: testCorpus,
      provider: new MockContentProvider(),
      now: NOW
    });

    expect(drafts.some((draft) => draft.status === "approved")).toBe(false);
  });

  it("ne place aucun chemin absolu dans les objets générés", async () => {
    const { drafts } = await generateDrafts({
      kinds: ["flashcards"],
      envelope: envelope(),
      corpus: testCorpus,
      provider: new MockContentProvider(),
      now: NOW
    });

    const serialized = JSON.stringify(drafts);
    expect(serialized).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(serialized).not.toMatch(/\/(home|Users)\//);
  });

  it("interprète les alias de types et refuse un type inconnu", () => {
    expect(parseKinds("fiche,cards")).toEqual(["sheet", "flashcards"]);
    expect(parseKinds(undefined)).toContain("case");
    expect(() => parseKinds("poeme")).toThrow(/inconnu/);
  });
});

describe("stockage des brouillons", () => {
  async function store() {
    const rootDir = await mkdtemp(join(tmpdir(), "content-drafts-"));
    return { rootDir, packId: "test-pack", chapterSlug: "les-emprunts-obligataires" };
  }

  async function firstDraft(): Promise<ContentDraft> {
    const { drafts } = await generateDrafts({
      kinds: ["flashcards"],
      envelope: envelope(),
      corpus: testCorpus,
      provider: new MockContentProvider(),
      now: NOW
    });
    return drafts[0];
  }

  it("écrit puis relit un brouillon à l'identique", async () => {
    const options = await store();
    const draft = await firstDraft();

    await saveDrafts(options, [draft], { force: false });
    const reloaded = await listDrafts(options);

    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].id).toBe(draft.id);
  });

  it("n'écrase JAMAIS un contenu approuvé, même avec --force", async () => {
    const options = await store();
    const draft = await firstDraft();

    const approved = applyTransition({
      draft,
      to: "approved",
      actor: "relecteur@example.test",
      occurredAt: "2026-08-05T11:00:00.000Z"
    });
    await writeDraft(options, approved);

    const summary = await saveDrafts(options, [{ ...draft, title: "Version régénérée" }], { force: true });

    expect(summary.skippedApproved).toBe(1);
    expect(summary.revised).toBe(0);

    const reloaded = await listDrafts(options);
    expect(reloaded[0].status).toBe("approved");
    expect(reloaded[0].title).toBe(approved.title);
  });

  it("laisse un brouillon existant intact sans --force", async () => {
    const options = await store();
    const draft = await firstDraft();

    await saveDrafts(options, [draft], { force: false });
    const summary = await saveDrafts(options, [draft], { force: false });

    expect(summary.skippedExisting).toBe(1);
    expect(summary.created).toBe(0);
  });

  it("crée une révision numérotée avec --force, en conservant l'historique", async () => {
    const options = await store();
    const draft = await firstDraft();

    await saveDrafts(options, [draft], { force: false });
    const summary = await saveDrafts(options, [draft], { force: true });

    expect(summary.revised).toBe(1);

    const reloaded = await listDrafts(options);
    expect(reloaded[0].reviewMetadata.revision).toBe(2);
    expect(reloaded[0].history.length).toBeGreaterThan(draft.history.length);
    expect(reloaded[0].createdAt).toBe(draft.createdAt);
  });

  it("écrit des fichiers JSON conformes au schéma du brouillon", async () => {
    const options = await store();
    const draft = await firstDraft();
    await saveDrafts(options, [draft], { force: false });

    const directory = join(options.rootDir, options.packId, options.chapterSlug);
    const files = await readdir(directory);

    expect(files).toContain(`${draft.id}.json`);
    const parsed = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
    expect(parsed.status).not.toBe("published");
  });
});

describe("restriction du domaine ISO", () => {
  const allKinds = [...generationKinds];

  it("n'autorise que la fiche de synthèse sur un chapitre ISO", () => {
    // AGENTS.md : « ISO content must be handled as notes/checklists unless
    // licensed text is explicitly allowed. »
    const restriction = restrictKindsForDomain(allKinds, "iso");

    expect(restriction.allowed).toEqual(["sheet"]);
    expect(restriction.refused).toContain("flashcards");
    expect(restriction.refused).toContain("calculations");
    expect(restriction.refused).toContain("case");
    expect(restriction.reason).toContain("ISO");
  });

  it("lève la restriction seulement sur déclaration explicite de licence", () => {
    const licensed = restrictKindsForDomain(allKinds, "iso", { ISO_LICENSED_TEXT_ALLOWED: "true" });

    expect(licensed.allowed).toEqual(allKinds);
    expect(licensed.refused).toEqual([]);

    // Toute autre valeur ne vaut pas autorisation.
    expect(restrictKindsForDomain(allKinds, "iso", { ISO_LICENSED_TEXT_ALLOWED: "oui" }).allowed).toEqual([
      "sheet"
    ]);
  });

  it("ne restreint aucun autre domaine", () => {
    for (const domain of ["compta-generale", "compta-analytique", "ifrs-ias", "fiscalite"]) {
      expect(restrictKindsForDomain(allKinds, domain).refused, domain).toEqual([]);
    }
  });
});
