import { describe, expect, it } from "vitest";
import {
  buildScanCommand,
  PATH_PLACEHOLDER,
  PIPELINE_STEPS,
  SCAN_SCRIPT,
  validateRelativeSourcePath
} from "@/lib/source-packs/import-command";

/**
 * L'assistant d'import ne fait qu'une chose : composer une chaîne de caractères
 * à partir d'un chemin relatif. Ces tests couvrent les deux moitiés de la
 * promesse — ce qui est accepté, et surtout ce qui est refusé avant même que la
 * commande existe.
 */

describe("chemins acceptés", () => {
  it.each([
    "source-packs/mon-pack",
    "content-private/comptabilite/approfondie",
    "./source-packs/emprunts-obligataires",
    "data/raw"
  ])("accepte %s", (path) => {
    const check = validateRelativeSourcePath(path);
    expect(check.ok, check.message).toBe(true);
  });

  it("normalise le préfixe ./ et les séparateurs Windows relatifs", () => {
    expect(validateRelativeSourcePath("./source-packs/mon-pack").normalized).toBe("source-packs/mon-pack");
    expect(validateRelativeSourcePath("source-packs\\mon-pack").normalized).toBe("source-packs/mon-pack");
    expect(validateRelativeSourcePath("source-packs/mon-pack/").normalized).toBe("source-packs/mon-pack");
  });

  it("tolère les espaces autour de la saisie", () => {
    expect(validateRelativeSourcePath("  source-packs/mon-pack  ").normalized).toBe("source-packs/mon-pack");
  });
});

describe("chemins refusés", () => {
  const cases: Array<[string, string]> = [
    ["C:\\Users\\Nom\\Documents", "absolute-windows"],
    ["C:/Users/Nom/Documents", "absolute-windows"],
    ["/home/user/documents", "absolute-posix"],
    ["/etc/passwd", "absolute-posix"],
    ["\\\\serveur\\partage", "unc"],
    ["file:///c:/corpus", "url-scheme"],
    ["https://example.test/corpus", "url-scheme"],
    ["../../etc", "traversal"],
    ["source-packs/../../secret", "traversal"],
    ["", "empty"],
    ["   ", "empty"]
  ];

  it.each(cases)("refuse %s", (path, reason) => {
    const check = validateRelativeSourcePath(path);

    expect(check.ok).toBe(false);
    expect(check.reason).toBe(reason);
    // Un refus explique toujours quoi faire ensuite.
    expect(check.message).toBeTruthy();
  });

  it("refuse un caractère nul ou de contrôle", () => {
    expect(validateRelativeSourcePath("source-packs/\u0000pack").reason).toBe("control-char");
    expect(validateRelativeSourcePath("source-packs/\u001Bpack").reason).toBe("control-char");
  });

  it("refuse les guillemets, qui casseraient l'échappement de la commande", () => {
    expect(validateRelativeSourcePath('source-packs/"pack"').reason).toBe("quote");
    expect(validateRelativeSourcePath("source-packs/`pack`").reason).toBe("quote");
  });

  it("propose un chemin relatif en exemple, jamais un chemin absolu", () => {
    const message = validateRelativeSourcePath("C:\\Users\\Nom").message ?? "";

    expect(message).toContain(PATH_PLACEHOLDER);
    expect(message).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(PATH_PLACEHOLDER).not.toMatch(/^[A-Za-z]:|^\//);
  });
});

describe("construction de la commande", () => {
  it("utilise un script réellement défini et met le chemin entre guillemets", () => {
    const command = buildScanCommand("source-packs/mon-pack");

    expect(command).toBe('pnpm content:scan --root "source-packs/mon-pack"');
    expect(command).toContain(SCAN_SCRIPT);
  });

  it("compose depuis le chemin normalisé, pas depuis la saisie brute", () => {
    expect(buildScanCommand("  ./source-packs/mon-pack/  ")).toBe(
      'pnpm content:scan --root "source-packs/mon-pack"'
    );
  });

  it("ne compose aucune commande à partir d'un chemin refusé", () => {
    for (const rejected of ["", "C:\\Users\\Nom", "/etc/passwd", "../../x", '"x"', "\\\\srv\\p"]) {
      expect(buildScanCommand(rejected), rejected).toBeUndefined();
    }
  });

  it("n'expose ni secret ni variable privée", () => {
    const command = buildScanCommand("content-private/comptabilite") ?? "";

    expect(command).not.toMatch(/CONTENT_SOURCE_ROOT|API_KEY|SECRET|TOKEN/i);
  });

  it("décrit les étapes du pipeline avec les scripts réels du dépôt", () => {
    expect(PIPELINE_STEPS.map((step) => step.script)).toEqual([
      "content:scan",
      "content:extract",
      "content:pair",
      "content:validate"
    ]);
  });
});
