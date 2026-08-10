"use client";

import { useReducer, useState } from "react";

import {
  createHistoryWorkoutEditorState,
  parseHistoryDurationMinutes,
  reduceHistoryWorkoutEditor,
  type HistoryEditableSet
} from "./history-workout-editor-state";

export type HistoryWorkoutCardExercise = {
  id: string;
  logs: HistoryEditableSet[];
  name: string;
  targetReps: number;
  targetSets: number;
  targetWeight: number;
};

export type HistoryWorkoutCardRecommendation = {
  id: string;
  label: string;
  previousWeight: number;
  statusLabel: string;
  suggestedWeight: number;
};

export type SaveHistoryWorkoutInput = {
  durationSeconds: number | null;
  logs: HistoryEditableSet[];
  workoutId: string;
};

export type SaveHistoryWorkoutResult = {
  durationSeconds: number | null;
  logs: HistoryEditableSet[];
};

export type HistoryWorkoutCardProps = {
  durationSeconds: number | null;
  exercises: HistoryWorkoutCardExercise[];
  initiallyExpanded: boolean;
  isRecovery: boolean;
  name: string;
  onSave(input: SaveHistoryWorkoutInput): Promise<SaveHistoryWorkoutResult>;
  onValidate(logs: HistoryEditableSet[]):
    | { ok: true; logs: HistoryEditableSet[] }
    | { ok: false; message: string };
  recommendations: HistoryWorkoutCardRecommendation[];
  review: {
    averageRpe: number | null;
    completedSets: number;
    completionRate: number;
    headline: string;
    plannedSets: number;
    tone: "good" | "neutral" | "warning";
    volume: number;
  };
  scheduledDate: string;
  workoutId: string;
};

