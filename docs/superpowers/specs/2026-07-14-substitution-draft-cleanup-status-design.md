# Substitution Draft Cleanup Status Design

## Goal

When an exercise substitution succeeds in the database, the Today workflow must distinguish complete local draft cleanup from cleanup that could not be confirmed. A cleanup problem must not block the completed substitution or invite the user to retry it.

## Scope

- Change `clearWorkoutDrafts` and `clearWorkoutDraftsByExerciseIds` to return `boolean`.
- Return `true` only when the requested cleanup can be completed or there is nothing to clean.
- Return `false` when browser storage is unavailable, a storage operation fails, or a candidate draft cannot be parsed while scanning by exercise ID.
- Keep cleanup failures non-throwing.
- In the confirmed-substitution success path, show the existing draft-cleanup warning if either cleanup function returns `false`, or if the affected-workout lookup fails.

## Non-goals

- Do not change cache invalidation behavior outside the substitution flow.
- Do not add retries, telemetry, or persistent error state.
- Do not alter the separate `committed_unverified` outcome introduced for malformed RPC responses.

## Data Flow

1. The substitution RPC returns a valid committed result.
2. Today clears data caches, determines affected workout IDs, then invokes both draft cleanup helpers.
3. Each helper returns whether its cleanup was fully confirmed.
4. Today combines those two statuses with the existing lookup status. Any unconfirmed status produces the existing user-facing warning while the substitution remains complete.

## Testing

- Verify successful targeted cleanup returns `true`.
- Verify unavailable storage and storage removal failure return `false` without throwing.
- Verify an unparseable draft encountered during exercise-ID scanning returns `false` and remains untouched.
- Verify the existing substitution success path uses an unconfirmed result to preserve the warning.
