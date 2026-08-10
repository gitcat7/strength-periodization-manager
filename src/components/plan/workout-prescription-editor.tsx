"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildWorkoutPrescriptionPayload,
  getPrescriptionChangeSummary,
  validateWorkoutPrescriptionDraft,
  type PrescriptionDirection,
  type WorkoutPrescriptionDraft,
  type WorkoutPrescriptionExerciseDraft
} from "@/domain/workout-prescription-editor";
import { clearWorkoutPrescriptionCaches } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export type PrescriptionEditorWorkout = {
  id: string;
  program_id?: string | null;
  status: string;
  day_type: "training" | "rest";
  prescription_revision?: number | null;
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

export type PrescriptionEditorCatalogExercise = {
  id: string;
  slug: string;
  name: string;
  training_direction?: PrescriptionDirection | null;
};

type Props = {
  workout: PrescriptionEditorWorkout;
  exercises: PrescriptionEditorExercise[];
  catalog: PrescriptionEditorCatalogExercise[];
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
    completedSetCount: 0,
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

  const before = useMemo(() => toDraft(workout, exercises)?.exercises ?? [], [workout, exercises]);
  const available = draft ? catalog.filter((item) => item.training_direction === draft.direction && !draft.exercises.some((exercise) => exercise.exerciseId === item.id)) : [];
  const editable = workout.day_type === "training" && ["scheduled", "draft"].includes(workout.status) && Boolean(draft);
  if (!editable) return null;

  function updateExercise(index: number, patch: Partial<WorkoutPrescriptionExerciseDraft>) {
    setDraft((current) => current ? { ...current, exercises: current.exercises.map((exercise, currentIndex) => currentIndex === index ? { ...exercise, ...patch } : exercise) } : current);
    setError("");
  }

  function removeExercise(index: number) {
    setDraft((current) => current ? { ...current, exercises: current.exercises.filter((_, currentIndex) => currentIndex !== index).map((exercise, currentIndex) => ({ ...exercise, orderIndex: currentIndex + 1 })) } : current);
  }

  function moveExercise(index: number, delta: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.exercises.length) return current;
      const next = [...current.exercises];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { ...current, exercises: next.map((exercise, currentIndex) => ({ ...exercise, orderIndex: currentIndex + 1 })) };
    });
  }

  function addExercise(exerciseId: string) {
    const item = catalog.find((candidate) => candidate.id === exerciseId);
    if (!item || !draft) return;
    setDraft({ ...draft, exercises: [...draft.exercises, {
      exerciseId: item.id,
      slug: item.slug,
      name: item.name,
      direction: item.training_direction ?? draft.direction,
      orderIndex: draft.exercises.length + 1,
      targetSets: 2,
      targetReps: 8,
      targetWeight: 0,
      provider: "local"
    }] });
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
    setOpen(false);
    await onSaved();
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink" onClick={() => setOpen(true)} type="button">
          <Pencil size={16} /> 编辑本日动作
        </button>
      ) : (
        <section aria-label="计划日动作编辑" className="rounded-lg border border-action/30 bg-action/5 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold">编辑本日动作</h4>
              <p className="text-xs text-muted">仅支持本地审核动作 · 版本 {draft?.prescriptionRevision}</p>
            </div>
            <button aria-label="取消编辑" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white" onClick={() => { setOpen(false); setConfirming(false); setError(""); }} type="button"><X size={16} /></button>
          </div>
          <div className="space-y-2">
            {draft?.exercises.map((exercise, index) => (
              <div className="rounded-lg border border-line bg-white p-2" key={`${exercise.exerciseId}-${index}`}>
                <div className="flex items-center gap-2">
                  <select aria-label={`第 ${index + 1} 个动作`} className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-sm" onChange={(event) => {
                    const replacement = catalog.find((item) => item.id === event.target.value);
                    if (replacement) updateExercise(index, { exerciseId: replacement.id, slug: replacement.slug, name: replacement.name, direction: replacement.training_direction ?? draft.direction });
                  }} value={exercise.exerciseId}>
                    {catalog.filter((item) => item.training_direction === draft.direction && (item.id === exercise.exerciseId || !draft.exercises.some((current) => current.exerciseId === item.id))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <button aria-label={`上移第 ${index + 1} 个动作`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line" disabled={index === 0} onClick={() => moveExercise(index, -1)} type="button"><ArrowUp size={16} /></button>
                  <button aria-label={`下移第 ${index + 1} 个动作`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line" disabled={index === (draft?.exercises.length ?? 1) - 1} onClick={() => moveExercise(index, 1)} type="button"><ArrowDown size={16} /></button>
                  <button aria-label={`删除第 ${index + 1} 个动作`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 text-red-600" disabled={(draft?.exercises.length ?? 0) <= 1} onClick={() => removeExercise(index)} type="button"><Trash2 size={16} /></button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="text-xs text-muted">组数<input aria-label={`${exercise.name} 目标组数`} className="mt-1 h-11 w-full rounded-lg border border-line px-2 text-sm text-ink" min="1" max="20" onChange={(event) => updateExercise(index, { targetSets: Number(event.target.value) })} type="number" value={exercise.targetSets} /></label>
                  <label className="text-xs text-muted">次数<input aria-label={`${exercise.name} 目标次数`} className="mt-1 h-11 w-full rounded-lg border border-line px-2 text-sm text-ink" min="1" max="1000" onChange={(event) => updateExercise(index, { targetReps: Number(event.target.value) })} type="number" value={exercise.targetReps} /></label>
                  <label className="text-xs text-muted">重量 kg<input aria-label={`${exercise.name} 目标重量 kg`} className="mt-1 h-11 w-full rounded-lg border border-line px-2 text-sm text-ink" min="0" max="10000" step="0.5" onChange={(event) => updateExercise(index, { targetWeight: Number(event.target.value) })} type="number" value={exercise.targetWeight} /></label>
                </div>
              </div>
            ))}
          </div>
          {available.length > 0 && (draft?.exercises.length ?? 0) < 12 ? <label className="mt-3 block text-sm"><span className="mb-1 block font-semibold">添加本地动作</span><select aria-label="添加本地动作" className="h-11 w-full rounded-lg border border-line bg-white px-3" onChange={(event) => { addExercise(event.target.value); event.currentTarget.value = ""; }} value=""><option value="">选择动作</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
          {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
          {confirming && draft ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-muted">将新增 {getPrescriptionChangeSummary(before, draft.exercises).added} 个、删除 {getPrescriptionChangeSummary(before, draft.exercises).removed} 个动作；保存后本日训练和后续实际数据将按新处方记录。</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void save()} type="button"><Save size={16} />{confirming ? "确认保存本日处方" : "预览并保存"}</button>
            {confirming ? <button className="inline-flex h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold" disabled={busy} onClick={() => setConfirming(false)} type="button">返回修改</button> : null}
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold" disabled={busy} onClick={() => { setOpen(false); setConfirming(false); }} type="button">取消</button>
          </div>
        </section>
      )}
    </div>
  );
}
