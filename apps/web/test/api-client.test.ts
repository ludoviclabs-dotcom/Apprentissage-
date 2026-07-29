import { afterEach, describe, expect, it, vi } from "vitest";
import { postFormData, postJson } from "@/lib/api-client";

function respondWith(response: Response | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJson", () => {
  it("returns the parsed payload on success", async () => {
    respondWith(Response.json({ review: { nextDueAt: "2026-08-05" } }));

    const outcome = await postJson<{ review: { nextDueAt: string } }>("/api/x", {});

    expect(outcome).toEqual({ ok: true, data: { review: { nextDueAt: "2026-08-05" } } });
  });

  it("treats 204 as success with no payload", async () => {
    // Regression: calling .json() on an empty body threw, and a successful
    // sign-out was reported to the user as an unreadable response.
    respondWith(new Response(null, { status: 204 }));

    const outcome = await postJson("/api/auth/logout", {});

    expect(outcome).toEqual({ ok: true, data: null });
  });

  it("treats an explicit zero-length body as success", async () => {
    respondWith(new Response("", { status: 200, headers: { "content-length": "0" } }));

    await expect(postJson("/api/x", {})).resolves.toEqual({ ok: true, data: null });
  });

  it("surfaces the server error message on a failure status", async () => {
    respondWith(Response.json({ error: "Session requise" }, { status: 401 }));

    await expect(postJson("/api/x", {})).resolves.toEqual({ ok: false, error: "Session requise" });
  });

  it("falls back to the status code when the error body has no message", async () => {
    respondWith(Response.json({ nope: true }, { status: 500 }));

    await expect(postJson("/api/x", {})).resolves.toEqual({ ok: false, error: "Erreur 500" });
  });

  it("reports a failure status even when the body is not json", async () => {
    respondWith(new Response("<html>502</html>", { status: 502 }));

    await expect(postJson("/api/x", {})).resolves.toEqual({ ok: false, error: "Erreur 502" });
  });

  it("reports an unreadable body only when the status claimed success", async () => {
    respondWith(new Response("not json", { status: 200 }));

    const outcome = await postJson("/api/x", {});

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toMatch(/illisible/);
  });

  it("never rejects when the network fails", async () => {
    respondWith(new TypeError("Failed to fetch"));

    const outcome = await postJson("/api/x", {});

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.error).toMatch(/serveur local/);
  });
});

describe("postFormData", () => {
  it("returns the parsed payload on success", async () => {
    respondWith(Response.json({ file: { filename: "a.md" } }));

    const outcome = await postFormData<{ file: { filename: string } }>("/api/upload", new FormData());

    expect(outcome).toEqual({ ok: true, data: { file: { filename: "a.md" } } });
  });

  it("never rejects when the network fails", async () => {
    respondWith(new TypeError("Failed to fetch"));

    await expect(postFormData("/api/upload", new FormData())).resolves.toMatchObject({ ok: false });
  });
});
