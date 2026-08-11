import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHAPTER_SECTIONS,
  chapterUrl,
  parseSection
} from "@/lib/publication/chapter";
import { COMPTA_APPROFONDIE, getPublicChapter, resolvePublicChapter } from "@finance/content-publication";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const publishedRoot = join(repoRoot, "content", "published");

/**
 * Le site public de « Comptabilité approfondie ».
 *
 * Trois familles de garanties, et deux d'entre elles sont structurelles plutôt
 * que comportementales : ce qui empêche une page publique de lire un brouillon
 * n'est pas un filtre `WHERE`, c'est l'absence de tout chemin d'import qui l'y
 * mènerait. Un test qui vérifierait seulement « la page n'affiche pas de
 * brouillon » raterait le jour où quelqu'un ajoute l'import.
 */

function trackedSources(directory: string): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", directory],
    { cwd: repoRoot, encoding: "utf8" }
  )
    .split("\n")
    .map((file) => file.trim())
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

describe("étanchéité du site public", () => {
  const publicSurface = [
    ...trackedSources("apps/web/app/modules/comptabilite-approfondie"),
    ...trackedSources("apps/web/components/compta-approfondie"),
    "apps/web/lib/publication/chapter.ts",
    "apps/web/lib/publication/store.ts"
  ];

  it("couvre bien une surface publique non vide", () => {
    expect(publicSurface.length).toBeGreaterThan(5);
  });

  it("aucune page publique n'atteint le magasin de brouillons", () => {
    for (const file of publicSurface) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} importe le service de relecture`).not.toMatch(
        /from\s+["'][^"']*content-review/
      );
      expect(source, `${file} lit les brouillons sur disque`).not.toContain("data/generated/drafts");
      expect(source, `${file} appelle le repository des brouillons`).not.toMatch(
        /listContentDrafts|getContentDraft|listDrafts|readDraft/
      );
    }
  });

  it("aucune page publique n'importe les fixtures de démonstration", () => {
    for (const file of publicSurface) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} atteint les fixtures mock`).not.toMatch(/pilot-fixtures|providers\/mock/);
    }
  });

  it("aucune page publique n'expose de chemin de poste", () => {
    for (const file of publicSurface) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} comporte un chemin Windows absolu`).not.toMatch(/["'`][A-Za-z]:[/\\]/);
      expect(source, `${file} comporte un chemin personnel absolu`).not.toMatch(
        /["'`]\/(home|Users)\//
      );
    }
  });

  it("la notation n'est jamais faite dans un composant client", () => {
    // Ce sont les *imports* qui comptent, pas les occurrences : les composants
    // nomment forcément l'action (`action: "gradeCalculation"`) dans le corps de
    // leur requête, et cette mention-là est précisément la preuve que la
    // notation part au serveur. Importer la fonction, en revanche, embarquerait
    // la réponse attendue dans le bundle.
    const GRADERS = /\b(gradeCalculation|gradeJournalEntry|gradeErrorDiagnosis|gradeCaseStep|revealFlashcard|revealHint)\b/;

    for (const file of trackedSources("apps/web/components/compta-approfondie")) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      const importClauses = source.match(/import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["'][^"']+["']/g) ?? [];

      for (const clause of importClauses) {
        expect(clause, `${file} importe un évaluateur`).not.toMatch(GRADERS);
      }
    }
  });
});

