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
