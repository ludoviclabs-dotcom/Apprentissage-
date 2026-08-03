import { describe, expect, it } from "vitest";
import { resolvePublicHealth } from "@/lib/public-health";

describe("public health contract", () => {
  it("reports a public demo without internal configuration", () => {
    expect(
      resolvePublicHealth({ publicDemo: true, databaseActive: false, databaseReachable: false })
    ).toEqual({ status: "ok", mode: "public-demo", available: true });
  });

  it("reports a private deployment as unavailable when its configured database is down", () => {
    expect(
      resolvePublicHealth({ publicDemo: false, databaseActive: true, databaseReachable: false })
    ).toEqual({ status: "unavailable", mode: "private", available: false });
  });

  it("exposes only the documented public fields", () => {
    expect(Object.keys(resolvePublicHealth({ publicDemo: false, databaseActive: true, databaseReachable: true })).sort()).toEqual(
      ["available", "mode", "status"]
    );
  });
});
