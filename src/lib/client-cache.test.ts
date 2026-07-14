import { describe, expect, it, vi } from "vitest";

import { clearWorkoutDrafts, clearWorkoutDraftsByExerciseIds } from "./client-cache";

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

    expect(clearWorkoutDrafts(["workout-a", "workout-c"])).toBe(true);

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

    expect(clearWorkoutDrafts([])).toBe(true);

    expect(localStorage.getItem("strength-training-draft:workout-a")).not.toBeNull();
    expect(localStorage.getItem("strength-training-cache:today")).not.toBeNull();
  });

  it("ignores non-draft keys even when they contain a workout ID substring", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    localStorage.setItem("other-prefix:workout-a", "{}");

    expect(clearWorkoutDrafts(["workout-a"])).toBe(true);

    expect(localStorage.getItem("other-prefix:workout-a")).not.toBeNull();
  });

  it("reports false when localStorage is unavailable", () => {
    setMockLocalStorage(undefined);

    expect(clearWorkoutDrafts(["workout-a"])).toBe(false);
  });

  it("reports false when a targeted draft cannot be removed", () => {
    const localStorage = createMockStorage();
    const removeItem = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = (key) => {
      if (key === "strength-training-draft:workout-a") throw new Error("storage denied");
      removeItem(key);
    };
    setMockLocalStorage(localStorage);
    localStorage.setItem("strength-training-draft:workout-a", "{}");

    expect(clearWorkoutDrafts(["workout-a"])).toBe(false);
    expect(localStorage.getItem("strength-training-draft:workout-a")).toBe("{}");
  });
});

describe("clearWorkoutDraftsByExerciseIds", () => {
  it("removes drafts that contain matching workout_exercise_id in their logs", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    const draftWithMatch = {
      "we-1": [
        { workout_exercise_id: "we-1", set_index: 1, actual_weight: 10 },
        { workout_exercise_id: "we-1", set_index: 2, actual_weight: 12 }
      ],
      "we-2": [
        { workout_exercise_id: "we-2", set_index: 1, actual_weight: 15 }
      ]
    };

    const draftWithoutMatch = {
      "we-3": [
        { workout_exercise_id: "we-3", set_index: 1, actual_weight: 20 }
      ]
    };

    localStorage.setItem("strength-training-draft:workout-a", JSON.stringify(draftWithMatch));
    localStorage.setItem("strength-training-draft:workout-b", JSON.stringify(draftWithoutMatch));
    localStorage.setItem("strength-training-cache:today", "{}");

    expect(clearWorkoutDraftsByExerciseIds(["we-1"])).toBe(true);

    expect(localStorage.getItem("strength-training-draft:workout-a")).toBeNull();
    expect(localStorage.getItem("strength-training-draft:workout-b")).not.toBeNull();
    expect(localStorage.getItem("strength-training-cache:today")).not.toBeNull();
  });

  it("removes a draft when any nested log matches the exercise ID", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    const draft = {
      "we-a": [
        { workout_exercise_id: "we-a", set_index: 1 },
        { workout_exercise_id: "we-b", set_index: 1 }
      ]
    };

    localStorage.setItem("strength-training-draft:workout-x", JSON.stringify(draft));

    expect(clearWorkoutDraftsByExerciseIds(["we-b"])).toBe(true);

    expect(localStorage.getItem("strength-training-draft:workout-x")).toBeNull();
  });

  it("does not remove drafts with no matching exercise IDs", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    const draft = {
      "we-a": [{ workout_exercise_id: "we-a", set_index: 1 }]
    };

    localStorage.setItem("strength-training-draft:workout-x", JSON.stringify(draft));

    expect(clearWorkoutDraftsByExerciseIds(["we-z"])).toBe(true);

    expect(localStorage.getItem("strength-training-draft:workout-x")).not.toBeNull();
  });

  it("does not remove unparseable drafts", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    localStorage.setItem("strength-training-draft:workout-a", "not-valid-json");

    expect(clearWorkoutDraftsByExerciseIds(["we-1"])).toBe(false);

    expect(localStorage.getItem("strength-training-draft:workout-a")).not.toBeNull();
  });

  it("does nothing when no exercise IDs are provided", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    localStorage.setItem("strength-training-draft:workout-a", "{}");

    expect(clearWorkoutDraftsByExerciseIds([])).toBe(true);

    expect(localStorage.getItem("strength-training-draft:workout-a")).not.toBeNull();
  });

  it("reports false when localStorage is unavailable", () => {
    setMockLocalStorage(undefined);

    expect(clearWorkoutDraftsByExerciseIds(["we-1"])).toBe(false);
  });

  it("does not remove non-draft keys", () => {
    const localStorage = createMockStorage();
    setMockLocalStorage(localStorage);

    localStorage.setItem("other-key", JSON.stringify({ "we-1": [{ workout_exercise_id: "we-1" }] }));

    expect(clearWorkoutDraftsByExerciseIds(["we-1"])).toBe(true);

    expect(localStorage.getItem("other-key")).not.toBeNull();
  });
});
