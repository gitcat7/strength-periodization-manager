import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createExerciseCatalogClientLoader,
  type CatalogStorage
} from "./exercise-catalog-client";

const catalogVerificationKey = "strength-training-exercise-catalog:last-verified";
const catalogDataFile = "exercises.118e4bd6.zh.json";
const catalogDataPath = `/exercise-catalog/${catalogDataFile}`;

describe("createExerciseCatalogClientLoader", () => {
  it("does not fetch the catalog until it is requested", async () => {
    const bytes = catalogBytes("old");
    const fetchImpl = vi.fn(fetchFrom({
      "/exercise-catalog/manifest.json": manifestBytes(bytes),
      [catalogDataPath]: bytes
    }));
    const loader = createExerciseCatalogClientLoader({
      fetchImpl,
      cryptoImpl: cryptoForTests,
      storage: memoryStorage()
    });

    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(loader.loadExerciseCatalog()).resolves.toHaveLength(1324);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/exercise-catalog/manifest.json", {
      cache: "no-cache"
    });
  });

  it("rejects bytes whose checksum does not match the current manifest", async () => {
    const expectedBytes = catalogBytes("expected");
    const storage = memoryStorage();
    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": manifestBytes(expectedBytes),
        [catalogDataPath]: catalogBytes("altered")
      }),
      cryptoImpl: cryptoForTests,
      storage
    });

    await expect(loader.loadExerciseCatalog()).rejects.toThrow(/checksum/i);
    expect(storage.getItem(catalogVerificationKey)).toBeNull();
  });

  it("falls back to the last verified manifest when the current data fails verification", async () => {
    const priorBytes = catalogBytes("prior");
    const currentBytes = catalogBytes("current");
    const storage = memoryStorage();

    const priorLoader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": manifestBytes(priorBytes),
        [catalogDataPath]: priorBytes
      }),
      cryptoImpl: cryptoForTests,
      storage
    });
    await priorLoader.loadExerciseCatalog();

    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": manifestBytes(currentBytes),
        [catalogDataPath]: [catalogBytes("tampered"), priorBytes]
      }),
      cryptoImpl: cryptoForTests,
      storage
    });

    const records = await loader.loadExerciseCatalog();
    expect(records[0]).toMatchObject({ externalId: "prior-0000" });
  });

  it("does not replace the verified manifest pointer when the current manifest is malformed", async () => {
    const priorBytes = catalogBytes("prior");
    const storage = memoryStorage();
    const priorManifest = manifestBytes(priorBytes);
    const priorLoader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": priorManifest,
        [catalogDataPath]: priorBytes
      }),
      cryptoImpl: cryptoForTests,
      storage
    });
    await priorLoader.loadExerciseCatalog();

    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": new TextEncoder().encode("not json"),
        [catalogDataPath]: priorBytes
      }),
      cryptoImpl: cryptoForTests,
      storage
    });

    await expect(loader.loadExerciseCatalog()).resolves.toHaveLength(1324);
    expect(storage.getItem(catalogVerificationKey)).toBe(new TextDecoder().decode(priorManifest));
  });

  it("shares one in-flight catalog request across concurrent callers", async () => {
    const bytes = catalogBytes("shared");
    const fetchImpl = vi.fn(fetchFrom({
      "/exercise-catalog/manifest.json": manifestBytes(bytes),
      [catalogDataPath]: bytes
    }));
    const loader = createExerciseCatalogClientLoader({
      fetchImpl,
      cryptoImpl: cryptoForTests,
      storage: memoryStorage()
    });

    const firstLoad = loader.loadExerciseCatalog();
    const secondLoad = loader.loadExerciseCatalog();

    expect(secondLoad).toBe(firstLoad);
    await expect(Promise.all([firstLoad, secondLoad])).resolves.toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("clears only the catalog verification key", () => {
    const storage = memoryStorage({
      [catalogVerificationKey]: "verified manifest",
      "strength-training-cache:today": "training cache"
    });
    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({}),
      cryptoImpl: cryptoForTests,
      storage
    });

    loader.clearExerciseCatalogVerificationState();

    expect(storage.getItem(catalogVerificationKey)).toBeNull();
    expect(storage.getItem("strength-training-cache:today")).toBe("training cache");
  });

  it("rejects a safe but non-pinned catalog data filename", async () => {
    const bytes = catalogBytes("other");
    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": manifestBytes(bytes, "other-safe.json"),
        "/exercise-catalog/other-safe.json": bytes
      }),
      cryptoImpl: cryptoForTests,
      storage: memoryStorage()
    });

    await expect(loader.loadExerciseCatalog()).rejects.toThrow(/manifest.*invalid shape/i);
  });

  it("rejects catalog artifacts with an unreviewed raw Chinese name", async () => {
    const bytes = catalogBytes("raw-name", { nameZh: "未经审核的中文名称" });
    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": manifestBytes(bytes),
        [catalogDataPath]: bytes
      }),
      cryptoImpl: cryptoForTests,
      storage: memoryStorage()
    });

    await expect(loader.loadExerciseCatalog()).rejects.toThrow(/record.*invalid shape/i);
  });

  it("clears a rejected load so a later real fetch can succeed", async () => {
    const bytes = catalogBytes("retry");
    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": [
          new TextEncoder().encode("not json"),
          manifestBytes(bytes)
        ],
        [catalogDataPath]: bytes
      }),
      cryptoImpl: cryptoForTests,
      storage: memoryStorage()
    });

    await expect(loader.loadExerciseCatalog()).rejects.toThrow(/valid JSON/i);
    await expect(loader.loadExerciseCatalog()).resolves.toHaveLength(1324);
  });

  it("returns reviewed Chinese detail with full instructions", async () => {
    const bytes = catalogBytes("detail", { firstExternalId: "0025" });
    const loader = createExerciseCatalogClientLoader({
      fetchImpl: fetchFrom({
        "/exercise-catalog/manifest.json": manifestBytes(bytes),
        [catalogDataPath]: bytes
      }),
      cryptoImpl: cryptoForTests,
      storage: memoryStorage()
    });

    await expect(loader.loadExerciseCatalogRecord("0025")).resolves.toMatchObject({
      externalId: "0025",
      nameZh: "卧推",
      instructionsZh: "中文说明"
    });
  });
});

