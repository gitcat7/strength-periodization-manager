import { join } from "node:path";
import {
  DATA_FILE,
  RECORD_COUNT,
  SOURCE_COMMIT,
  verifyCatalogArtifacts
} from "./exercise-catalog-core.mjs";

const catalogDirectory = join(process.cwd(), "public", "exercise-catalog");
const manifest = await verifyCatalogArtifacts({
  manifestPath: join(catalogDirectory, "manifest.json"),
  dataPath: join(catalogDirectory, DATA_FILE)
});

console.log(
  `Verified ${RECORD_COUNT} records: commit ${SOURCE_COMMIT}, file ${manifest.dataFile}, sha256 ${manifest.sha256}.`
);
