type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

const defaultMaxAgeMs = 5 * 60 * 1000;

export function readClientCache<T>(key: string, maxAgeMs = defaultMaxAgeMs): T | null {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(key);
    if (!rawValue) return null;

    const envelope = JSON.parse(rawValue) as CacheEnvelope<T>;
    if (!envelope.savedAt || Date.now() - envelope.savedAt > maxAgeMs) {
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
    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Cache failures should never block the training workflow.
  }
}
