import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_DISCLAIMER,
  SUBSCRIPTION_STATUSES,
  VERIFICATION_ID_BYTES,
  VERIFICATION_ID_LENGTH,
  certificateStatusLabel,
  certificateTitle,
  classifySubscriptionStatus,
  encodeVerificationId,
  evaluateCertificateEligibility,
  formatCertificateSerial,
  isCertificateSerial,
  isEntitlingStatus,
  isVerificationId,
  type CertificateContent,
  type LevelSnapshot,
  type ModuleLevelDefinition
} from "../src";

/**
 * Certificates and subscription statuses (PR-13).
 *
 * `evaluateCertificateEligibility` shipped in PR-07 with no unit test at all;
 * it decides whether somebody is handed a document, so it gets one here.
 */

function level(id: string): ModuleLevelDefinition {
  return {
    id,
    trackId: "track-test",
    moduleId: "module-test",
    domainId: "finance",
    level: 1,
    title: id,
    objective: "objectif",
    competencyIds: ["c1"],
    criticalCompetencyIds: ["c1"],
    estimatedMinutes: 10,
    publicationStatus: "published"
  };
}

function snapshot(levelId: string, status: LevelSnapshot["status"], score: number): LevelSnapshot {
  return {
    levelId,
    rulesVersion: "v1",
    status,
    score,
    components: { direct: score, retention: 0, caseStudy: 0, explanation: 0 },
    missingKinds: [],
    finalDiagnosticCompleted: status === "passed",
    blockers: []
  };
}

describe("certificate eligibility", () => {
  it("issues when every level is acquired and the learner is entitled", () => {
    const result = evaluateCertificateEligibility({
      levels: [level("l1"), level("l2")],
      snapshots: [snapshot("l1", "passed", 90), snapshot("l2", "passed", 80)],
      entitled: true
    });

    expect(result.eligible).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.averageScore).toBe(85);
  });

  it("refuses while a level is unfinished, and counts a missing snapshot as zero", () => {
    const result = evaluateCertificateEligibility({
      levels: [level("l1"), level("l2")],
      snapshots: [snapshot("l1", "passed", 90)],
      entitled: true
    });

    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("levels-incomplete");
    expect(result.acquiredLevels).toBe(1);
    // 90 and an absent snapshot: the mean is over every level, not the ones
    // that happen to have a row.
    expect(result.averageScore).toBe(45);
  });

  it("reports both blockers at once rather than picking one", () => {
    const result = evaluateCertificateEligibility({
      levels: [level("l1")],
      snapshots: [snapshot("l1", "in_progress", 10)],
      entitled: false
    });

    expect(result.blockers).toEqual(["levels-incomplete", "no-entitlement"]);
  });

  it("refuses a track with no levels rather than calling it finished", () => {
    const result = evaluateCertificateEligibility({ levels: [], snapshots: [], entitled: true });

    expect(result.blockers).toContain("track-empty");
    expect(result.eligible).toBe(false);
  });
});

describe("serials", () => {
  it("formats and recognises a serial", () => {
    const serial = formatCertificateSerial(2026, "1a2b3c4d5e");

    expect(serial).toBe("FLH-2026-1A2B3C4D5E");
    expect(isCertificateSerial(serial)).toBe(true);
  });

  it("refuses anything that is not one", () => {
    for (const value of ["", "FLH-2026", "flh-2026-1a2b3c4d5e", "FLH-26-1A2B3C4D5E"]) {
      expect(isCertificateSerial(value), value).toBe(false);
    }
  });
});

