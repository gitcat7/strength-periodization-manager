import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const source = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

describe('edited workout prescription remains in the existing actual-data pipeline', () => {
  it('Today creates set logs from the saved target sets/reps/weight', () => {
    const today = source('src/components/today/today-workout.tsx');
    expect(today).toContain('target_sets,target_reps,target_weight');
    expect(today).toContain('for (let index = 0; index < exercise.target_sets; index += 1)');
    expect(today).toContain('target_weight: exercise.target_weight');
    expect(today).toContain('target_reps: exercise.target_reps');
  });

  it('History and Progress still join plan targets with actual set logs', () => {
    const history = source('src/components/history/training-history.tsx');
    const progress = source('src/components/progress/progress-dashboard.tsx');
    for (const file of [history, progress]) {
      expect(file).toContain('DB_TABLE.workoutExercises');
      expect(file).toContain('DB_TABLE.setLogs');
      expect(file).toContain('target_sets');
    }
  });

  it('Coach/e1RM calculations continue to use completed actual logs, not editor metadata', () => {
    const coach = source('src/domain/fitness-coach.ts');
    expect(coach).toContain('actualWeight');
    expect(coach).toContain('actualReps');
    expect(coach).toContain('completed');
  });
});
