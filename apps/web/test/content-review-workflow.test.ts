import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Le circuit de décision, tel que l'écran le présente.
 *
 * CE QUI EST TESTÉ ICI EST UNE PROPRIÉTÉ DE SOURCE, PAS UN RENDU. Le dépôt
 * n'embarque pas de bibliothèque de rendu React pour les tests, et l'assertion
 * qui compte — « aucune action de publication n'est offerte tant que le contenu
 * n'est pas approuvé » — se lit sur la structure du composant : la branche non
 * approuvée retourne avant tout élément interactif. Un test de rendu aurait
 * couvert le même fait pour un coût d'outillage sans rapport ; un test de source
 * qui vérifie la *forme* de la branche le couvre tant que la branche existe, et
 * échoue bruyamment si quelqu'un y glisse un bouton.
 *
 * Le refus serveur, lui, est éprouvé ailleurs : `packages/content-publication`
 * pour le garde, `packages/content-generation` pour la machine à états. L'écran
 * n'est pas la sécurité, et ces tests ne prétendent pas l'être.
 */

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, "..", "components", "content-review");
const read = (name: string): string => readFileSync(join(componentsDir, name), "utf8");

const publicationActions = read("publication-actions.tsx");
const reviewActions = read("review-actions.tsx");
const workflowSteps = read("workflow-steps.tsx");
const detailPage = readFileSync(
  join(here, "..", "app", "admin", "content-review", "[draftId]", "page.tsx"),
  "utf8"
);
const listPage = readFileSync(join(here, "..", "app", "admin", "content-review", "page.tsx"), "utf8");

/** Le corps de la branche « non approuvé » du panneau de publication. */
function lockedPublicationBranch(): string {
  const start = publicationActions.indexOf('if (status !== "approved")');

  expect(start, "la branche « non approuvé » doit exister").toBeGreaterThan(-1);

  // Jusqu'au `return` de la branche approuvée, qui suit immédiatement.
  const end = publicationActions.indexOf("return (", publicationActions.indexOf("}", start));

  return publicationActions.slice(start, end);
}

describe("publication verrouillée avant approbation", () => {
  it("n'offre aucun élément interactif tant que le contenu n'est pas approuvé", () => {
    const branch = lockedPublicationBranch();

    expect(branch).not.toMatch(/<button/);
    expect(branch).not.toMatch(/onClick/);
  });

  it("ne nomme ni « Publier » ni « Publier maintenant » dans cette branche", () => {
    expect(lockedPublicationBranch()).not.toMatch(/Publier/);
  });

  it("dit pourquoi, et rappelle le statut courant", () => {
    const branch = lockedPublicationBranch();

    expect(branch).toContain("Publication indisponible");
    expect(branch).toContain("approuvé lors de la revue humaine");
    expect(branch).toContain("STATUS_LABELS[status]");
  });

  it("porte une icône de cadenas dessinée, pas un émoji", () => {
    expect(lockedPublicationBranch()).toContain("<LockIcon />");
    expect(publicationActions).toContain("publication-locked-icon");
  });

  it("garde le bouton de publication pour le seul statut approuvé", () => {
    // Le bouton existe toujours — après le retour anticipé, donc uniquement
    // atteignable quand `status === "approved"`.
    const branchEnd = publicationActions.indexOf('if (status !== "approved")');
    const afterBranch = publicationActions.slice(branchEnd);

    expect(afterBranch).toMatch(/Publier une nouvelle version|>\s*Publier\s*</);
    expect(afterBranch).toContain("Publier maintenant");
  });
});

describe("décision de revue", () => {
  it("propose approuver et rejeter sur un contenu à relire", () => {
    expect(reviewActions).toContain("Approuver le contenu");
    expect(reviewActions).toContain("Rejeter le contenu");
  });

  it("passe par une confirmation avant d'approuver", () => {
    // Le bouton n'appelle pas la route : il ouvre la boîte. C'est la boîte qui
    // déclenche l'approbation.
    expect(reviewActions).toContain("onClick={() => setConfirming(true)}");
    expect(reviewActions).toContain("Confirmer l'approbation".replace("'", "&apos;"));
    expect(reviewActions).toContain('void run("approveDraft")');
  });

  it("laisse annuler la confirmation sans rien envoyer", () => {
    expect(reviewActions).toContain("onClick={() => setConfirming(false)}");
  });

  it("rappelle que l'approbation fige la révision", () => {
    expect(reviewActions).toContain("fige cette révision");
    expect(reviewActions).toContain("ne peut plus être modifié");
  });

  it("récapitule le contenu dans la confirmation", () => {
    for (const field of [
      "summary.title",
      "summary.typeLabel",
      "summary.chapterLabel",
      "summary.normativeProfileLabel",
      "summary.scoringPolicyLabel",
      "summary.sourceCount",
      "summary.validationPassed",
      "summary.warnings"
    ]) {
      expect(reviewActions, `${field} doit figurer dans la confirmation`).toContain(field);
    }
  });

  it("ne demande pas de recopier une phrase", () => {
    expect(reviewActions).not.toMatch(/tapez|recopiez|saisissez « /i);
  });
});

