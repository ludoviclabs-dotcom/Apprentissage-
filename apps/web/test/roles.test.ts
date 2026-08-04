import { describe, expect, it } from "vitest";
import { canManageSources, parseAdminEmails, resolveViewerRole } from "@/lib/auth/roles";

describe("resolveViewerRole", () => {
  it("ne donne jamais l'administration en démo publique", () => {
    expect(
      resolveViewerRole({ publicDemo: true, authEnabled: false, userEmail: null, adminEmails: [] })
    ).toBe("guest");

    // Même un compte connecté reste apprenant si la démo publique est forcée.
    expect(
      resolveViewerRole({
        publicDemo: true,
        authEnabled: true,
        userEmail: "admin@exemple.fr",
        adminEmails: ["admin@exemple.fr"]
      })
    ).toBe("learner");
  });

  it("fait du propriétaire d'une installation privée sans comptes l'administrateur", () => {
    expect(
      resolveViewerRole({ publicDemo: false, authEnabled: false, userEmail: null, adminEmails: [] })
    ).toBe("admin");
  });

  it("réserve l'administration aux e-mails listés quand les comptes sont actifs", () => {
    const base = { publicDemo: false, authEnabled: true, adminEmails: ["admin@exemple.fr"] };

    expect(resolveViewerRole({ ...base, userEmail: "admin@exemple.fr" })).toBe("admin");
    expect(resolveViewerRole({ ...base, userEmail: "Admin@Exemple.FR" })).toBe("admin");
    expect(resolveViewerRole({ ...base, userEmail: "apprenant@exemple.fr" })).toBe("learner");
    expect(resolveViewerRole({ ...base, userEmail: null })).toBe("guest");
  });

  it("n'administre personne quand les comptes sont actifs sans liste configurée", () => {
    // Ce cas rendait auparavant tout compte inscrit administrateur. Tant que
    // l'administration ne faisait que masquer des liens, c'était sans gravité ;
    // depuis PR-13 un administrateur peut révoquer l'attestation d'un tiers, et
    // un déploiement ouvert aux inscriptions faisait de chaque visiteur un
    // administrateur. La liste devient donc obligatoire dès qu'il y a des
    // comptes : on échoue fermé, ce qui coûte une variable d'environnement au
    // lieu de coûter le document de quelqu'un.
    expect(
      resolveViewerRole({
        publicDemo: false,
        authEnabled: true,
        userEmail: "quiconque@exemple.fr",
        adminEmails: []
      })
    ).toBe("learner");
  });

  it("garde le propriétaire administrateur tant que les comptes sont désactivés", () => {
    // La raison d'être de l'ancien comportement — une installation locale à un
    // seul utilisateur — reste couverte par la branche `!authEnabled`.
    expect(
      resolveViewerRole({
        publicDemo: false,
        authEnabled: false,
        userEmail: "proprietaire@exemple.fr",
        adminEmails: []
      })
    ).toBe("admin");
  });
});

describe("canManageSources", () => {
  it("réserve Documents et Source packs au rôle admin", () => {
    expect(canManageSources("admin")).toBe(true);
    expect(canManageSources("learner")).toBe(false);
    expect(canManageSources("guest")).toBe(false);
  });
});

describe("parseAdminEmails", () => {
  it("découpe, nettoie et ignore les entrées vides", () => {
    expect(parseAdminEmails("a@x.fr, b@x.fr ,, c@x.fr")).toEqual(["a@x.fr", "b@x.fr", "c@x.fr"]);
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("  ")).toEqual([]);
  });
});
