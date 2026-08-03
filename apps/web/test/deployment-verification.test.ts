import { describe, expect, it } from "vitest";
import {
  REQUIRED_SECURITY_HEADERS,
  deploymentUrlArgument,
  inspectDeploymentResponse,
  parseDeploymentUrl
} from "../../../scripts/verify-deployment";

function protectedResponse(body = "<main>Finance Learning Hub</main>") {
  return new Response(body, {
    status: 200,
    headers: REQUIRED_SECURITY_HEADERS
  });
}

describe("deployment verification", () => {
  it("accepts a public HTTPS deployment URL", () => {
    expect(parseDeploymentUrl("https://preview.example.test/path").origin).toBe("https://preview.example.test");
  });

  it("rejects missing and non-HTTP deployment URLs", () => {
    expect(() => parseDeploymentUrl(undefined)).toThrow(/Usage/);
    expect(() => parseDeploymentUrl("file:///tmp/site")).toThrow(/http or https/);
  });

  it("accepts pnpm's forwarded argument separator", () => {
    expect(deploymentUrlArgument(["--", "https://preview.example.test"])).toBe("https://preview.example.test");
  });

  it("flags missing security headers and sensitive response content", () => {
    const check = inspectDeploymentResponse(
      "/api/health",
      new Response("Error: failed\n    at handler (app/route.ts:1:1)\npostgresql://user:password@example.test/db"),
      "Error: failed\n    at handler (app/route.ts:1:1)\npostgresql://user:password@example.test/db"
    );

    expect(check.issues).toContain("missing or unexpected x-frame-options");
    expect(check.issues).toContain("response contains PostgreSQL connection string");
    expect(check.issues).toContain("response contains stack trace");
  });

  it("accepts a safe response with every expected header", () => {
    expect(inspectDeploymentResponse("/", protectedResponse(), "<main>Finance Learning Hub</main>").issues).toEqual([]);
  });
});
