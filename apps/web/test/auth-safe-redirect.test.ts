import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeRedirectPath("/progression")).toBe("/progression");
    expect(safeRedirectPath("/exercices/ex-1?tab=2")).toBe("/exercices/ex-1?tab=2");
  });

  it("falls back when nothing is provided", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("refuses absolute urls", () => {
    expect(safeRedirectPath("https://evil.example/steal")).toBe("/");
    expect(safeRedirectPath("http://evil.example")).toBe("/");
  });

  it("refuses protocol-relative targets", () => {
    expect(safeRedirectPath("//evil.example/steal")).toBe("/");
    expect(safeRedirectPath("/\\evil.example")).toBe("/");
  });

  it("refuses embedded schemes and header injection", () => {
    expect(safeRedirectPath("/redirect?to=javascript://evil")).toBe("/");
    expect(safeRedirectPath("/progression\r\nSet-Cookie: a=b")).toBe("/");
    expect(safeRedirectPath("/progression\nX-Injected: 1")).toBe("/");
  });

  it("refuses relative paths that are not rooted", () => {
    expect(safeRedirectPath("progression")).toBe("/");
    expect(safeRedirectPath("../etc/passwd")).toBe("/");
  });

  it("honours an explicit fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/account")).toBe("/account");
  });
});