describe("verification identifiers", () => {
  it("encodes 160 bits into 32 characters of the reduced alphabet", () => {
    const id = encodeVerificationId(new Uint8Array(VERIFICATION_ID_BYTES).fill(0xff));

    expect(id).toHaveLength(VERIFICATION_ID_LENGTH);
    expect(isVerificationId(id)).toBe(true);
  });

  it("is deterministic for the same bytes and different for different ones", () => {
    const a = new Uint8Array(VERIFICATION_ID_BYTES).fill(1);
    const b = new Uint8Array(VERIFICATION_ID_BYTES).fill(2);

    expect(encodeVerificationId(a)).toBe(encodeVerificationId(a));
    expect(encodeVerificationId(a)).not.toBe(encodeVerificationId(b));
  });

  it("never emits the characters Crockford drops, so a read-aloud id is unambiguous", () => {
    for (let seed = 0; seed < 64; seed += 1) {
      const bytes = new Uint8Array(VERIFICATION_ID_BYTES).map((_, index) => (seed * 31 + index * 7) & 0xff);

      expect(encodeVerificationId(bytes)).not.toMatch(/[ilou]/);
    }
  });

  it("refuses randomness short enough to weaken the identifier", () => {
    expect(() => encodeVerificationId(new Uint8Array(8))).toThrow(/octets d'aléa/);
  });

  it("rejects malformed ids before they can become a query", () => {
    for (const value of ["", "abc", "i".repeat(32), "A".repeat(32), `${"a".repeat(33)}`]) {
      expect(isVerificationId(value), value).toBe(false);
    }
  });
});

describe("what the document claims", () => {
  const base: CertificateContent = {
    holderLabel: "Ludovic Lefèvre",
    trackLabel: "Comptabilité générale",
    curriculumVersionId: "curriculum-2026-07",
    levelCount: 4,
    averageScore: 88,
    competencies: ["Enregistrer une facture"],
    caseStudies: ["Clôture mensuelle"],
    allLevelsAcquired: true
  };

  it("says réussite only when every level was acquired", () => {
    expect(certificateTitle(base)).toBe("Attestation de réussite");
    expect(certificateTitle({ ...base, allLevelsAcquired: false })).toBe(
      "Attestation de complétion"
    );
  });

  it("carries a disclaimer that denies any official certification", () => {
    expect(CERTIFICATE_DISCLAIMER).toMatch(/n'est ni un diplôme/);
    expect(CERTIFICATE_DISCLAIMER).toMatch(/reconnus par l'État/);
  });

  it("distinguishes revoked from superseded, which are not the same accusation", () => {
    expect(certificateStatusLabel("active")).toMatch(/valide/i);
    expect(certificateStatusLabel("revoked")).toMatch(/révoquée/i);
    expect(certificateStatusLabel("superseded")).toMatch(/remplacée/i);
  });
});

describe("subscription status classification", () => {
  it("agrees with the gate on every status Stripe defines", () => {
    // Two functions deciding access is one function too many; this pins them
    // together so a status can never be entitling to one and not the other.
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(classifySubscriptionStatus(status).entitling, status).toBe(isEntitlingStatus(status));
    }
  });

  it("grants on active and trialing, and on nothing else", () => {
    const entitling = SUBSCRIPTION_STATUSES.filter(
      (status) => classifySubscriptionStatus(status).entitling
    );

    expect(entitling).toEqual(["active", "trialing"]);
  });

  it("gives each of the six states named in the brief its own message", () => {
    const messages = new Map(
      (["active", "trialing", "past_due", "unpaid", "canceled", "incomplete"] as const).map(
        (status) => [status, classifySubscriptionStatus(status).learnerMessage]
      )
    );

    expect(new Set(messages.values()).size).toBe(messages.size);

    for (const [status, message] of messages) {
      expect(message.length, status).toBeGreaterThan(10);
    }
  });

  it("routes the recoverable states to the customer portal and the rest away from it", () => {
    expect(classifySubscriptionStatus("past_due").selfServiceable).toBe(true);
    expect(classifySubscriptionStatus("unpaid").selfServiceable).toBe(true);
    // An unconfirmed first payment is finished at checkout, not in the portal.
    expect(classifySubscriptionStatus("incomplete").selfServiceable).toBe(false);
  });

  it("closes access on a status this version has never seen", () => {
    const facts = classifySubscriptionStatus("quantum_superposition");

    expect(facts.entitling).toBe(false);
    expect(facts.kind).toBe("unknown");
  });
});
