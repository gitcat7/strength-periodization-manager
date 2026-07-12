import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ExerciseCatalogManifest, ExerciseCatalogRecord } from "../domain/exercise-catalog";

const expectedRecordCount = 1324;
const expectedDataFile = "exercises.118e4bd6.zh.json";
const expectedSourceCommit = "118e4bd6b14da6df0e36605d7169b65db18389a4";
const expectedSourceRepository = "https://github.com/hasaneyldrm/exercises-dataset.git";

export type ServerExerciseCatalogLoaderDependencies = {
  cwd?: string;
  readFileImpl?: (filePath: string, encoding?: BufferEncoding) => Promise<string | Buffer>;
};

export function createServerExerciseCatalogLoader({
  cwd = process.cwd(),
  readFileImpl = readFile as (filePath: string, encoding?: BufferEncoding) => Promise<string | Buffer>
}: ServerExerciseCatalogLoaderDependencies = {}) {
  const catalogDirectory = join(cwd, "public", "exercise-catalog");
  let catalogPromise: Promise<ExerciseCatalogRecord[]> | null = null;

  function getServerExerciseCatalog() {
    if (!catalogPromise) {
      catalogPromise = loadCatalog().catch((error) => {
        catalogPromise = null;
        throw error;
      });
    }

    return catalogPromise;
  }

  async function loadCatalog() {
    const manifestPath = join(catalogDirectory, "manifest.json");
    const manifestText = await readFileImpl(manifestPath, "utf8");
    if (typeof manifestText !== "string") throw new Error("Catalog manifest must be text.");
    const manifest = parseManifest(manifestText);
    const dataPath = join(catalogDirectory, manifest.dataFile);
    const data = await readFileImpl(dataPath);
    if (typeof data === "string") throw new Error("Catalog data must be bytes.");
    const bytes = new Uint8Array(data);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== manifest.sha256.toLocaleLowerCase()) {
      throw new Error("Catalog data checksum does not match the manifest.");
    }

    return parseRecords(new TextDecoder().decode(bytes), manifest.recordCount);
  }

  async function getServerExerciseCatalogRecord(externalId: string) {
    const records = await getServerExerciseCatalog();
    return records.find((record) => record.externalId === externalId) ?? null;
  }

  return {
    getServerExerciseCatalog,
    getServerExerciseCatalogRecord
  };
}

const defaultLoader = createServerExerciseCatalogLoader();

export const getServerExerciseCatalog = defaultLoader.getServerExerciseCatalog;
export const getServerExerciseCatalogRecord = defaultLoader.getServerExerciseCatalogRecord;

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