describe("magasin publié commité", () => {
  it("existe et porte un index valide", () => {
    expect(existsSync(join(publishedRoot, "index.json"))).toBe(true);

    const index = JSON.parse(readFileSync(join(publishedRoot, "index.json"), "utf8"));

    expect(index.formatVersion).toBe(1);
    expect(Array.isArray(index.entries)).toBe(true);
  });

  it("ne contient aucun chemin privé, lien de fichier ou secret", async () => {
    const versionsDir = join(publishedRoot, "versions");

    if (!existsSync(versionsDir)) {
      return;
    }

    const files = (await readdir(versionsDir)).filter((file) => file.endsWith(".json"));

    for (const file of files) {
      const raw = readFileSync(join(versionsDir, file), "utf8");

      expect(raw, `${file} comporte un chemin Windows absolu`).not.toMatch(/[A-Za-z]:\\\\/);
      expect(raw, `${file} comporte un chemin personnel`).not.toMatch(/\/(home|Users)\//);
      expect(raw, `${file} référence un fichier source`).not.toMatch(/\.pdf|\.docx?|dropbox\.com/i);
      expect(raw, `${file} comporte CONTENT_SOURCE_ROOT`).not.toContain("CONTENT_SOURCE_ROOT");
      expect(raw, `${file} comporte un extrait de source`).not.toContain('"excerpt"');
      expect(raw, `${file} comporte une clé d'API`).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    }
  });

  it("ne publie aucun contenu produit en mode mock", async () => {
    const versionsDir = join(publishedRoot, "versions");

    if (!existsSync(versionsDir)) {
      return;
    }

    for (const file of (await readdir(versionsDir)).filter((name) => name.endsWith(".json"))) {
      const version = JSON.parse(readFileSync(join(versionsDir, file), "utf8"));

      expect(version.generationMetadataSnapshot.mode, `${file} vient d'une fixture`).toBe("live");
    }
  });
});

describe("taxonomie et routes", () => {
  it("le pilote « Emprunts obligataires » est au programme", () => {
    const chapter = getPublicChapter("emprunts-obligataires");

    expect(chapter?.label).toBe("Emprunts obligataires");
  });

  it("résout les slugs de chapitre produits par le pipeline d'extraction", () => {
    expect(resolvePublicChapter("les-emprunts-obligataires")?.slug).toBe("emprunts-obligataires");
    expect(resolvePublicChapter("emprunts-obligataires")?.slug).toBe("emprunts-obligataires");
  });

  /**
   * LE SLUG DÉRIVÉ D'UN NOM DE FICHIER NE RESSEMBLE PAS AU SLUG PUBLIC, ET
   * C'EST LA RAISON D'ÊTRE DE CETTE TABLE. Les quatre chapitres généralisés
   * portaient un alias manquant : leur contenu passait le garde de publication
   * puis échouait à la construction de l'instantané, sur un chapitre « hors
   * programme » qui est pourtant au programme.
   */
  it.each([
    ["les-titres", "titres"],
    ["les-contrats-a-long-terme", "contrats-a-long-terme"],
    ["la-constitution-des-entreprises", "constitution-des-societes"],
    ["les-variations-du-capital-des-societes", "variations-du-capital"]
  ])("résout le slug source « %s » vers le chapitre public « %s »", (source, expected) => {
    expect(resolvePublicChapter(source)?.slug).toBe(expected);
  });

  it.each(["titres", "contrats-a-long-terme", "constitution-des-societes", "variations-du-capital"])(
    "résout le slug public canonique « %s » vers lui-même",
    (slug) => {
      expect(resolvePublicChapter(slug)?.slug).toBe(slug);
    }
  );

  it("refuse un chapitre hors programme plutôt que de le ranger au hasard", () => {
    expect(resolvePublicChapter("chapitre-invente")).toBeUndefined();
  });

  /**
   * La correspondance reste exacte : ajouter des alias ne doit pas ouvrir la
   * porte à une résolution approximative. Ces slugs ressemblent à des chapitres
   * déclarés sans en être — un `startsWith`, un `includes` ou un retrait
   * d'article les rangerait quelque part.
   */
  it.each([
    "les-titre",
    "titres-non-cotes",
    "la-constitution",
    "variations-du-capital-social",
    "contrats",
    "LES-TITRES"
  ])("refuse « %s », qui ressemble à un chapitre sans en être un", (slug) => {
    expect(resolvePublicChapter(slug)).toBeUndefined();
  });

  it("déclare les cinq chapitres à venir de la généralisation", () => {
    const slugs = COMPTA_APPROFONDIE.chapters.map((chapter) => chapter.slug);

    expect(slugs).toEqual(
      expect.arrayContaining([
        "titres",
        "constitution-des-societes",
        "variations-du-capital",
        "contrats-a-long-terme",
        "travaux-de-cloture"
      ])
    );
  });

  it("chaque slug de chapitre est utilisable dans une URL", () => {
    for (const chapter of COMPTA_APPROFONDIE.chapters) {
      expect(chapter.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("sections du chapitre", () => {
  it("expose les cinq onglets attendus", () => {
    expect([...CHAPTER_SECTIONS]).toEqual(["comprendre", "fiche", "entrainer", "reviser", "sources"]);
  });

  it("retombe sur « Comprendre » pour une section inconnue ou absente", () => {
    expect(parseSection(undefined)).toBe("comprendre");
    expect(parseSection("inexistante")).toBe("comprendre");
    expect(parseSection("fiche")).toBe("fiche");
  });

  it("produit des URL partageables et rechargeables", () => {
    // « Comprendre » est la section par défaut : elle n'a pas besoin du
    // paramètre, ce qui garde l'URL canonique du chapitre courte.
    expect(chapterUrl("emprunts-obligataires")).toBe(
      "/modules/comptabilite-approfondie/emprunts-obligataires"
    );
    expect(chapterUrl("emprunts-obligataires", "comprendre")).toBe(
      "/modules/comptabilite-approfondie/emprunts-obligataires"
    );
    expect(chapterUrl("emprunts-obligataires", "sources")).toBe(
      "/modules/comptabilite-approfondie/emprunts-obligataires?section=sources"
    );
  });

  it("chaque section produite est reconnue par le parseur", () => {
    for (const section of CHAPTER_SECTIONS) {
      const url = chapterUrl("emprunts-obligataires", section);
      const parsed = new URL(url, "https://exemple.test").searchParams.get("section") ?? undefined;

      expect(parseSection(parsed)).toBe(section);
    }
  });
});