export function HistoryWorkoutCard(props: HistoryWorkoutCardProps) {
  const [expanded, setExpanded] = useState(props.initiallyExpanded);
  const [feedback, setFeedback] = useState("");
  const [editor, dispatch] = useReducer(
    reduceHistoryWorkoutEditor,
    undefined,
    createHistoryWorkoutEditorState
  );
  const loadedLogs = props.exercises.flatMap((exercise) => exercise.logs);
  const editing = editor.mode !== "read";

  async function save() {
    const duration = parseHistoryDurationMinutes(editor.durationMinutes);
    if (!duration.ok) {
      dispatch({ type: "saveFailed", message: duration.message });
      return;
    }
    const validation = props.onValidate(editor.logs);
    if (!validation.ok) {
      dispatch({ type: "saveFailed", message: validation.message });
      return;
    }
    dispatch({ type: "save" });
    try {
      const result = await props.onSave({
        durationSeconds: duration.seconds,
        logs: validation.logs,
        workoutId: props.workoutId
      });
      dispatch({
        type: "saveSucceeded",
        durationSeconds: result.durationSeconds,
        logs: result.logs
      });
      setFeedback("历史训练已保存，Coach 建议已重新计算。");
    } catch (error) {
      dispatch({
        type: "saveFailed",
        message: error instanceof Error ? error.message : "历史训练保存失败，请重试。"
      });
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${props.isRecovery ? "border-line bg-field/60" : "border-line bg-white"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{props.scheduledDate}</p>
          <h2 className="truncate font-semibold">{props.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {formatDuration(props.durationSeconds)} · {props.review.completedSets}/{props.review.plannedSets} 组 · {Math.round(props.review.volume).toLocaleString()}kg
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-action/10 px-3 py-1 text-xs font-semibold text-action">已完成</span>
      </div>

      <div className={`mt-3 rounded-lg border px-3 py-3 ${reviewClassName(props.review.tone)}`}>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <ReviewMetric label="完成率" value={`${Math.round(props.review.completionRate * 100)}%`} />
          <ReviewMetric label="完成组数" value={`${props.review.completedSets}/${props.review.plannedSets}`} />
          <ReviewMetric label="平均 RPE" value={props.review.averageRpe === null ? "-" : props.review.averageRpe.toFixed(1)} />
          <ReviewMetric label="训练量" value={`${Math.round(props.review.volume).toLocaleString()}kg`} />
        </div>
        <p className="mt-3 text-sm leading-6">{props.review.headline}</p>
      </div>

      <div className="mt-3 space-y-2">
        {props.exercises.map((exercise) => {
          const bestSet = getBestSet(exercise.logs);
          return (
            <div className="rounded-lg bg-field px-3 py-2 text-sm" key={exercise.id}>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate font-semibold">{exercise.name}</span>
                <span className="shrink-0 text-action">{exercise.logs.filter((log) => log.completed).length}/{exercise.logs.length} 组</span>
              </div>
              {bestSet ? (
                <p className="mt-1 text-muted">
                  最佳组：{formatNumber(bestSet.actual_weight)}kg × {formatNumber(bestSet.actual_reps)}
                  {bestSet.rpe === null ? "" : ` · RPE ${formatNumber(bestSet.rpe)}`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {!editing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            aria-expanded={expanded}
            className="h-11 rounded-lg border border-line bg-white px-3 text-sm font-semibold"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? "收起详情" : "查看详情"}
          </button>
          <button
            className="h-11 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-action"
            onClick={() => {
              setExpanded(true);
              setFeedback("");
              dispatch({ type: "begin", durationSeconds: props.durationSeconds, logs: loadedLogs });
            }}
            type="button"
          >
            修改记录
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-action/20 bg-action/5 p-3">
          <p className="font-semibold text-action">正在修改历史记录</p>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-medium">实际训练时长（分钟）</span>
            <input
              aria-label="实际训练时长（分钟）"
              className="h-11 w-full rounded-lg border border-line bg-white px-3 tabular-nums"
              inputMode="numeric"
              onChange={(event) => dispatch({ type: "changeDuration", value: event.target.value })}
              value={editor.durationMinutes}
            />
          </label>
          <div className="mt-3 space-y-3">
            {props.exercises.map((exercise) => (
              <div className="rounded-lg bg-white p-3" key={exercise.id}>
                <p className="font-semibold">{exercise.name}</p>
                <div className="mt-2 space-y-2">
                  {editor.logs.filter((log) => log.workout_exercise_id === exercise.id).map((log) => (
                    <EditableSetRow
                      key={log.id}
                      log={log}
                      onChange={(patch) => dispatch({ type: "changeLog", id: log.id, patch })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {editor.error ? <p className="mt-3 text-sm text-red-600">{editor.error}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="h-11 rounded-lg border border-line bg-white px-3 font-semibold"
              disabled={editor.mode === "saving"}
              onClick={() => dispatch({ type: "cancel" })}
              type="button"
            >
              取消
            </button>
            <button
              className="h-11 rounded-lg bg-action px-3 font-semibold text-white disabled:opacity-60"
              disabled={editor.mode === "saving"}
              onClick={() => void save()}
              type="button"
            >
              {editor.mode === "saving" ? "保存中…" : "保存修改"}
            </button>
          </div>
        </div>
      )}

      {expanded && !editing ? (
        <div className="mt-3 space-y-3">
          {props.exercises.map((exercise) => (
            <div className="rounded-lg border border-line p-3" key={exercise.id}>
              <p className="font-semibold">{exercise.name}</p>
              <div className="mt-2 space-y-2 text-sm">
                {exercise.logs.map((log) => (
                  <div className="flex flex-wrap justify-between gap-2 rounded-md bg-field px-3 py-2 tabular-nums" key={log.id}>
                    <span>第 {log.set_index} 组</span>
                    <span>{formatNumber(log.actual_weight)}kg × {formatNumber(log.actual_reps)} · RPE {formatNumber(log.rpe)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {props.recommendations.length > 0 ? (
            <div className="rounded-lg border border-line p-3">
              <h3 className="font-semibold">Coach 调整</h3>
              {props.recommendations.map((recommendation) => (
                <p className="mt-2 text-sm" key={recommendation.id}>
                  {recommendation.label} · {recommendation.previousWeight}kg → {recommendation.suggestedWeight}kg · {recommendation.statusLabel}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {feedback ? <p className="mt-3 text-sm text-action">{feedback}</p> : null}
    </div>
  );
}

function EditableSetRow({ log, onChange }: {
  log: HistoryEditableSet;
  onChange: (patch: Partial<HistoryEditableSet>) => void;
}) {
  return (
    <div className="rounded-lg border border-line p-2">
      <p className="mb-2 text-sm font-semibold">第 {log.set_index} 组</p>
      <div className="grid grid-cols-3 gap-2">
        <NumberInput ariaLabel={`第 ${log.set_index} 组重量 kg`} label="重量 kg" min={0} step={0.5} value={log.actual_weight} onChange={(value) => onChange({ actual_weight: value })} />
        <NumberInput ariaLabel={`第 ${log.set_index} 组次数`} label="次数" min={0} step={1} value={log.actual_reps} onChange={(value) => onChange({ actual_reps: value })} />
        <NumberInput ariaLabel={`第 ${log.set_index} 组 RPE`} label="RPE" min={1} step={0.5} value={log.rpe} onChange={(value) => onChange({ rpe: value })} />
      </div>
      <button
        aria-label={`第 ${log.set_index} 组完成`}
        aria-pressed={log.completed}
        className={`mt-2 h-11 w-full rounded-lg border px-3 text-sm font-semibold ${log.completed ? "border-action bg-action text-white" : "border-line bg-white"}`}
        onClick={() => onChange({ completed: !log.completed })}
        type="button"
      >
        {log.completed ? "已完成 ✓" : "完成本组"}
      </button>
    </div>
  );
}

function NumberInput({ ariaLabel, label, min, onChange, step, value }: {
  ariaLabel: string;
  label: string;
  min: number;
  onChange: (value: number | null) => void;
  step: number;
  value: number | null;
}) {
  return (
    <label className="min-w-0 text-xs text-muted">
      <span className="mb-1 block">{label}</span>
      <input
        aria-label={ariaLabel}
        className="h-11 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-right text-sm tabular-nums"
        inputMode="decimal"
        min={min}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        step={step}
        type="number"
        value={value ?? ""}
      />
    </label>
  );
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs opacity-75">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}

function getBestSet(logs: HistoryEditableSet[]) {
  return [...logs]
    .filter((log) => log.completed)
    .sort((a, b) => Number(b.actual_weight ?? 0) * Number(b.actual_reps ?? 0) - Number(a.actual_weight ?? 0) * Number(a.actual_reps ?? 0))[0];
}

function formatDuration(seconds: number | null) {
  return seconds === null ? "训练时长未记录" : `${Math.round(seconds / 60)} 分钟`;
}

function formatNumber(value: number | null) {
  return value === null ? "-" : String(value);
}

function reviewClassName(tone: HistoryWorkoutCardProps["review"]["tone"]) {
  if (tone === "good") return "border-action/20 bg-action/5 text-ink";
  if (tone === "warning") return "border-amber/30 bg-amber/10 text-amber-900";
  return "border-line bg-field text-ink";
}
