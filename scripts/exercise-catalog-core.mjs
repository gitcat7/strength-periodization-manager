import { createHash } from "node:crypto";
import { access, readFile, rename, rm } from "node:fs/promises";

export const SOURCE_COMMIT = "118e4bd6b14da6df0e36605d7169b65db18389a4";
export const SOURCE_REPOSITORY = "https://github.com/hasaneyldrm/exercises-dataset.git";
export const SOURCE_COMMIT_TIME = "2026-07-09T18:10:06Z";
export const RECORD_COUNT = 1324;
export const DATA_FILE = "exercises.118e4bd6.zh.json";

const defaultFileSystem = { access, rename, rm };

const NORMALIZED_KEYS = [
  "bodyPart",
  "category",
  "equipment",
  "externalId",
  "instructionsZh",
  "muscleGroup",
  "nameEn",
  "nameZh",
  "secondaryMuscles",
  "target"
];

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-blank string.`);
  }

  return value.trim();
}

function normalizeSecondaryMuscles(value, index) {
  if (!Array.isArray(value)) {
    throw new Error(`Record ${index} secondary_muscles must be an array.`);
  }

  return value.map((muscle, muscleIndex) =>
    requiredString(muscle, `Record ${index} secondary_muscles[${muscleIndex}]`)
  );
}

export function normalizeCatalog(source, { expectedCount = RECORD_COUNT } = {}) {
  if (!Array.isArray(source)) {
    throw new Error("Exercise catalog source must be an array.");
  }

  if (source.length !== expectedCount) {
    throw new Error(`Exercise catalog must contain exactly ${expectedCount} records.`);
  }

  const externalIds = new Set();
  const records = source.map((record, index) => {
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`Record ${index} must be an object.`);
    }

    const externalId = requiredString(record.id, `Record ${index} id`);
    if (externalIds.has(externalId)) {
      throw new Error(`Duplicate external ID: ${externalId}.`);
    }
    externalIds.add(externalId);

    if (
      record.instructions === null ||
      typeof record.instructions !== "object" ||
      Array.isArray(record.instructions)
    ) {
      throw new Error(`Record ${index} instructions.zh must be a non-blank string.`);
    }

    return {
      bodyPart: requiredString(record.body_part, `Record ${index} body_part`),
      category: requiredString(record.category, `Record ${index} category`),
      equipment: requiredString(record.equipment, `Record ${index} equipment`),
      externalId,
      instructionsZh: requiredString(record.instructions.zh, `Record ${index} instructions.zh`),
      muscleGroup: requiredString(record.muscle_group, `Record ${index} muscle_group`),
      nameEn: requiredString(record.name, `Record ${index} name`),
      nameZh: null,
      secondaryMuscles: normalizeSecondaryMuscles(record.secondary_muscles, index),
      target: requiredString(record.target, `Record ${index} target`)
    };
  });

  return records.sort((left, right) => {
    if (left.externalId < right.externalId) return -1;
    if (left.externalId > right.externalId) return 1;
    return 0;
  });
}

export function buildManifest(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("Catalog bytes must be a Uint8Array.");
  }

  return {
    generatedAt: SOURCE_COMMIT_TIME,
    recordCount: RECORD_COUNT,
    schemaVersion: 1,
    dataFile: DATA_FILE,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sourceCommit: SOURCE_COMMIT,
    sourceRepository: SOURCE_REPOSITORY
  };
}

async function fileExists(filePath, fileSystem) {
  try {
    await fileSystem.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfPresent(filePath, fileSystem) {
  await fileSystem.rm(filePath, { force: true });
}

async function restoreOriginalArtifact({ destinationPath, backupPath, hadOriginal, fileSystem }) {
  if (await fileExists(backupPath, fileSystem)) {
    await removeIfPresent(destinationPath, fileSystem);
    await fileSystem.rename(backupPath, destinationPath);
    return;
  }

  if (!hadOriginal) {
    await removeIfPresent(destinationPath, fileSystem);
  }
}

export async function publishCatalogArtifacts({
  dataPath,
  manifestPath,
  dataTemporaryPath,
  manifestTemporaryPath,
  fileSystem = defaultFileSystem
}) {
  const dataBackupPath = `${dataPath}.backup`;
  const manifestBackupPath = `${manifestPath}.backup`;
  const dataHadOriginal = await fileExists(dataPath, fileSystem);
  const manifestHadOriginal = await fileExists(manifestPath, fileSystem);

  try {
    if (dataHadOriginal) {
      await fileSystem.rename(dataPath, dataBackupPath);
    }
    if (manifestHadOriginal) {
      await fileSystem.rename(manifestPath, manifestBackupPath);
    }

    await fileSystem.rename(dataTemporaryPath, dataPath);
    await fileSystem.rename(manifestTemporaryPath, manifestPath);

    await Promise.all([
      removeIfPresent(dataBackupPath, fileSystem),
      removeIfPresent(manifestBackupPath, fileSystem)
    ]);
  } catch (error) {
    const rollbackErrors = [];

    for (const artifact of [
      {
        destinationPath: dataPath,
        backupPath: dataBackupPath,
        hadOriginal: dataHadOriginal
      },
      {
        destinationPath: manifestPath,
        backupPath: manifestBackupPath,
        hadOriginal: manifestHadOriginal
      }
    ]) {
      try {
        await restoreOriginalArtifact({ ...artifact, fileSystem });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    await Promise.all([
      removeIfPresent(dataTemporaryPath, fileSystem),
      removeIfPresent(manifestTemporaryPath, fileSystem)
    ]);

    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Catalog artifact publication failed.");
    }

    throw error;
  }
}

function assertNormalizedRecord(record, index) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Normalized record ${index} must be an object.`);
  }

  if (JSON.stringify(Object.keys(record)) !== JSON.stringify(NORMALIZED_KEYS)) {
    throw new Error(`Normalized record ${index} has an invalid field set.`);
  }

  for (const key of NORMALIZED_KEYS) {
    if (key === "nameZh") {
      if (record[key] !== null) {
        throw new Error(`Normalized record ${index} nameZh must be null.`);
      }
      continue;
    }

    if (key === "secondaryMuscles") {
      if (!Array.isArray(record[key])) {
        throw new Error(`Normalized record ${index} secondaryMuscles must be an array.`);
      }
      record[key].forEach((muscle, muscleIndex) =>
        requiredString(muscle, `Normalized record ${index} secondaryMuscles[${muscleIndex}]`)
      );
      continue;
    }

    requiredString(record[key], `Normalized record ${index} ${key}`);
  }
}

export async function verifyCatalogArtifacts({ manifestPath, dataPath }) {
  const [manifestText, dataBytes] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(dataPath)
  ]);
  let manifest;
  let records;

  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("Catalog manifest must be valid JSON.");
  }

  try {
    records = JSON.parse(new TextDecoder().decode(dataBytes));
  } catch {
    throw new Error("Catalog data must be valid JSON.");
  }

  const expectedManifest = buildManifest(dataBytes);
  for (const key of Object.keys(expectedManifest)) {
    if (manifest?.[key] !== expectedManifest[key]) {
      const label = key === "sha256" ? "checksum" : key;
      throw new Error(`Catalog manifest ${label} does not match the expected value.`);
    }
  }

  if (!Array.isArray(records) || records.length !== RECORD_COUNT) {
    throw new Error(`Catalog data must contain exactly ${RECORD_COUNT} records.`);
  }

  const externalIds = new Set();
  records.forEach((record, index) => {
    assertNormalizedRecord(record, index);
    if (externalIds.has(record.externalId)) {
      throw new Error(`Catalog data contains duplicate external ID: ${record.externalId}.`);
    }
    externalIds.add(record.externalId);
  });

  return manifest;
}
