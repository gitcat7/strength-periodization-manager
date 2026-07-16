import { describe, expect, it } from "vitest";
import { isNavigationItemActive } from "./navigation-state";

describe("isNavigationItemActive", () => {
  it("does not treat the progress route as the PR route", () => {
    expect(isNavigationItemActive("/progress", "/progress")).toBe(true);
    expect(isNavigationItemActive("/progress", "/pr")).toBe(false);
  });

  it("keeps a navigation item active for its own nested routes", () => {
    expect(isNavigationItemActive("/pr", "/pr")).toBe(true);
    expect(isNavigationItemActive("/pr/goals", "/pr")).toBe(true);
  });
});
