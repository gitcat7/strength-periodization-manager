import type { ExerciseCatalogManifest, ExerciseCatalogRecord } from "../domain/exercise-catalog";

const catalogVerificationKey = "strength-training-exercise-catalog:last-verified";
const catalogBasePath = "/exercise-catalog";
const expectedDataFile = "exercises.118e4bd6.zh.json";
const expectedRecordCount = 1324;
const expectedSourceCommit = "118e4bd6b14da6df0e36605d7169b65db18389a4";
const expectedSourceRepository = "https://github.com/hasaneyldrm/exercises-dataset.git";

export type CatalogStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type CatalogFetchResponse = {
  ok: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

export type CatalogFetch = (
  input: string,
  init: { cache: "no-cache" }
) => Promise<CatalogFetchResponse>;

export type CatalogCrypto = {
  digest(algorithm: "SHA-256", data: BufferSource): Promise<ArrayBuffer>;
};

export type ExerciseCatalogClientLoaderDependencies = {
  fetchImpl: CatalogFetch;
  cryptoImpl: CatalogCrypto;
  storage: CatalogStorage;
};

export function createExerciseCatalogClientLoader({
  fetchImpl,
  cryptoImpl,
  storage
}: ExerciseCatalogClientLoaderDependencies) {
  let catalogPromise: Promise<ExerciseCatalogRecord[]> | null = null;

  function loadExerciseCatalog() {
    if (!catalogPromise) {
      catalogPromise = loadCatalog().catch((error) => {
        catalogPromise = null;
        throw error;
      });
    }

    return catalogPromise;
  }

  async function loadCatalog() {
    try {
      const manifest = await loadCurrentManifest();
      const records = await loadVerifiedCatalog(manifest);
      persistVerifiedManifest(manifest);
      return records;
    } catch (currentError) {
      const verifiedManifest = readVerifiedManifest();
      if (!verifiedManifest) throw currentError;

      return loadVerifiedCatalog(verifiedManifest);
    }
  }

  async function loadCurrentManifest() {
    const response = await fetchImpl(`${catalogBasePath}/manifest.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error("Catalog manifest request failed.");

    return parseManifest(await response.text());
  }

  async function loadVerifiedCatalog(manifest: ExerciseCatalogManifest) {
    const response = await fetchImpl(`${catalogBasePath}/${manifest.dataFile}`, { cache: "no-cache" });
    if (!response.ok) throw new Error("Catalog data request failed.");

    const bytes = new Uint8Array(await response.arrayBuffer());
    const checksum = await sha256(bytes, cryptoImpl);
    if (checksum !== manifest.sha256.toLocaleLowerCase()) {
      throw new Error("Catalog data checksum does not match the manifest.");
    }

    return parseRecords(new TextDecoder().decode(bytes), manifest.recordCount);
  }

  function readVerifiedManifest() {
    try {
      const rawManifest = storage.getItem(catalogVerificationKey);
      return rawManifest ? parseManifest(rawManifest) : null;
    } catch {
      return null;
    }
  }

  function persistVerifiedManifest(manifest: ExerciseCatalogManifest) {
    try {
      storage.setItem(catalogVerificationKey, JSON.stringify(manifest));
    } catch {
      // Storage availability must not affect catalog use.
    }
  }

  function clearExerciseCatalogVerificationState() {
    try {
      storage.removeItem(catalogVerificationKey);
    } catch {
      // Storage availability must not affect catalog use.
    }
  }

  async function loadExerciseCatalogRecord(externalId: string) {
    const records = await loadExerciseCatalog();
    return records.find((record) => record.externalId === externalId) ?? null;
  }

  return {
    clearExerciseCatalogVerificationState,
    loadExerciseCatalog,
    loadExerciseCatalogRecord
  };
}

const defaultLoader = createExerciseCatalogClientLoader({
  fetchImpl: (input, init) => fetch(input, init),
  cryptoImpl: {
    digest: (algorithm, data) => {
      if (!globalThis.crypto?.subtle) {
        return Promise.reject(new Error("Web Crypto is unavailable."));
      }
      return globalThis.crypto.subtle.digest(algorithm, data);
    }
  },
  storage: {
    getItem: (key) => getBrowserStorage()?.getItem(key) ?? null,
    removeItem: (key) => getBrowserStorage()?.removeItem(key),
    setItem: (key, value) => getBrowserStorage()?.setItem(key, value)
  }
});

export const loadExerciseCatalog = defaultLoader.loadExerciseCatalog;
export const loadExerciseCatalogRecord = defaultLoader.loadExerciseCatalogRecord;
export const clearExerciseCatalogVerificationState = defaultLoader.clearExerciseCatalogVerificationState;

function getBrowserStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseManifest(rawManifest: string): ExerciseCatalogManifest {
  let manifest: unknown;
  try {
    manifest = JSON.parse(rawManifest);
  } catch {
    throw new Error("Catalog manifest must be valid JSON.");
  }

  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Catalog manifest has an invalid shape.");
  }

  const candidate = manifest as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.recordCount !== expectedRecordCount ||
    candidate.sourceCommit !== expectedSourceCommit ||
    candidate.sourceRepository !== expectedSourceRepository ||
    typeof candidate.generatedAt !== "string" ||
    typeof candidate.dataFile !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(candidate.dataFile) ||
    candidate.dataFile !== expectedDataFile ||
    typeof candidate.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(candidate.sha256)
  ) {
    throw new Error("Catalog manifest has an invalid shape.");
  }

  return candidate as unknown as ExerciseCatalogManifest;
}

function parseRecords(rawRecords: string, expectedCount: number): ExerciseCatalogRecord[] {
  let records: unknown;
  try {
    records = JSON.parse(rawRecords);
  } catch {
    throw new Error("Catalog data must be valid JSON.");
  }

  if (!Array.isArray(records) || records.length !== expectedCount) {
    throw new Error(`Catalog data must contain exactly ${expectedCount} records.`);
  }

  const externalIds = new Set<string>();
  records.forEach((record, index) => {
    if (!isExerciseCatalogRecord(record)) {
      throw new Error(`Catalog record ${index} has an invalid shape.`);
    }
    if (externalIds.has(record.externalId)) {
      throw new Error(`Catalog data contains duplicate external ID: ${record.externalId}.`);
    }
    externalIds.add(record.externalId);
  });

  return records;
}

function isExerciseCatalogRecord(value: unknown): value is ExerciseCatalogRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.bodyPart === "string" &&
    typeof record.category === "string" &&
    typeof record.equipment === "string" &&
    typeof record.externalId === "string" &&
    typeof record.instructionsZh === "string" &&
    typeof record.muscleGroup === "string" &&
    typeof record.nameEn === "string" &&
    record.nameZh === null &&
    Array.isArray(record.secondaryMuscles) &&
    record.secondaryMuscles.every((muscle) => typeof muscle === "string") &&
    typeof record.target === "string"
  );
}

async function sha256(bytes: Uint8Array, cryptoImpl: CatalogCrypto) {
  const digest = await cryptoImpl.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
