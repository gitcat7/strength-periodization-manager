import { describe, expect, it } from "vitest";
import { getLoginNext } from "./magic-link";

describe("getLoginNext", () => {
  it("uses the dashboard when the login URL has no next parameter", () => {
    expect(getLoginNext(new URLSearchParams())).toBe("/");
  });

  it("keeps a safe explicit next path", () => {
    expect(getLoginNext(new URLSearchParams("next=%2Fsingle-workout"))).toBe("/single-workout");
  });

  it("rejects an unsafe callback destination", () => {
    expect(getLoginNext(new URLSearchParams("next=%2F%2Fevil.example"))).toBe("/");
  });
});
