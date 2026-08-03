import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns only the public health contract", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(["available", "mode", "status"]);
    expect(body).not.toHaveProperty("database");
    expect(body).not.toHaveProperty("auth");
    expect(body).not.toHaveProperty("safeguards");
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
  });
});
