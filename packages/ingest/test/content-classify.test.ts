import { describe, expect, it } from "vitest";
import {
  classifyDocumentCategory,
  detectChapter,
  normalizeForMatching,
  slugify,
  variantKey
} from "../src/content-pipeline";
import { inferDomainFromPath } from "../src";

describe("classification documentaire", () => {
  it("classe les fiches de cours", () => {
    expect(classifyDocumentCategory("Les titres - Fiche de cours.pdf")).toBe("course");
    expect(classifyDocumentCategory("La constitution des entreprises - Fiches de cours.pdf")).toBe("course");
  });

  it("classe les énoncés d'exercices", () => {
    expect(classifyDocumentCategory("Les titres - Mise en situation.pdf")).toBe("exercise");
    expect(classifyDocumentCategory("La méthode ABC - Application complémentaire.pdf")).toBe("exercise");
    expect(classifyDocumentCategory("Exercice 4 - Les provisions.pdf")).toBe("exercise");
    expect(classifyDocumentCategory("Management et pilotage par les processus - Etudiant.pdf")).toBe("exercise");
  });

  it("détecte les corrigés, y compris quand le nom contient aussi un marqueur d'exercice", () => {
    expect(classifyDocumentCategory("La méthode ABC - Application 3 - Corrigé.pdf")).toBe("correction");
    expect(classifyDocumentCategory("Les tableaux de bord - Corrigé.pdf")).toBe("correction");
    expect(classifyDocumentCategory("Mise en situation - Correction.pdf")).toBe("correction");
    expect(classifyDocumentCategory("Exercice 2 - Solution.pdf")).toBe("correction");
  });

  it("classe synthèses, examens et références", () => {
    expect(classifyDocumentCategory("Synthèse - Les emprunts obligataires.pdf")).toBe("synthesis");
    expect(classifyDocumentCategory("Annales 2024 - Comptabilité approfondie.pdf")).toBe("exam");
    expect(classifyDocumentCategory("Sujet d'examen - Les provisions.pdf")).toBe("exam");
    expect(classifyDocumentCategory("Pilotage et performance méthode du coût cible.pdf")).toBe("reference");
  });

  it("normalise les noms accentués", () => {
    expect(normalizeForMatching("Corrigé")).toBe("corrige");
    expect(normalizeForMatching("Synthèse — l'œuvre")).toBe("synthese — l oeuvre");
    expect(slugify("Les écarts sur chiffre d'affaires")).toBe("les-ecarts-sur-chiffre-d-affaires");
  });

  it("détecte le chapitre en retirant les segments de catégorie", () => {
    expect(detectChapter("Les titres - Fiche de cours.pdf")).toEqual({
      chapterLabel: "Les titres",
      chapterSlug: "les-titres"
    });
    expect(detectChapter("La méthode ABC - Application 3 - Corrigé.pdf").chapterSlug).toBe("la-methode-abc");
    // Sans séparateur ni marqueur : le nom entier fait office de chapitre.
    expect(detectChapter("Pilotage et performance yield management.pdf").chapterSlug).toBe(
      "pilotage-et-performance-yield-management"
    );
  });

  it("fait correspondre énoncé et corrigé par clé de variante", () => {
    expect(variantKey("La méthode ABC - Application 3.pdf")).toBe("application-3");
    expect(variantKey("La méthode ABC - Application 3 - Corrigé.pdf")).toBe("application-3");
    expect(variantKey("Les titres - Mise en situation.pdf")).toBe("mise-en-situation");
    // Le marqueur de correction seul ne crée pas de variante.
    expect(variantKey("Les titres - Corrigé.pdf")).toBe("");
  });

  it("classe les domaines depuis les chemins", () => {
    expect(inferDomainFromPath("comptabilite/Les emprunts obligataires - Fiche de cours.pdf")).toBe("compta-generale");
    expect(inferDomainFromPath("La méthode ABC - Application 3 - Corrigé.pdf")).toBe("compta-analytique");
    expect(inferDomainFromPath("ifrs/IAS 36 notes.md")).toBe("ifrs-ias");
    expect(inferDomainFromPath("divers/notes.md")).toBe("unknown");
  });
});

// Le workflow éditorial a quitté ce package pour @finance/content-generation,
// où il gagne les états validation_failed et rejected. Ses tests vivent
// désormais dans packages/content-generation/test/status.test.ts.
