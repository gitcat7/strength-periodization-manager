import { describe, expect, it, vi } from "vitest";

import { clearWorkoutDrafts } from "./client-cache";

function createMockStorage(): Storage {
  const store = new Map<string, string>();

  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
    clear() {
      store.clear();
    }
  };
}

function setMockLocalStorage(localStorage: Storage | undefined) {
  const mockWindow = localStorage ? { localStorage } : {};
  vi.stubGlobal("window", mockWindow);
}

describe("clearWorkoutDrafts", () => {
  it("removes only draft keys for the provided workout IDs", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    localStorage.setItem("strength-training-draft:workout-a", "{}");
    localStorage.setItem("strength-training-draft:workout-b", "{}");
    localStorage.setItem("strength-training-draft:workout-c", "{}");
    localStorage.setItem("strength-training-cache:today", "{}");
    localStorage.setItem("strength-training-rest-timer", "{}");

    clearWorkoutDrafts(["workout-a", "workout-c"]);

    expect(localStorage.getItem("strength-training-draft:workout-a")).toBeNull();
    expect(localStorage.getItem("strength-training-draft:workout-b")).not.toBeNull();
    expect(localStorage.getItem("strength-training-draft:workout-c")).toBeNull();
    expect(localStorage.getItem("strength-training-cache:today")).not.toBeNull();
    expect(localStorage.getItem("strength-training-rest-timer")).not.toBeNull();
  });

  it("does nothing when no workout IDs are provided", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    localStorage.setItem("strength-training-draft:workout-a", "{}");
    localStorage.setItem("strength-training-cache:today", "{}");

    clearWorkoutDrafts([]);

    expect(localStorage.getItem("strength-training-draft:workout-a")).not.toBeNull();
    expect(localStorage.getItem("strength-training-cache:today")).not.toBeNull();
  });

  it("ignores non-draft keys even when they contain a workout ID substring", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    localStorage.setItem("other-prefix:workout-a", "{}");

    clearWorkoutDrafts(["workout-a"]);

    expect(localStorage.getItem("other-prefix:workout-a")).not.toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    setMockLocalStorage(undefined);

    expect(() => clearWorkoutDrafts(["workout-a"])).not.toThrow();
  });
});
