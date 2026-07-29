const MAX_DURATION_MINUTES = 720;
const MANUAL_DURATION_ERROR = "训练时长请输入 1–720 的整数分钟。";

export function getElapsedDurationSeconds(startedAt: string | null, nowMs = Date.now()) {
  if (!startedAt) return null;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return null;
  return Math.max(0, Math.floor((nowMs - startedMs) / 1000));
}

export function getAutomaticDurationMinutes(startedAt: string | null, nowMs = Date.now()) {
  const seconds = getElapsedDurationSeconds(startedAt, nowMs);
  return seconds === null ? null : Math.max(1, Math.round(seconds / 60));
}

export function formatWorkoutDuration(seconds: number | null) {
  if (seconds === null) return "未记录";
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
}

export function validateManualDurationMinutes(value: string) {
  if (!/^\d+$/.test(value)) return { ok: false as const, message: MANUAL_DURATION_ERROR };
  const minutes = Number(value);
  if (minutes < 1 || minutes > MAX_DURATION_MINUTES) return { ok: false as const, message: MANUAL_DURATION_ERROR };
  return { ok: true as const, seconds: minutes * 60 };
}
