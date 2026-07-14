import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DATA_FILE,
  RECORD_COUNT,
  SOURCE_COMMIT,
  buildManifest,
  normalizeCatalog,
  publishCatalogArtifacts,
  verifyCatalogArtifacts
} from "./exercise-catalog-core.mjs";

const catalogDirectory = join(process.cwd(), "public", "exercise-catalog");
const dataPath = join(catalogDirectory, DATA_FILE);
const manifestPath = join(catalogDirectory, "manifest.json");
const dataTemporaryPath = `${dataPath}.tmp`;
const manifestTemporaryPath = `${manifestPath}.tmp`;
const sourceUrl = `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/${SOURCE_COMMIT}/data/exercises.json`;
const execFileAsync = promisify(execFile);

async function downloadPinnedSource() {
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(
    curl,
    ["--fail", "--location", "--silent", "--show-error", sourceUrl],
    { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 }
  );

  return JSON.parse(stdout.toString("utf8"));
}

async function main() {
  await mkdir(dirname(dataPath), { recursive: true });

  try {
    const source = await downloadPinnedSource();
    const records = normalizeCatalog(source);
    const dataBytes = new TextEncoder().encode(`${JSON.stringify(records, null, 2)}\n`);
    const manifest = buildManifest(dataBytes);

    await writeFile(dataTemporaryPath, dataBytes);
    await writeFile(manifestTemporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await verifyCatalogArtifacts({
      manifestPath: manifestTemporaryPath,
      dataPath: dataTemporaryPath
    });

    await publishCatalogArtifacts({
      dataPath,
      manifestPath,
      dataTemporaryPath,
      manifestTemporaryPath
    });
    console.log(`Synced ${records.length} records from ${SOURCE_COMMIT}.`);
  } catch (error) {
    await Promise.all([
      rm(dataTemporaryPath, { force: true }),
      rm(manifestTemporaryPath, { force: true })
    ]);
    throw error;
  }
}

await main();
