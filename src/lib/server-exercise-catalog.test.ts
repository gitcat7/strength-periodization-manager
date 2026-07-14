import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createServerExerciseCatalogLoader } from "./server-exercise-catalog";

const catalogDataFile = "exercises.118e4bd6.zh.json";

describe("createServerExerciseCatalogLoader", () => {
  it("validates catalog bytes and memoizes the fulfilled catalog promise", async () => {
    const directory = await writeCatalogFixture();
    const readFileImpl = vi.fn(async (filePath: string, encoding?: BufferEncoding) =>
      encoding ? readFile(filePath, encoding) : readFile(filePath)
    );
    const loader = createServerExerciseCatalogLoader({ cwd: directory, readFileImpl });

    try {
      const firstLoad = loader.getServerExerciseCatalog();
      const secondLoad = loader.getServerExerciseCatalog();

      expect(secondLoad).toBe(firstLoad);
      const [firstRecords, secondRecords] = await Promise.all([firstLoad, secondLoad]);
      expect(firstRecords[0]).toMatchObject({ externalId: "server-0000" });
      expect(secondRecords[0]).toMatchObject({ externalId: "server-0000" });
      expect(readFileImpl).toHaveBeenCalledTimes(2);
      await expect(loader.getServerExerciseCatalogRecord("server-0000")).resolves.toMatchObject({
        externalId: "server-0000"
      });
      expect(readFileImpl).toHaveBeenCalledTimes(2);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects catalog bytes that no longer match the manifest checksum", async () => {
    const directory = await writeCatalogFixture({
      data: catalogBytes("changed"),
      manifestData: catalogBytes("server")
    });
    const loader = createServerExerciseCatalogLoader({ cwd: directory });

    try {
      await expect(loader.getServerExerciseCatalog()).rejects.toThrow(/checksum/i);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects a safe but non-pinned catalog data filename", async () => {
    const directory = await writeCatalogFixture({ dataFile: "other-safe.json" });
    const loader = createServerExerciseCatalogLoader({ cwd: directory });

    try {
      await expect(loader.getServerExerciseCatalog()).rejects.toThrow(/manifest.*invalid shape/i);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects catalog artifacts with an unreviewed raw Chinese name", async () => {
    const directory = await writeCatalogFixture({
      data: catalogBytes("raw-name", { nameZh: "未经审核的中文名称" })
    });
    const loader = createServerExerciseCatalogLoader({ cwd: directory });

    try {
      await expect(loader.getServerExerciseCatalog()).rejects.toThrow(/record.*invalid shape/i);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("clears a rejected load so a later real file read can succeed", async () => {
    const validData = catalogBytes("retry");
    const directory = await writeCatalogFixture({
      data: catalogBytes("changed"),
      manifestData: validData
    });
    const loader = createServerExerciseCatalogLoader({ cwd: directory });

    try {
      await expect(loader.getServerExerciseCatalog()).rejects.toThrow(/checksum/i);
      await writeFile(join(directory, "public", "exercise-catalog", catalogDataFile), validData);
      await expect(loader.getServerExerciseCatalog()).resolves.toHaveLength(1324);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns reviewed Chinese detail with full instructions", async () => {
    const directory = await writeCatalogFixture({
      data: catalogBytes("detail", { firstExternalId: "0025" })
    });
    const loader = createServerExerciseCatalogLoader({ cwd: directory });

    try {
      await expect(loader.getServerExerciseCatalogRecord("0025")).resolves.toMatchObject({
        externalId: "0025",
        nameZh: "卧推",
        instructionsZh: "中文说明"
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

async function writeCatalogFixture({
  data = catalogBytes("server"),
  manifestData = data,
  dataFile = catalogDataFile
}: {
  data?: Uint8Array;
  manifestData?: Uint8Array;
  dataFile?: string;
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "server-exercise-catalog-"));
  const catalogDirectory = join(directory, "public", "exercise-catalog");
  await mkdir(catalogDirectory, { recursive: true });
  await writeFile(join(catalogDirectory, dataFile), data);
  await writeFile(
    join(catalogDirectory, "manifest.json"),
    JSON.stringify({
      generatedAt: "2026-07-09T18:10:06Z",
      recordCount: 1324,
      schemaVersion: 1,
      dataFile,
      sha256: sha256(manifestData),
      sourceCommit: "118e4bd6b14da6df0e36605d7169b65db18389a4",
      sourceRepository: "https://github.com/hasaneyldrm/exercises-dataset.git"
    })
  );
  return directory;
}

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

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}