describe("rejet", () => {
  it("exige dix caractères et l'affiche", () => {
    expect(reviewActions).toContain("const MIN_REASON = 10;");
    expect(reviewActions).toContain("reasonLength >= MIN_REASON");
    expect(reviewActions).toContain("caractères minimum");
  });

  it("affiche un compteur de caractères", () => {
    expect(reviewActions).toContain("{reasonLength} / {MIN_REASON}");
  });

  it("désactive le bouton tant que le motif est trop court", () => {
    expect(reviewActions).toContain("disabled={disabled || !canReject}");
  });

  it("annonce qu'un contenu rejeté pourra être rouvert", () => {
    expect(reviewActions).toContain("pourra être rouvert");
  });
});

describe("barre d'actions collante", () => {
  it("existe et affiche le statut", () => {
    expect(reviewActions).toContain("review-sticky-bar");
    expect(reviewActions).toContain("Statut&nbsp;:");
  });

  it("propose approuver et rejeter à relire, publication une fois approuvé, rouvrir sinon", () => {
    const bar = reviewActions.slice(reviewActions.indexOf("function ReviewStickyBar"));

    expect(bar).toContain('status === "needs_review"');
    expect(bar).toContain('status === "approved"');
    expect(bar).toContain('status === "rejected" || status === "validation_failed"');
    // Sur un contenu approuvé, la barre *renvoie* à la publication : elle ne la
    // déclenche pas. Dupliquer l'action ici aurait recréé la confusion corrigée.
    expect(bar).toContain('href="#publication"');
  });

  it("ne duplique pas l'appel d'approbation", () => {
    const bar = reviewActions.slice(reviewActions.indexOf("function ReviewStickyBar"));

    expect(bar).not.toContain("approveDraft");
    expect(bar).toContain("onApprove");
  });
});

describe("indicateur de circuit", () => {
  it("nomme les quatre étapes dans l'ordre", () => {
    const order = ["Brouillon", "Revue humaine", "Approuvé", "Publication"];
    const positions = order.map((label) => workflowSteps.indexOf(`"${label}"`));

    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  it("place un contenu à relire sur l'étape de revue", () => {
    expect(workflowSteps).toContain('case "needs_review":');
    expect(workflowSteps).toContain('return "review";');
  });

  it("traite rejet et échec de contrôles comme des sorties, pas des étapes", () => {
    expect(workflowSteps).toContain('status === "rejected" || status === "validation_failed"');
  });

  it("est rendu en tête du panneau de décision", () => {
    const panel = detailPage.slice(detailPage.indexOf('id="decision"'));

    expect(panel.indexOf("<WorkflowSteps")).toBeLessThan(panel.indexOf("<ReviewActions"));
  });
});

describe("file de relecture", () => {
  it("compte les décisions enregistrées, approbations et rejets", () => {
    expect(listPage).toContain('entry.draft.status === "approved" || entry.draft.status === "rejected"');
    expect(listPage).toContain("décision{decided > 1");
  });

  it("propose les filtres rapides demandés", () => {
    for (const label of ["Tous", "C prioritaires", "B à lire", "A rapides", "À relire", "Approuvés", "Rejetés"]) {
      expect(listPage, `filtre « ${label} » manquant`).toContain(label);
    }
  });

  it("affiche le risque, le référentiel, la politique de notation et les alertes", () => {
    expect(listPage).toContain("<RiskBadge");
    expect(listPage).toContain("<NormativeProfileBadge");
    expect(listPage).toContain("<ScoringPolicyBadge");
    expect(listPage).toContain("Alertes");
  });
});

describe("le circuit ne contourne pas le serveur", () => {
  it("n'envoie qu'une intention : action, identifiant, et rien d'autre", () => {
    // La charge utile est littérale et courte. Y transmettre un statut ferait
    // décider le navigateur de la transition, alors que la route seule en juge.
    const call = reviewActions.slice(
      reviewActions.indexOf('postJson<ActionResponse>("/api/admin/content-review"'),
      reviewActions.indexOf("setBusy(false)", reviewActions.indexOf("postJson<ActionResponse>"))
    );

    expect(call).toContain("action,");
    expect(call).toContain("draftId,");
    expect(call).toContain("...extra");
    expect(call).not.toContain("status");
  });

  it("n'importe du paquet de génération que des types", () => {
    // Un import de valeur embarquerait la fabrique — donc `node:fs` — dans le
    // paquet du navigateur, et surtout permettrait de réimplémenter ici une
    // règle normative que le serveur est seul à devoir trancher.
    const imports = reviewActions
      .split(/\r?\n/)
      .filter((line) => line.includes("@finance/content-generation"));

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((line) => line.includes("import type"))).toBe(true);
  });

  it("ne décide de l'approbation qu'à partir du booléen calculé par la page", () => {
    // `canApprove` vient du serveur ; le composant ne recalcule ni la validation
    // ni le profil normatif pour en déduire un droit.
    expect(reviewActions).toContain("disabled={disabled || !canApprove}");
    expect(reviewActions).not.toMatch(/validationMetadata|page-degradee/);
  });
});
