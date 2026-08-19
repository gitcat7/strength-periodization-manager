"use client";

import { Pencil, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildWorkoutPrescriptionPayload,
  getPrescriptionChangeSummary,
  insertPrescriptionExerciseAfter,
  reindexPrescriptionExercises,
  removePrescriptionExerciseAt,
  restorePrescriptionExercise,
  validateWorkoutPrescriptionDraft,
  type PrescriptionExerciseRemoval,
  type PrescriptionDirection,
  type WorkoutPrescriptionDraft,
  type WorkoutPrescriptionExerciseDraft
} from "@/domain/workout-prescription-editor";
import { clearWorkoutPrescriptionCaches } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  WorkoutPrescriptionExerciseCard,
  type WorkoutPrescriptionCatalogExercise
} from "./workout-prescription-exercise-card";

export type PrescriptionEditorWorkout = {
  id: string;
  program_id?: string | null;
  status: string;
  day_type: "training" | "rest";
  prescription_revision?: number | null;
  completed_set_count?: number;
  name: string;
};

export type PrescriptionEditorExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  exercise_provider?: string | null;
  exercises: { name: string; slug: string; training_direction?: PrescriptionDirection | null } | null;
};

type Props = {
  workout: PrescriptionEditorWorkout;
  exercises: PrescriptionEditorExercise[];
  catalog: WorkoutPrescriptionCatalogExercise[];
  onSaved: () => void | Promise<void>;
};

function inferDirection(workout: PrescriptionEditorWorkout, exercises: PrescriptionEditorExercise[]): PrescriptionDirection | null {
  const directions = exercises.map((exercise) => exercise.exercises?.training_direction).filter(Boolean) as PrescriptionDirection[];
  if (directions.length > 0 && directions.every((direction) => direction === directions[0])) return directions[0];
  if (workout.name.includes("推") || workout.name.toLowerCase().includes("push")) return "push";
  if (workout.name.includes("拉") || workout.name.toLowerCase().includes("pull")) return "pull";
  if (workout.name.includes("蹲") || workout.name.toLowerCase().includes("squat")) return "squat";
  if (workout.name.includes("有氧")) return "cardio";
  return null;
}

function toDraft(workout: PrescriptionEditorWorkout, exercises: PrescriptionEditorExercise[]): WorkoutPrescriptionDraft | null {
  const direction = inferDirection(workout, exercises);
  if (!direction) return null;
  return {
    workoutId: workout.id,
    programId: workout.program_id ?? "",
    status: workout.status as WorkoutPrescriptionDraft["status"],
    dayType: workout.day_type,
    direction,
    prescriptionRevision: workout.prescription_revision ?? 1,
    completedSetCount: workout.completed_set_count ?? 0,
    exercises: exercises.slice().sort((a, b) => a.order_index - b.order_index).map((exercise, index) => ({
      exerciseId: exercise.exercise_id ?? "",
      slug: exercise.exercises?.slug ?? "",
      name: exercise.exercises?.name ?? "动作",
      direction: exercise.exercises?.training_direction ?? direction,
      orderIndex: index + 1,
      targetSets: Number(exercise.target_sets),
      targetReps: Number(exercise.target_reps),
      targetWeight: Number(exercise.target_weight),
      provider: exercise.exercise_provider ?? "local"
    }))
  };
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/stale|revision|版本|刷新/i.test(message)) return "训练日已被其他操作更新，请刷新后重试。";
  if (/pending|completed|scheduled|draft|结构|编辑/i.test(message)) return "该训练日已不能编辑动作结构。";
  if (/direction|方向|local|cfg_exercises|动作/i.test(message)) return "动作必须来自本地动作库，且与训练日方向兼容。";
  return "保存训练处方失败，请稍后重试；当前训练日未发生变化。";
}

