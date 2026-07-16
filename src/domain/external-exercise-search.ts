import type { ExternalExerciseReference } from "./external-exercise";

export const exerciseSearchSections = ["全部", "胸", "背", "腿", "肩", "手臂", "核心", "全身"] as const;
export type ExerciseSearchSection = (typeof exerciseSearchSections)[number];

function sectionFor(reference: ExternalExerciseReference): Exclude<ExerciseSearchSection, "全部"> {
  const text = [reference.category, ...reference.muscles, reference.name].join(" ").toLowerCase();
  if (/chest|pectoral|胸/.test(text)) return "胸";
  if (/back|lat|背/.test(text)) return "背";
  if (/leg|quadr|hamstring|glute|squat|lunge|腿/.test(text)) return "腿";
  if (/shoulder|delt|肩/.test(text)) return "肩";
  if (/bicep|tricep|arm|手臂/.test(text)) return "手臂";
  if (/core|abs|abdom|腹|核心/.test(text)) return "核心";
  return "全身";
}

export function filterExternalExerciseSearchResults(
  results: readonly ExternalExerciseReference[],
  section: ExerciseSearchSection,
  selectedExternalIds: ReadonlySet<string>
) {
  return results.filter((exercise) => !selectedExternalIds.has(exercise.externalId)
    && (section === "全部" || sectionFor(exercise) === section));
}
