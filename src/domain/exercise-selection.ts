import type { ExternalExerciseReference } from "./external-exercise";
import type { ReviewedExerciseSection } from "./reviewed-exercise-library";

const fallbackName = /(?:其他)?(?:肌群|部位)?\s*训练动作\s*\d+/u;

export function isAddableExternalExercise(reference: ExternalExerciseReference) {
  const name = reference.name.trim();
  return Boolean(name && !fallbackName.test(name) && (reference.equipment.length > 0 || reference.muscles.length > 0));
}

export function filterAddableExternalExercises(
  records: readonly ExternalExerciseReference[],
  query: string,
  section: ReviewedExerciseSection
) {
  const needle = normalize(query);
  return records
    .filter(isAddableExternalExercise)
    // A typed search is deliberately cross-section. Sections only partition the
    // default browse, so a Chinese action name is never hidden by a stale tab.
    .filter((record) => Boolean(needle) || section === "全部" || sectionForExternalExercise(record) === section)
    .sort((left, right) => externalScore(left, needle) - externalScore(right, needle) || left.name.localeCompare(right.name, "zh-CN"));
}

export function sectionForExternalExercise(reference: ExternalExerciseReference): Exclude<ReviewedExerciseSection, "全部"> {
  const text = [reference.category ?? "", ...reference.muscles, reference.name].join(" ").toLowerCase();
  if (/chest|pectoral|胸/.test(text)) return "胸";
  if (/back|lat|背|row/.test(text)) return "背";
  if (/leg|quadr|hamstring|glute|squat|lunge|腿/.test(text)) return "腿";
  if (/shoulder|delt|肩/.test(text)) return "肩";
  if (/bicep|tricep|arm|手臂/.test(text)) return "手臂";
  if (/core|abs|abdom|腹|核心/.test(text)) return "核心";
  return "全身";
}

function externalScore(reference: ExternalExerciseReference, needle: string) {
  if (!needle) return 4;
  const name = normalize(reference.name);
  if (name === needle) return 0;
  if (name.includes(needle)) return 1;
  const englishAliases = chineseQueryAliases(needle);
  if (englishAliases.some((alias) => name.includes(alias))) return 2;
  if (reference.muscles.some((muscle) => normalize(muscle).includes(needle))) return 3;
  return 4;
}

function chineseQueryAliases(query: string) {
  const aliases: Record<string, readonly string[]> = {
    "杠铃卧推": ["barbellbenchpress", "benchpress"],
    "卧推": ["benchpress"],
    "深蹲": ["squat"],
    "杠铃深蹲": ["barbellsquat"],
    "硬拉": ["deadlift"],
    "划船": ["row"],
    "高位下拉": ["latpulldown"],
    "推举": ["press"]
  };
  return aliases[query] ?? [];
}

function normalize(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s\-_/，,。.]/g, "");
}
