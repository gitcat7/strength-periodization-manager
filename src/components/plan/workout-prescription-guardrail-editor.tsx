"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Save } from "lucide-react";
import { assessWorkoutPrescription, type LocalExerciseMetadata, type TrainingDirection } from "@/domain/workout-prescription-guardrails";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { clearTrainingDataCaches } from "@/lib/client-cache";

export type GuardrailExercise = LocalExerciseMetadata & { name: string; slug: string };
export type GuardrailDraftExercise = { exercise: GuardrailExercise; targetSets: number; targetReps: number; targetWeight: number };

export function WorkoutPrescriptionGuardrailEditor({
  catalog, exercises, onSaved, prescriptionRevision, workoutId
}: {
  catalog: GuardrailExercise[];
  exercises: GuardrailDraftExercise[];
  onSaved: () => Promise<void> | void;
  prescriptionRevision: number;
  workoutId: string;
}) {
  const [draft, setDraft] = useState(exercises);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const direction = useMemo<TrainingDirection | null>(() => {
    const directions = [...new Set(exercises.map((item) => item.exercise.trainingDirection).filter(Boolean))];
    return directions.length === 1 ? directions[0] as TrainingDirection : null;
  }, [exercises]);
  const currentHasMainLift = exercises.some((item) => item.exercise.isMainLift);
  const assessment = assessWorkoutPrescription({ direction, currentHasMainLift, exercises: draft });

  function update(index: number, patch: Partial<GuardrailDraftExercise>) {
    setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setConfirming(false); setMessage("");
  }
  function remove(index: number) { setDraft((current) => current.length <= 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)); setConfirming(false); }
  function move(index: number, delta: -1 | 1) { setDraft((current) => { const next = [...current]; const target = index + delta; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; }); setConfirming(false); }
  function addAfter(index: number) { const candidate = catalog.find((item) => item.trainingDirection === direction && !draft.some((draftItem) => draftItem.exercise.id === item.id)); if (!candidate || draft.length >= 12) return; setDraft((current) => [...current.slice(0, index + 1), { exercise: candidate, targetSets: 2, targetReps: 8, targetWeight: 0 }, ...current.slice(index + 1)]); setConfirming(false); }

  async function previewAndSave() {
    if (!assessment.canSave) { setMessage(assessment.blockers[0] ?? "请检查训练处方。"); return; }
    const payload = { exercises: draft.map((item, index) => ({ exercise_id: item.exercise.id, order_index: index + 1, target_sets: item.targetSets, target_reps: item.targetReps, target_weight: item.targetWeight })) };
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc("preview_workout_prescription_revision", { p_expected_revision: prescriptionRevision, p_payload: payload, p_workout_id: workoutId });
    if (error) { setMessage("处方护栏检查失败，请刷新后重试。"); return; }
    const preview = data as { requires_confirmation?: boolean; warnings?: Array<{ message?: unknown }> } | null;
    const warningMessages = (preview?.warnings ?? [])
      .map((warning) => typeof warning.message === "string" ? warning.message : null)
      .filter((message): message is string => Boolean(message));
    const needsConfirmation = Boolean(preview?.requires_confirmation) || assessment.requiresConfirmation;
    if (needsConfirmation && !confirming) { setConfirming(true); setMessage(warningMessages[0] ?? "存在训练量或恢复警告，请确认后再保存。"); return; }
    const { error: saveError } = await supabase.rpc("revise_workout_prescription", { p_confirm_warnings: true, p_expected_revision: prescriptionRevision, p_payload: payload, p_workout_id: workoutId });
    if (saveError) { setMessage("保存处方失败，当前训练日未被修改。"); return; }
    clearTrainingDataCaches(); setMessage(""); setOpen(false); await onSaved();
  }

  if (!open) return <button className="mt-3 h-11 rounded-lg border border-line bg-white px-3 text-sm font-semibold" onClick={() => setOpen(true)} type="button">调整本日动作</button>;
  return <section className="mt-3 rounded-lg border border-action/30 bg-action/5 p-3" aria-label="计划日动作护栏编辑">
    <h4 className="font-semibold">调整本日动作</h4><p className="mt-1 text-xs text-muted">仅使用结构化本地动作；保存前会预览科学护栏影响。</p>
    {draft.map((item, index) => <div className="mt-3 rounded-lg bg-white p-3" key={item.exercise.id}>
      <div className="flex items-center justify-between gap-2"><strong>{item.exercise.name}</strong><div className="flex gap-1"><button className="h-11 w-11 border" disabled={index===0} onClick={() => move(index,-1)} type="button">↑</button><button className="h-11 w-11 border" disabled={index===draft.length-1} onClick={() => move(index,1)} type="button">↓</button><button className="h-11 w-11 border" disabled={draft.length<=1} onClick={() => remove(index)} type="button"><Minus size={16}/></button></div></div>
      <div className="mt-2 grid grid-cols-3 gap-2">{([['组数','targetSets',1],['次数','targetReps',1],['重量 kg','targetWeight',0]] as const).map(([label,key,min]) => <label className="text-xs text-muted" key={key}>{label}<input className="mt-1 h-11 w-full min-w-0 rounded border px-2 text-base" min={min} onChange={(event) => update(index,{[key]:Number(event.target.value)} as Partial<GuardrailDraftExercise>)} type="number" value={item[key]}/></label>)}</div>
      <button className="mt-2 h-11 w-full rounded border border-dashed border-action text-sm font-semibold" disabled={draft.length>=12} onClick={() => addAfter(index)} type="button"><Plus size={16} className="inline"/> 在此动作后新增</button>
    </div>)}
    {assessment.blockers.map((blocker) => <p className="mt-2 text-sm text-red-600" key={blocker}>{blocker}</p>)}
    {assessment.warnings.map((warning) => <p className="mt-2 text-sm text-amber-700" key={warning}>{warning}</p>)}
    {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
    <div className="mt-3 flex gap-2"><button className="h-11 rounded-lg bg-action px-3 font-semibold text-white disabled:opacity-50" disabled={!assessment.canSave} onClick={() => void previewAndSave()} type="button"><Save size={16} className="inline"/> {confirming ? "二次确认保存" : "预览并保存"}</button><button className="h-11 rounded-lg border px-3 font-semibold" onClick={() => { setDraft(exercises); setOpen(false); setConfirming(false); }} type="button">取消</button></div>
  </section>;
}
