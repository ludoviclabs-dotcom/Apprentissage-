import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const publicationRoute = readFileSync(
  join(repoRoot, "apps", "web", "app", "api", "admin", "content-publication", "route.ts"),
  "utf8"
);

const service = readFileSync(
  join(repoRoot, "apps", "web", "lib", "publication", "service.ts"),
  "utf8"
);

const requireAdmin = readFileSync(
  join(repoRoot, "apps", "web", "lib", "auth", "require-admin.ts"),
  "utf8"
);

/**
 * Protection de l'espace de publication.
 *
 * SUR LE CODE DE REFUS. Le cahier des charges de l'audit demande 401 puis 403.
 * Le dépôt répond 404 aux deux, et le dit en toutes lettres dans
 * `require-admin.ts` : « an administration endpoint that answers "forbidden"
 * confirms it exists ». Répondre 403 à un compte non administrateur lui
 * apprendrait que la route existe et vaut la peine d'être attaquée ; 404 ne lui
 * apprend rien. La convention du dépôt est donc **strictement plus fermée** que
 * la demande, et c'est elle qui est conservée — le point est signalé dans
 * `docs/compta-public-pre-pr-audit.md` pour être tranché en revue.
 *
 * Ce qui est vérifié ici est ce que la demande visait réellement : que
 * l'authentification et l'autorisation existent, soient serveur, et ne fassent
 * aucune confiance au client.
 */

describe("authentification et autorisation", () => {
  it("chaque action passe par la garde d'administration avant toute lecture", () => {
    const guardIndex = publicationRoute.indexOf("requireReviewApiAccess()");
    const bodyIndex = publicationRoute.indexOf("request.json()");

    expect(guardIndex).toBeGreaterThan(-1);
    // La garde est franchie avant même de lire le corps : une requête non
    // autorisée n'atteint aucun traitement.
    expect(guardIndex).toBeLessThan(bodyIndex);
  });

  it("interrompt immédiatement sur refus", () => {
    expect(publicationRoute).toMatch(/if \(caller\.response\) \{\s*return caller\.response;/);
  });

  it("résout le rôle côté serveur, jamais depuis la requête", () => {
    // `resolveAdmin` part de la session ; rien dans la route ne lit un rôle,
    // un acteur ou un droit envoyé par le navigateur.
    expect(requireAdmin).toContain("getCurrentUser()");
    expect(requireAdmin).toContain("getViewerRole(user)");

    for (const forbidden of ["body.data.actor", "body.data.role", "body.data.isAdmin"]) {
      expect(publicationRoute, `la route lit ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("consigne l'acteur résolu par le serveur, pas celui annoncé", () => {
    expect(publicationRoute).toContain("actor: caller.actor");
    expect(publicationRoute).not.toMatch(/actor:\s*body\.data/);
  });

  it("répond sans révéler l'existence de l'espace", () => {
    // Le refus de `requireReviewApiAccess` est un 404 muet, décidé une fois
    // pour toute l'administration.
    const reviewService = readFileSync(
      join(repoRoot, "apps", "web", "lib", "content-review", "service.ts"),
      "utf8"
    );

    expect(reviewService).toContain("Ressource introuvable");
    expect(reviewService).toContain("status: 404");
  });

  it("reste fermé par défaut : le drapeau d'instance conditionne tout", () => {
    const reviewService = readFileSync(
      join(repoRoot, "apps", "web", "lib", "content-review", "service.ts"),
      "utf8"
    );

    expect(reviewService).toContain("CONTENT_REVIEW_ENABLED");
  });

  it("refuse toute écriture en démonstration publique", () => {
    expect(publicationRoute).toContain("getRuntimeFlags().publicDemo");
    expect(publicationRoute).toContain("getPublicDemoWriteResponse()");
  });
});

describe("validation des charges utiles", () => {
  it("chaque action est décrite par un schéma Zod", () => {
    for (const schema of ["previewSchema", "publishSchema", "archiveSchema"]) {
      expect(publicationRoute).toContain(`const ${schema} = z.object(`);
    }

    expect(publicationRoute).toContain("z.discriminatedUnion(");
  });

  it("refuse une charge utile invalide avant tout traitement", () => {
    expect(publicationRoute).toMatch(/if \(!body\.success\)[\s\S]*?status: 400/);
  });

  it("exige une confirmation explicite pour publier et pour archiver", () => {
    // La boîte de confirmation n'est pas qu'une politesse d'interface : un
    // client qui l'ignorerait se voit refuser par le schéma.
    const confirmations = publicationRoute.match(/confirmed: z\.literal\(true\)/g) ?? [];

    expect(confirmations).toHaveLength(2);
  });

  it("n'accepte du client qu'un identifiant, jamais un statut ni une version", () => {
    for (const forbidden of ["status:", "publicationVersion:", "contentHash:", "mode:"]) {
      const inSchemas = publicationRoute
        .slice(0, publicationRoute.indexOf("export async function POST"))
        .includes(forbidden);

      expect(inSchemas, `le schéma accepte ${forbidden} du client`).toBe(false);
    }
  });
});

describe("intégrité de l'acte de publication", () => {
  it("relit le brouillon sur le disque plutôt que de croire la requête", () => {
    expect(service).toContain("await findDraft(input.draftId)");
  });

  it("rejoue les contrôles au moment de la publication, pas ceux de l'aperçu", () => {
    const publishBody = service.slice(service.indexOf("export async function publishDraft"));

    expect(publishBody).toContain("inspectForPublication(");
    expect(publishBody).toContain("PublicationRefused");
  });

  it("vérifie que l'instantané construit est bien celui qui a été contrôlé", () => {
    expect(service).toContain("version.contentHash !== report.contentHash");
  });

  it("est idempotent sur un contenu inchangé", () => {
    expect(service).toContain("active.contentHash === version.contentHash");
  });

  it("échoue la publication quand la base ne l'a pas enregistrée", () => {
    // C'est le point qui distingue « source de vérité » d'un simple miroir :
    // sans écriture en base, il n'y a pas de publication.
    expect(service).toMatch(/driver === "database" && audit\.status !== "written"/);
  });

  it("écrit la version et son audit dans une seule transaction", () => {
    const repository = readFileSync(
      join(repoRoot, "packages", "db", "src", "publication-repository.ts"),
      "utf8"
    );
    const publishBody = repository.slice(
      repository.indexOf("export async function recordPublishedVersion"),
      repository.indexOf("export async function recordArchivedVersion")
    );

    expect(publishBody).toContain("createDb().transaction(");
    // Archivage de l'ancienne, insertion de la nouvelle, écriture de l'audit :
    // les trois dans la même transaction, ou aucune.
    expect(publishBody).toContain("update(publishedContentVersionsTable)");
    expect(publishBody).toContain("insert(publishedContentVersionsTable)");
    expect(publishBody).toContain("insert(contentPublicationAuditTable)");
  });

  it("traduit une publication concurrente en conflit, pas en erreur interne", () => {
    expect(publicationRoute).toContain("isUniqueViolation");
    expect(publicationRoute).toContain("Publication concurrente");
  });

  it("ne révèle aucune information d'infrastructure en cas d'indisponibilité", () => {
    const unavailableBranch = publicationRoute.slice(
      publicationRoute.indexOf("error instanceof PublicationStoreUnavailableError"),
      publicationRoute.indexOf("isUniqueViolation(error)")
    );

    expect(unavailableBranch).toContain("status: 503");
    // Le message rendu ne porte ni la cause, ni la chaîne de connexion.
    expect(unavailableBranch).not.toContain("error.message");
    expect(unavailableBranch).not.toContain("DATABASE_URL");
  });
});