export function WorkoutPrescriptionEditor({ workout, exercises, catalog, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WorkoutPrescriptionDraft | null>(() => toDraft(workout, exercises));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastRemoval, setLastRemoval] = useState<PrescriptionExerciseRemoval | null>(null);

  const before = useMemo(() => toDraft(workout, exercises)?.exercises ?? [], [workout, exercises]);
  const editable = workout.day_type === "training" && ["scheduled", "draft"].includes(workout.status) && (workout.completed_set_count ?? 0) === 0 && Boolean(draft);
  if (!editable) return null;

  function updateExercise(index: number, patch: Partial<WorkoutPrescriptionExerciseDraft>) {
    setDraft((current) => current ? { ...current, exercises: current.exercises.map((exercise, currentIndex) => currentIndex === index ? { ...exercise, ...patch } : exercise) } : current);
    setError("");
  }

  function removeExercise(index: number) {
    if (!draft) return;
    const result = removePrescriptionExerciseAt(draft.exercises, index);
    if (!result) return;
    setLastRemoval(result.removal);
    setDraft({ ...draft, exercises: result.exercises });
    setError("");
  }

  function moveExercise(index: number, delta: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.exercises.length) return current;
      const next = [...current.exercises];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { ...current, exercises: reindexPrescriptionExercises(next) };
    });
    setLastRemoval(null);
    setError("");
  }

  function insertExerciseAfter(index: number, item: WorkoutPrescriptionCatalogExercise) {
    if (!draft) return;
    setDraft({ ...draft, exercises: insertPrescriptionExerciseAfter(draft.exercises, index, {
      exerciseId: item.id,
      slug: item.slug,
      name: item.name,
      direction: item.training_direction ?? draft.direction,
      orderIndex: index + 2,
      targetSets: 2,
      targetReps: 8,
      targetWeight: 0,
      provider: "local"
    }) });
    setLastRemoval(null);
    setError("");
  }

  function undoRemoval() {
    if (!draft || !lastRemoval) return;
    setDraft({ ...draft, exercises: restorePrescriptionExercise(draft.exercises, lastRemoval) });
    setLastRemoval(null);
    setError("");
  }

  function closeEditor() {
    setOpen(false);
    setConfirming(false);
    setLastRemoval(null);
    setError("");
  }

  async function save() {
    if (!draft) return;
    const validated = validateWorkoutPrescriptionDraft(draft);
    if (!validated.ok) {
      setError(Object.values(validated.fieldErrors)[0] ?? "请检查训练处方");
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createBrowserSupabaseClient();
    const { error: rpcError } = await supabase.rpc("revise_workout_prescription", {
      p_workout_id: draft.workoutId,
      p_expected_revision: draft.prescriptionRevision,
      p_payload: buildWorkoutPrescriptionPayload(validated.value)
    });
    if (rpcError) {
      setBusy(false);
      setConfirming(false);
      setError(safeErrorMessage(rpcError));
      return;
    }
    clearWorkoutPrescriptionCaches(draft.workoutId);
    setBusy(false);
    setConfirming(false);
    setLastRemoval(null);
    setOpen(false);
    await onSaved();
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink" onClick={() => { setDraft(toDraft(workout, exercises)); setLastRemoval(null); setOpen(true); }} type="button">
          <Pencil size={16} /> 编辑本日动作
        </button>
      ) : (
        <section aria-label="计划日动作编辑" className="rounded-lg border border-action/30 bg-action/5 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold">编辑本日动作</h4>
              <p className="text-xs text-muted">仅支持本地审核动作 · 版本 {draft?.prescriptionRevision}</p>
            </div>
            <button aria-label="取消编辑" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white" onClick={closeEditor} type="button"><X size={16} /></button>
          </div>
          <div className="space-y-2">
            {draft?.exercises.map((exercise, index) => (
              <WorkoutPrescriptionExerciseCard
                catalog={catalog}
                direction={draft.direction}
                exercise={exercise}
                index={index}
                key={exercise.exerciseId}
                onChange={(patch) => updateExercise(index, patch)}
                onInsertAfter={(item) => insertExerciseAfter(index, item)}
                onMove={(delta) => moveExercise(index, delta)}
                onRemove={() => removeExercise(index)}
                totalExercises={draft.exercises.length}
                usedExerciseIds={draft.exercises.map((current) => current.exerciseId)}
              />
            ))}
          </div>
          {lastRemoval ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm" role="status">
              <span>已删除{lastRemoval.exercise.name}，保存前仍可撤销。</span>
              <button className="h-11 rounded-lg border border-line px-3 font-semibold" onClick={undoRemoval} type="button">撤销删除</button>
            </div>
          ) : null}
          {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
          {confirming && draft ? (() => {
            const summary = getPrescriptionChangeSummary(before, draft.exercises);
            return <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-muted">将新增 {summary.added} 个、删除 {summary.removed} 个、调序 {summary.moved} 个、修改处方 {summary.changed} 个动作；保存后本日训练和后续实际数据将按新处方记录。</p>;
          })() : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void save()} type="button"><Save size={16} />{confirming ? "确认保存本日处方" : "预览并保存"}</button>
            {confirming ? <button className="inline-flex h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold" disabled={busy} onClick={() => setConfirming(false)} type="button">返回修改</button> : null}
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold" disabled={busy} onClick={closeEditor} type="button">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}
