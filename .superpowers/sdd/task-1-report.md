# Task 1 Report: Automated Test and Catalog Generation Foundation

## Implementation

- Added Vitest with `test` and `test:watch` scripts, plus catalog sync and verification commands.
- Added deterministic catalog normalization, manifest hashing, artifact verification, pinned-source synchronization, and a seven-test focused suite.
- Generated the pinned text-only catalog and manifest from `hasaneyldrm/exercises-dataset` commit `118e4bd6b14da6df0e36605d7169b65db18389a4`.
- Added the upstream MIT notice with an explicit Gym visual media exclusion and linked it from the README.

## Files

- Modified: `package.json`, `pnpm-lock.yaml`, `README.md`
- Created: `vitest.config.ts`, `pnpm-workspace.yaml`, `THIRD_PARTY_NOTICES.md`
- Created: `scripts/exercise-catalog-core.mjs`, `scripts/exercise-catalog-core.test.mjs`, `scripts/sync-exercise-catalog.mjs`, `scripts/verify-exercise-catalog.mjs`, `scripts/fixtures/exercise-catalog-valid.json`
- Created: `public/exercise-catalog/manifest.json`, `public/exercise-catalog/exercises.118e4bd6.zh.json`

`pnpm-workspace.yaml` records Pnpm 11's required approval for Vitest's `esbuild` postinstall. It is needed for a reproducible local test setup in this repository's Pnpm configuration.

## TDD Evidence

RED command:

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm vitest run scripts/exercise-catalog-core.test.mjs
```

Relevant RED output:

```text
FAIL scripts/exercise-catalog-core.test.mjs
Error: Failed to load url ./exercise-catalog-core.mjs ... Does the file exist?
Test Files 1 failed (1)
```

GREEN command:

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm vitest run scripts/exercise-catalog-core.test.mjs
```

Relevant GREEN output:

```text
Test Files 1 passed (1)
Tests 7 passed (7)
```

The tests cover valid normalization, deterministic ID ordering, Chinese-instruction mapping, duplicate IDs, missing Chinese instructions, production count enforcement, malformed secondary muscles, text-only output fields, manifest hashing, and checksum mismatch rejection.

## Catalog Commands

Sync command:

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm catalog:sync
```

Output:

```text
Synced 1324 records from 118e4bd6b14da6df0e36605d7169b65db18389a4.
```

Verify command:

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm catalog:verify
```

Output:

```text
Verified 1324 records: commit 118e4bd6b14da6df0e36605d7169b65db18389a4, file exercises.118e4bd6.zh.json, sha256 f6dd2105d60a365369c552dc1bb6cc6d2bbf93ba0323489cdb18b037409450ce.
```

Media exclusion scan:

```powershell
rg -n 'image|gif_url|media_id|attribution|images/|videos/' public/exercise-catalog
```

Output:

```text
No media fields or paths found.
```

## Additional Verification

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm release:check
```

Result: typecheck, production build, local server startup, and all existing smoke routes passed.

## Self-Review

- Normalized records emit only the ten required keys in the specified order; no arbitrary source keys survive.
- The manifest hashes the exact written UTF-8 bytes and has fixed source metadata and timestamp.
- Sync uses only the commit-pinned GitHub raw data URL, verifies temporary artifacts before rename, and deletes temporary files on failure before published artifacts are replaced.
- The generated public directory contains only `manifest.json` and the 893,323-byte normalized JSON data artifact; the scan found no forbidden media fields or paths.
- No `.env.local` files were read, changed, staged, or reported.

## Concerns

- This workspace has no `node` executable on the default PowerShell PATH. Verification commands therefore prepended the bundled runtime's Node directory, as shown above. The repository scripts themselves remain standard `node`/`pnpm` commands.
- The pinned upstream raw data download completed successfully but took about 14 minutes in this environment due to network throughput.
- The initial TypeScript config produced Vite's CJS Node API deprecation warning; the Fix Review replaces it with an ESM-native config and verifies clean output.

## Fix Review

### Changed Files

- Modified: `scripts/exercise-catalog-core.mjs`, `scripts/exercise-catalog-core.test.mjs`, `scripts/sync-exercise-catalog.mjs`
- Replaced: `vitest.config.ts` with `vitest.config.mts`
- Updated: `.superpowers/sdd/task-1-report.md`

### Pair-Publication Rollback

The original sync process published data before the manifest. A failure of the second rename left a new data file paired with the prior manifest. `publishCatalogArtifacts` now moves existing artifacts to backups, publishes both verified temporary files, removes backups only after both publishes succeed, and restores each original artifact before propagating a publish failure. The failure path removes temporary and backup files after restoration.

RED command:

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm vitest run scripts/exercise-catalog-core.test.mjs
```

Relevant RED output:

```text
publishCatalogArtifacts > restores both prior artifacts when the second publish rename fails
publishCatalogArtifacts is not a function
Test Files 1 failed (1)
Tests 1 failed | 7 passed (8)
```

GREEN command:

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm vitest run scripts/exercise-catalog-core.test.mjs
```

Relevant GREEN output:

```text
Test Files 1 passed (1)
Tests 8 passed (8)
```

The focused test injects an exception only for the manifest temporary-to-published rename. It verifies the prior data and manifest bytes are restored and that the directory contains no temporary or backup artifacts.

### Warning Removal And Verification

The Vitest configuration now uses the ESM-native `.mts` extension. The focused and full test output no longer contains Vite's CJS Node API deprecation warning.

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm test
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm catalog:verify
rg -n 'image|gif_url|media_id|attribution|images/|videos/' public/exercise-catalog
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH; pnpm release:check
```

Outputs:

```text
pnpm test: Test Files 1 passed (1); Tests 8 passed (8)
pnpm catalog:verify: Verified 1324 records: commit 118e4bd6b14da6df0e36605d7169b65db18389a4, file exercises.118e4bd6.zh.json, sha256 f6dd2105d60a365369c552dc1bb6cc6d2bbf93ba0323489cdb18b037409450ce.
media scan: No media fields or paths found.
pnpm release:check: typecheck, production build, and all smoke routes passed.
```
