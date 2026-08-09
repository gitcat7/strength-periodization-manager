import { describe, expect, it } from "vitest";
import { getLoginNext } from "./auth-redirect";

describe("getLoginNext", () => {
  it("defaults to the dashboard", () => {
    expect(getLoginNext(new URLSearchParams())).toBe("/");
  });

  it("keeps a safe internal path", () => {
    expect(getLoginNext(new URLSearchParams("next=%2Fhistory"))).toBe("/history");
  });

  it("rejects external and protocol-relative paths", () => {
    expect(getLoginNext(new URLSearchParams("next=https%3A%2F%2Fevil.example"))).toBe("/");
    expect(getLoginNext(new URLSearchParams("next=%2F%2Fevil.example"))).toBe("/");
  });

  it("rejects backslash paths that browsers normalize into external URLs", () => {
    expect(getLoginNext(new URLSearchParams("next=/%5C%5Cevil.example"))).toBe("/");
    expect(getLoginNext(new URLSearchParams("next=/%5cevil.example"))).toBe("/");
  });

  it("rejects control characters in the destination", () => {
    expect(getLoginNext(new URLSearchParams("next=%2Fhistory%0Ahttps%3A%2F%2Fevil.example"))).toBe("/");
  });
});
