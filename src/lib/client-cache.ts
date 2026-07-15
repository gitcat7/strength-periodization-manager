type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

const defaultMaxAgeMs = 5 * 60 * 1000;
const cachePrefix = "strength-training-cache:";

export function readClientCache<T>(key: string, maxAgeMs = defaultMaxAgeMs): T | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    if (!rawValue) return null;

    const envelope = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (!envelope.savedAt || Date.now() - envelope.savedAt > maxAgeMs) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
      return null;
    }

    return envelope.value;
  } catch {
    return null;
  }
}

export function writeClientCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    const envelope: CacheEnvelope<T> = {
      savedAt: Date.now(),
      value
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Cache failures should never block the training workflow.
  }
}

export function clearClientCache(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  } catch {
    // Cache failures should never block the training workflow.
  }
}

export function clearTrainingDataCaches() {
  if (typeof window === "undefined") return;

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const keysToRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(cachePrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => storage.removeItem(key));
    }
  } catch {
    // Cache failures should never block the training workflow.
  }
}

export function clearTodayAndPlanCaches() {
  if (typeof window === "undefined") return;

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage.removeItem(`${cachePrefix}today`);
      storage.removeItem(`${cachePrefix}plan`);
    }
  } catch {
    // Cache failures should never block the rest-day completion workflow.
  }
}

const draftPrefix = "strength-training-draft:";

export function clearProgramRegenerationCaches() {
  if (typeof window === "undefined") return;

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const keysToRemove: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(cachePrefix) || key?.startsWith(draftPrefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => storage.removeItem(key));
    }
  } catch {
    // Cache failures should never block the program replacement workflow.
  }
}

export function clearWorkoutDrafts(workoutIds: string[]): boolean {
  if (workoutIds.length === 0) return true;
  if (typeof window === "undefined") return false;

  try {
    const allKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) allKeys.push(key);
    }

    const keysToRemove = allKeys.filter((key) => {
      if (!key.startsWith(draftPrefix)) return false;
      const workoutId = key.slice(draftPrefix.length);
      return workoutIds.includes(workoutId);
    });
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    return true;
  } catch {
    // Draft cleanup failures should never block the substitution flow.
    return false;
  }
}

export function clearWorkoutDraftsByExerciseIds(workoutExerciseIds: string[]): boolean {
  if (workoutExerciseIds.length === 0) return true;
  if (typeof window === "undefined") return false;

  try {
    const allKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key) allKeys.push(key);
    }

    const draftKeys = allKeys.filter((key) => key.startsWith(draftPrefix));
    const keysToRemove: string[] = [];
    let cleanupConfirmed = true;

    for (const key of draftKeys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        const draftKeys = Object.keys(draft);
        const hasMatch = draftKeys.some((draftKey) => {
          const exerciseLogs = draft[draftKey];
          if (!Array.isArray(exerciseLogs)) return false;
          return exerciseLogs.some(
            (log: unknown) =>
              log &&
              typeof log === "object" &&
              workoutExerciseIds.includes((log as { workout_exercise_id?: string }).workout_exercise_id ?? "")
          );
        });
        if (hasMatch) {
          keysToRemove.push(key);
        }
      } catch {
        // If we can't parse the draft, be conservative and leave it.
        cleanupConfirmed = false;
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    return cleanupConfirmed;
  } catch {
    // Draft cleanup failures should never block the substitution flow.
    return false;
  }
}
