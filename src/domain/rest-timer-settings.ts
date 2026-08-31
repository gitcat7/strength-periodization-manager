export type RestTimerSecondsParseResult = {
  seconds: number | null;
  error: string | null;
};

export function parseRestTimerSeconds(value: string): RestTimerSecondsParseResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return { seconds: null, error: "请输入 30–900 秒的整数。" };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { seconds: null, error: "休息时长必须是整数秒。" };
  }

  const seconds = Number(trimmed);
  if (seconds < 30 || seconds > 900) {
    return { seconds: null, error: "休息时长需在 30–900 秒之间。" };
  }

  return { seconds, error: null };
}