function catalogBytes(
  prefix: string,
  {
    firstExternalId,
    nameZh = null
  }: { firstExternalId?: string; nameZh?: string | null } = {}
) {
  return new TextEncoder().encode(
    JSON.stringify(
      Array.from({ length: 1324 }, (_, index) => ({
        bodyPart: "back",
        category: "back",
        equipment: "cable",
        externalId: index === 0 && firstExternalId ? firstExternalId : `${prefix}-${String(index).padStart(4, "0")}`,
        instructionsZh: "中文说明",
        muscleGroup: "rhomboids",
        nameEn: "cable row",
        nameZh,
        secondaryMuscles: ["biceps"],
        target: "lats"
      }))
    )
  );
}

function manifestBytes(data: Uint8Array, dataFile = catalogDataFile) {
  return new TextEncoder().encode(
    JSON.stringify({
      generatedAt: "2026-07-09T18:10:06Z",
      recordCount: 1324,
      schemaVersion: 1,
      dataFile,
      sha256: sha256(data),
      sourceCommit: "118e4bd6b14da6df0e36605d7169b65db18389a4",
      sourceRepository: "https://github.com/hasaneyldrm/exercises-dataset.git"
    })
  );
}

function fetchFrom(responses: Record<string, Uint8Array | Uint8Array[]>) {
  return async (input: string) => {
    const response = responses[input];
    const bytes = Array.isArray(response) ? response.shift() : response;
    if (!bytes) throw new Error(`Unexpected fetch: ${input}`);

    return {
      ok: true,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      text: async () => new TextDecoder().decode(bytes)
    };
  };
}

function memoryStorage(initial: Record<string, string> = {}): CatalogStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

const cryptoForTests = {
  digest: async (_algorithm: "SHA-256", data: BufferSource) => {
    const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
    return bytesToArrayBuffer(createHash("sha256").update(bytes).digest());
  }
};

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
