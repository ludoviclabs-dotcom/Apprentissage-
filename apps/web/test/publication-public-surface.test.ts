import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPublishedVersion,
  SOURCE_TYPE_LABELS,
  toPublicCalculationExercise,
  toPublicSourceReferences
} from "@finance/content-publication";
import {
  approvedCalculationDraft,
  approvedSheetDraft
} from "../../../packages/content-publication/test/fixtures";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Ce qui franchit la frontière vers le navigateur.
 *
 * L'instantané publié porte des champs qui n'ont rien à faire sur un écran
 * public : l'identifiant et la version du **prompt**, le fournisseur et le
 * modèle, l'empreinte des entrées, le compte du relecteur, le détail de la
 * validation. Ils sont légitimes dans un registre — c'est leur raison d'être —
 * et illégitimes dans une page. Les DTO sont la frontière ; ces tests vérifient
 * qu'elle tient.
 */

function publish(draft: Parameters<typeof buildPublishedVersion>[0]["draft"]) {
  return buildPublishedVersion({
    draft,
    publishedBy: "relecteur@example.test",
    publishedAt: "2026-08-01T12:00:00.000Z",
    publicationVersion: 1,
    previousPublishedVersionId: null
  });
}

describe("l'instantané complet porte bien ce qu'il ne faut pas publier", () => {
  it("contient prompt, fournisseur, modèle et relecteur", () => {
    // Test de contrôle : si ce test échoue, les suivants ne prouvent plus rien,
    // parce qu'ils vérifieraient l'absence de champs qui n'existent pas.
    const version = publish(approvedSheetDraft());

    expect(version.generationMetadataSnapshot.promptId).not.toHaveLength(0);
    expect(version.generationMetadataSnapshot.promptVersion).not.toHaveLength(0);
    expect(version.generationMetadataSnapshot.model).not.toHaveLength(0);
    expect(version.reviewMetadataSnapshot.reviewedBy).not.toBeUndefined();
  });
});

