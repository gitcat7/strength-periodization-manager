import { access, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildManifest,
  normalizeCatalog,
  publishCatalogArtifacts,
  RECORD_COUNT,
  verifyCatalogArtifacts
} from "./exercise-catalog-core.mjs";

const fixturePath = fileURLToPath(
  new URL("./fixtures/exercise-catalog-valid.json", import.meta.url)
);

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

describe("normalizeCatalog", () => {
  it("normalizes the valid fixture into sorted text-only records", async () => {
    const records = normalizeCatalog(await loadFixture(), { expectedCount: 2 });

    expect(records).toEqual([
      {
        bodyPart: "waist",
        category: "waist",
        equipment: "body weight",
        externalId: "0001",
        instructionsZh: "第一个动作的中文说明",
        muscleGroup: "hip flexors",
        nameEn: "first exercise",
        nameZh: null,
        secondaryMuscles: ["lower back"],
        target: "abs"
      },
      {
        bodyPart: "chest",
        category: "chest",
        equipment: "barbell",
        externalId: "0002",
        instructionsZh: "第二个动作的中文说明",
        muscleGroup: "pectorals",
        nameEn: "second exercise",
        nameZh: null,
        secondaryMuscles: ["triceps"],
        target: "pectoralis major"
      }
    ]);
    expect(Object.keys(records[0])).toEqual([
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
    ]);
    expect(records[0]).not.toHaveProperty("unrelated");
  });

  it("rejects duplicate external IDs", async () => {
    const source = await loadFixture();
    source[1].id = source[0].id;

    expect(() => normalizeCatalog(source, { expectedCount: 2 })).toThrow(/duplicate/i);
  });

  it("rejects missing Chinese instructions", async () => {
    const source = await loadFixture();
    delete source[0].instructions.zh;

    expect(() => normalizeCatalog(source, { expectedCount: 2 })).toThrow(/instructions\.zh/i);
  });

  it("rejects a production input with a non-1324 count", async () => {
    const source = await loadFixture();

    expect(() => normalizeCatalog(source)).toThrow(new RegExp(String(RECORD_COUNT)));
  });

  it("rejects malformed secondary muscles", async () => {
    const source = await loadFixture();
    source[0].secondary_muscles = "triceps";

    expect(() => normalizeCatalog(source, { expectedCount: 2 })).toThrow(/secondary_muscles/i);
  });
});

describe("buildManifest", () => {
  it("uses the SHA-256 of the exact UTF-8 bytes", () => {
    expect(buildManifest(new TextEncoder().encode("catalog"))).toMatchObject({
      generatedAt: "2026-07-09T18:10:06Z",
      recordCount: RECORD_COUNT,
      sha256: "652f55016243bf1b9f1bbea46d5749ef892dbe394e46de9d66ab1aacf0b4af57"
    });
  });
});

describe("verifyCatalogArtifacts", () => {
  it("rejects data bytes whose checksum no longer matches the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exercise-catalog-"));
    const dataPath = join(directory, "exercises.118e4bd6.zh.json");
    const manifestPath = join(directory, "manifest.json");
    const expectedBytes = new TextEncoder().encode("[{}]");

    try {
      await writeFile(dataPath, "[]");
      await writeFile(manifestPath, JSON.stringify(buildManifest(expectedBytes)));

      await expect(verifyCatalogArtifacts({ manifestPath, dataPath })).rejects.toThrow(
        /checksum/i
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("publishCatalogArtifacts", () => {
  it("restores both prior artifacts when the second publish rename fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exercise-catalog-publish-"));
    const dataPath = join(directory, "exercises.118e4bd6.zh.json");
    const manifestPath = join(directory, "manifest.json");
    const dataTemporaryPath = `${dataPath}.tmp`;
    const manifestTemporaryPath = `${manifestPath}.tmp`;
    const priorData = "prior data";
    const priorManifest = "prior manifest";

    try {
      await writeFile(dataPath, priorData);
      await writeFile(manifestPath, priorManifest);
      await writeFile(dataTemporaryPath, "new data");
      await writeFile(manifestTemporaryPath, "new manifest");

      await expect(
        publishCatalogArtifacts({
          dataPath,
          manifestPath,
          dataTemporaryPath,
          manifestTemporaryPath,
          fileSystem: {
            access,
            rename: async (from, to) => {
              if (from === manifestTemporaryPath && to === manifestPath) {
                throw new Error("injected second publish failure");
              }
              await rename(from, to);
            },
            rm
          }
        })
      ).rejects.toThrow("injected second publish failure");

      await expect(readFile(dataPath, "utf8")).resolves.toBe(priorData);
      await expect(readFile(manifestPath, "utf8")).resolves.toBe(priorManifest);
      await expect(readdir(directory).then((entries) => entries.sort())).resolves.toEqual([
        "exercises.118e4bd6.zh.json",
        "manifest.json"
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("keeps the new pair when backup cleanup has a transient failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "exercise-catalog-publish-"));
    const dataPath = join(directory, "exercises.118e4bd6.zh.json");
    const manifestPath = join(directory, "manifest.json");
    const dataTemporaryPath = `${dataPath}.tmp`;
    const manifestTemporaryPath = `${manifestPath}.tmp`;
    const dataBackupPath = `${dataPath}.backup`;
    let failedCleanup = false;

    try {
      await writeFile(dataPath, "prior data");
      await writeFile(manifestPath, "prior manifest");
      await writeFile(dataTemporaryPath, "new data");
      await writeFile(manifestTemporaryPath, "new manifest");

      await publishCatalogArtifacts({
        dataPath,
        manifestPath,
        dataTemporaryPath,
        manifestTemporaryPath,
        fileSystem: {
          access,
          rename,
          rm: async (filePath, options) => {
            if (filePath === dataBackupPath && !failedCleanup) {
              failedCleanup = true;
              throw new Error("injected transient backup cleanup failure");
            }
            await rm(filePath, options);
          }
        }
      });

      expect(failedCleanup).toBe(true);
      await expect(readFile(dataPath, "utf8")).resolves.toBe("new data");
      await expect(readFile(manifestPath, "utf8")).resolves.toBe("new manifest");
      await expect(readdir(directory).then((entries) => entries.sort())).resolves.toEqual([
        "exercises.118e4bd6.zh.json",
        "manifest.json"
      ]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
