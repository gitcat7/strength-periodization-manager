# Exercise Catalog Integration Design

## Context

力训周期管家 currently uses 18 curated rows in `public.exercises` to generate and execute push/pull/squat A-B programs. The product needs a broader exercise reference without allowing a generic 1,324-row catalog to weaken beginner programming quality or invalidate existing workout history.

The source is [`hasaneyldrm/exercises-dataset`](https://github.com/hasaneyldrm/exercises-dataset.git), pinned to commit `118e4bd6b14da6df0e36605d7169b65db18389a4`. The pinned dataset contains 1,324 exercise records, including English names, equipment, body part, target and secondary muscles, and Chinese instructions.

## Goals

- Make all 1,324 exercise text records searchable in the Web/PWA.
- Keep the catalog out of the initial JavaScript bundle and out of Supabase.
- Show Chinese instructions for every valid source record.
- Give all 18 existing program exercises Chinese details: 17 catalog-backed strength mappings plus local reviewed Zone 2 guidance.
- Let users inspect instructions from today's workout.
- Let users replace eligible accessory exercises for only the current workout or for matching workouts in the current program.
- Preserve existing exercise UUIDs, workout history, set logs, PR goals, recommendations, and user isolation.
- Expose authenticated catalog search and exercise details through the Agent API.
- Keep media out of the product until the product owner obtains a separate Gym visual license.

## Non-Goals

- Do not import source images or GIFs.
- Do not let all catalog records enter plan generation.
- Do not replace main or secondary lifts from the workout execution screen.
- Do not translate all 1,324 English names automatically and present them as reviewed Chinese names.
- Do not add social ratings, user-created exercises, media uploads, or community content.
- Do not change the existing push/pull/squat A-B schedule.

## Chosen Architecture

Use a static, normalized JSON catalog generated from a pinned upstream commit.

```text
hasaneyldrm/exercises-dataset@118e4bd...
                |
                v
scripts/sync-exercise-catalog.mjs
                |
                +--> public/exercise-catalog/manifest.json
                +--> public/exercise-catalog/exercises.118e4bd6.zh.json
                |
                v
Web catalog, today workout details, Agent API search
```

The complete catalog is a public static artifact served by Vercel CDN and cached by the PWA only after first use. Supabase continues to store only exercises approved for programming. A small bridge maps approved Supabase exercise slugs to source `external_id` values.

## Catalog Artifact

### Normalized record

```ts
export type ExerciseCatalogRecord = {
  bodyPart: string;
  category: string;
  equipment: string;
  externalId: string;
  instructionsZh: string;
  muscleGroup: string;
  nameEn: string;
  nameZh: string | null;
  secondaryMuscles: string[];
  target: string;
};
```

Exclude `image`, `gif_url`, `media_id`, non-Chinese instructions, source timestamps, and all media files. Retain the source license and attribution in the repository's third-party notice.

### Manifest

`manifest.json` contains:

```ts
export type ExerciseCatalogManifest = {
  generatedAt: string;
  recordCount: 1324;
  schemaVersion: 1;
  dataFile: "exercises.118e4bd6.zh.json";
  sha256: string;
  sourceCommit: "118e4bd6b14da6df0e36605d7169b65db18389a4";
  sourceRepository: "https://github.com/hasaneyldrm/exercises-dataset.git";
};
```

The SHA-256 is computed over the exact UTF-8 bytes of `exercises.118e4bd6.zh.json`. Release verification rejects a count other than 1,324, duplicate IDs, missing required fields, missing Chinese instructions, a source commit mismatch, or a checksum mismatch.

### Chinese names

Store reviewed names in `src/domain/exercise-catalog-names.ts`, keyed by `externalId`. The initial mapping must cover the 17 current strength exercises and every newly approved substitute. `cardio_zone2` uses local reviewed guidance because the source catalog has no semantically equivalent Zone 2 prescription; it must not be mapped to a misleading exercise. Unreviewed records use `nameEn` as the display title. Search matches `externalId`, `nameEn`, reviewed `nameZh`, equipment, body part, target, and muscle group, so all records remain discoverable without claiming unreviewed translations.

## Program Exercise Bridge

Extend `public.exercises` with:

- `catalog_external_id text unique`
- `training_direction text` constrained to `push`, `pull`, `squat`, or `cardio`
- `movement_pattern text`
- `substitution_enabled boolean not null default false`

Existing exercise UUIDs remain unchanged. A migration updates the 18 current rows and inserts a small set of reviewed substitute rows. Each accessory movement pattern offered by the UI must have at least two compatible, reviewed choices. New substitute rows are not added to the default program template; they exist only as controlled alternatives.

Approved movement patterns include:

- `horizontal_press`
- `vertical_press`
- `shoulder_abduction`
- `elbow_extension`
- `horizontal_pull`
- `vertical_pull`
- `rear_delt`
- `elbow_flexion`
- `knee_dominant`
- `hip_hinge`
- `knee_flexion`
- `calf_raise`

## Exercise Library UX

Add `/exercises` and link to it from the authenticated home dashboard and settings page. Keep the existing five-item bottom navigation unchanged.

The page provides:

- Search over Chinese/English title and normalized metadata.
- Filters for body part, equipment, target muscle, and program availability.
- A compact mobile list with stable dimensions and no media placeholders.
- A details panel with bilingual title when available, equipment, primary and secondary muscles, Chinese instructions, beginner guidance, source, and license link.
- A `计划可替换` badge only when the record maps to an approved Supabase exercise.

Catalog loading is lazy. Loading, empty, corruption, and network failure states stay inside the catalog surface and do not block navigation or training execution.

## Today Workout Integration

Every workout exercise card includes an `动作说明` control when a catalog mapping exists. It opens the same details panel used by `/exercises`.

Show `替换动作` only when all conditions are true:

- Workout status is `scheduled` or `draft`.
- `order_index >= 3`, so main and secondary lifts cannot be replaced.
- No set for the workout exercise is completed.
- The current exercise has `substitution_enabled = true`.
- At least one alternative has the same `training_direction` and `movement_pattern`.

The replacement dialog lists only compatible approved exercises and offers:

- `仅本次训练` (default)
- `本周期后续同类训练`

The second option replaces the current occurrence and future scheduled/draft occurrences in the same active program where the source `exercise_id`, training direction, movement pattern, and accessory position match.

## Replacement Transaction

Implement a PostgreSQL RPC `substitute_workout_exercise` with `security definer`, `search_path = public`, and explicit `auth.uid()` ownership checks. Inputs are the source `workout_exercise_id`, target `exercise_id`, and scope enum.

The function validates:

- The caller is authenticated.
- The workout belongs to the caller.
- Source and target exercises exist and have matching direction/pattern.
- The source workout belongs to an active program owned by the caller.
- Source order is accessory-only.
- Source workout is not completed or skipped.
- No affected row has a completed set.
- Target is enabled for substitution.

For all affected workout-exercise rows, the transaction:

1. Deletes incomplete pre-created `set_logs`.
2. Replaces `exercise_id`.
3. Preserves target sets and reps.
4. Sets `target_weight` to `0` when the exercise changes.
5. Updates `updated_at`.
6. Returns affected IDs and count.

The client clears training caches, reloads the workout, and records `exercise_substituted` in `analytics_events`. The UI states that a replacement needs a new working-weight baseline.

## Agent Integration

Extend `/api/agent/v1` and the distributed `strength-training-manager` Skill with read-only actions:

- `search_exercises`
- `exercise_detail`

The API reads the generated static catalog artifact and returns at most 20 search results. Existing token authentication remains mandatory. The Agent does not perform substitutions in this release; mutation stays in the Web/PWA confirmation flow.

## PWA Cache Behavior

- Add the catalog manifest and data file to a dedicated runtime cache, not the install precache.
- Use network-first for `manifest.json` and cache-first for the commit-addressed data file.
- The app compares manifest checksum/version before using cached records.
- A failed catalog refresh falls back to the last verified catalog.
- General page navigation and training data cache behavior remain unchanged.

## Error Handling

- Missing or invalid catalog: show a retry state; training pages continue without details/replacement.
- Unknown catalog mapping: show the existing exercise name and omit catalog controls.
- RPC ownership or compatibility failure: display a Chinese error and leave all rows unchanged.
- Partial writes are impossible because replacement is a single database transaction.
- Upstream sync failure: do not overwrite the last generated artifacts.
- Source record count or checksum drift: fail CI/release checks.

## Security And Privacy

- Catalog data is public non-user content.
- User training data remains protected by existing RLS.
- The replacement RPC derives ownership from `auth.uid()` and never accepts a user ID.
- Agent catalog actions continue to derive user identity from the per-user Agent token.
- No service-role key, user token, email, or training data enters static catalog files.

## Licensing

- Include the upstream MIT copyright and permission notice for code/data/instruction text.
- Include a media exclusion note naming Gym visual and explaining that no source media is distributed by this product.
- Do not copy or hotlink `images/` or `videos/`.
- Show a source/license link in the catalog details footer.

## Testing Strategy

Follow test-driven development for all new behavior.

### Automated tests

- Catalog normalization accepts the pinned valid dataset.
- Normalization rejects duplicate IDs, missing Chinese instructions, wrong count, and forbidden media fields.
- Manifest checksum verification detects altered JSON.
- Search matches English names, reviewed Chinese names, equipment, body part, target, and muscle group.
- Filters compose correctly and cap Agent results at 20.
- Compatibility accepts same direction/pattern and rejects cross-direction or cross-pattern choices.
- Replacement eligibility rejects main/secondary exercises, completed sets, completed workouts, and unmapped targets.
- SQL migration contains RLS-safe RPC ownership and compatibility checks.
- Skill CLI maps Chinese catalog commands to the correct Agent API actions.

### Integration and release tests

- Typecheck, automated tests, production build, local smoke, and static artifact verification pass.
- All 1,324 records load and search from the built application.
- All 17 current strength exercises resolve to a catalog-backed Chinese detail record, and `cardio_zone2` resolves to local reviewed guidance.
- Mobile and desktop screenshots show no overlap or overflow.
- Real authenticated replacement is tested for both scopes.
- Rejected replacement leaves the workout unchanged.
- Web history, progress, PR, Agent today query, and CSV export remain functional.
- Production smoke and catalog checksum verification pass after deployment.

## Acceptance Criteria

1. The repository contains reproducible, pinned, license-compliant catalog artifacts for exactly 1,324 exercises.
2. `/exercises` supports search, filters, details, source attribution, and responsive layouts.
3. Every existing program exercise exposes Chinese instructions in today's workout.
4. Only reviewed compatible accessories can be substituted.
5. Both replacement scopes work atomically and preserve user isolation.
6. Catalog failure never blocks workout recording.
7. Agent users can search and inspect catalog exercises in Chinese.
8. All automated, local, visual, authenticated, production, and regression checks listed above pass with current evidence.