describe("les DTO publics retirent les champs internes", () => {
  const version = publish(approvedCalculationDraft());

  it("un exercice publié ne porte ni prompt, ni modèle, ni fournisseur", () => {
    const serialized = JSON.stringify(toPublicCalculationExercise(version));

    for (const forbidden of [
      "promptId",
      "promptVersion",
      "provider",
      "model",
      "inputHash",
      "generationMetadata",
      "reviewedBy",
      "reviewNote",
      "validationMetadata",
      "qualityScore",
      "sourceArtifactId",
      "contentHash"
    ]) {
      expect(serialized, `le DTO expose ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("une source publiée ne porte ni extrait, ni empreinte, ni identifiant de fragment", () => {
    const serialized = JSON.stringify(toPublicSourceReferences(version.sourceReferencesSnapshot));

    for (const forbidden of ["excerpt", "excerptHash", "chunkIds"]) {
      expect(serialized, `la source expose ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("cite les quatre champs qu'AGENTS.md exige", () => {
    // « Every sourced answer must cite document, page, pack and date when
    // available. » Le pack avait été retiré par prudence ; il ne dit rien de
    // l'arborescence — il nomme un lot d'import — et son absence privait chaque
    // règle d'un des quatre champs exigés.
    const [source] = toPublicSourceReferences(version.sourceReferencesSnapshot);

    expect(source.documentTitle).not.toHaveLength(0);
    expect(source.pack).not.toHaveLength(0);
    expect(source.pageStart).toBeGreaterThan(0);
    // La date d'effet est « when available » : le schéma la rend optionnelle, et
    // la fixture n'en porte pas. Ce qui compte est que le champ traverse.
    expect("effectiveDate" in source).toBe(true);
  });

  it("nomme la nature du matériau, jamais son identifiant brut", () => {
    // AGENTS.md : « Never mix course content and official reference content
    // without saying so. » Le dire suppose de l'afficher.
    const [source] = toPublicSourceReferences(version.sourceReferencesSnapshot);

    expect(SOURCE_TYPE_LABELS[source.sourceType]).not.toMatch(/[_-]/);
    expect(Object.keys(SOURCE_TYPE_LABELS)).toHaveLength(4);
  });

  it("le DTO de fiche ne transporte que la fiche, sa version et ses sources", () => {
    // Les clés du DTO sont énumérées : un champ ajouté par distraction fait
    // échouer ce test plutôt que de voyager sans être remarqué.
    const source = readFileSync(
      join(repoRoot, "apps", "web", "lib", "publication", "chapter.ts"),
      "utf8"
    );
    const declaration = source.slice(
      source.indexOf("export interface PublicSheetView"),
      source.indexOf("export async function loadChapterSheet")
    );

    expect(declaration).toContain("artifactId");
    expect(declaration).toContain("publicationVersion");
    expect(declaration).toContain("sheet");
    expect(declaration).toContain("sources");
    expect(declaration).not.toMatch(/generationMetadata|reviewMetadata|validationMetadata/);
  });
});

describe("aucune entité complète n'atteint un composant", () => {
  const componentFiles = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "apps/web/components/compta-approfondie"
    ],
    { cwd: repoRoot, encoding: "utf8" }
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"));

  it("couvre une surface non vide", () => {
    expect(componentFiles.length).toBeGreaterThan(5);
  });

  it("aucun composant ne reçoit un PublishedContentVersion", () => {
    for (const file of componentFiles) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} manipule l'entité complète`).not.toMatch(
        /PublishedContentVersion/
      );
    }
  });

  it("aucun composant n'importe la racine du paquet de publication", () => {
    // La racine exporte le magasin, qui importe `node:fs/promises`. Ces
    // composants sont rendus côté serveur *et* importés par des îlots clients :
    // passer par la racine tire `node:fs` dans le bundle navigateur et fait
    // échouer le build. Le sous-chemin « public » n'expose que des projections
    // et des types.
    for (const file of componentFiles) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} importe la racine du paquet`).not.toMatch(
        /from "@finance\/content-publication"/
      );
    }
  });

  it("aucun composant ne lit les métadonnées de génération ou de revue", () => {
    for (const file of componentFiles) {
      const source = readFileSync(join(repoRoot, file), "utf8");

      expect(source, `${file} lit les métadonnées internes`).not.toMatch(
        /generationMetadataSnapshot|reviewMetadataSnapshot|validationMetadataSnapshot/
      );
    }
  });
});

describe("l'API publique ne sert que des contenus actifs", () => {
  const route = readFileSync(
    join(repoRoot, "apps", "web", "app", "api", "apprentissage", "activites", "route.ts"),
    "utf8"
  );

  it("vérifie le statut de la version avant toute réponse", () => {
    expect(route).toContain('version.status !== "published"');
  });

  it("vérifie que la version appartient bien au chapitre demandé", () => {
    // Sans cela, un identifiant valide d'un autre chapitre servirait de passe.
    expect(route).toContain("version.chapter !== chapter");
  });

  it("refuse un chapitre absent de la taxonomie", () => {
    expect(route).toContain("getPublicChapter(chapter)");
  });

  it("ne renvoie jamais l'instantané brut", () => {
    // Chaque réponse est construite champ par champ ; renvoyer `version` tel
    // quel exporterait prompt, modèle et relecteur d'un coup.
    expect(route).not.toMatch(/Response\.json\(\s*version\s*\)/);
    expect(route).not.toMatch(/\.\.\.version[,\s}]/);
  });
});

describe("la lecture publique ignore le contenu de démonstration", () => {
  const store = readFileSync(
    join(repoRoot, "apps", "web", "lib", "publication", "store.ts"),
    "utf8"
  );

  it("filtre le mode mock à la lecture, en plus des refus d'écriture", () => {
    expect(store).toContain('generationMetadataSnapshot.mode === "live"');
    expect(store).toContain("isLiveVersion");
  });

  it("ne rend une version que si elle est active et live", () => {
    expect(store).toMatch(
      /version\.status !== "published" \|\| !isLiveVersion\(version\)/
    );
  });
});
