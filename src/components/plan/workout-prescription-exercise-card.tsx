"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { formatPrescription } from "@/domain/training-format";
import type {
  PrescriptionDirection,
  WorkoutPrescriptionExerciseDraft
} from "@/domain/workout-prescription-editor";

export type WorkoutPrescriptionCatalogExercise = {
  id: string;
  slug: string;
  name: string;
  training_direction?: PrescriptionDirection | null;
};

type Props = {
  catalog: WorkoutPrescriptionCatalogExercise[];
  direction: PrescriptionDirection;
  exercise: WorkoutPrescriptionExerciseDraft;
  index: number;
  onChange: (patch: Partial<WorkoutPrescriptionExerciseDraft>) => void;
  onInsertAfter: (exercise: WorkoutPrescriptionCatalogExercise) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  totalExercises: number;
  usedExerciseIds: string[];
};

type PickerMode = "replace" | "insert" | null;

export function WorkoutPrescriptionExerciseCard({
  catalog,
  direction,
  exercise,
  index,
  onChange,
  onInsertAfter,
  onMove,
  onRemove,
  totalExercises,
  usedExerciseIds
}: Props) {
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const usedIds = new Set(usedExerciseIds);
  const directionCatalog = catalog.filter((item) => item.training_direction === direction);
  const replacementOptions = directionCatalog.filter((item) => item.id === exercise.exerciseId || !usedIds.has(item.id));
  const insertionOptions = directionCatalog.filter((item) => !usedIds.has(item.id));
  const canRemove = totalExercises > 1;
  const canInsert = totalExercises < 12;

  function replaceExercise(exerciseId: string) {
    const replacement = replacementOptions.find((item) => item.id === exerciseId);
    if (!replacement) return;
    onChange({
      direction: replacement.training_direction ?? direction,
      exerciseId: replacement.id,
      name: replacement.name,
      provider: "local",
      slug: replacement.slug
    });
    setPickerMode(null);
  }

  function insertExercise(exerciseId: string) {
    const insertion = insertionOptions.find((item) => item.id === exerciseId);
    if (!insertion) return;
    onInsertAfter(insertion);
    setPickerMode(null);
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3" data-prescription-exercise-card>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">动作 {index + 1}</p>
          <h5 className="mt-1 break-words font-semibold text-ink">{exercise.name}</h5>
        </div>
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-action">
          {formatPrescription({
            slug: exercise.slug,
            targetReps: exercise.targetReps,
            targetSets: exercise.targetSets,
            targetWeight: exercise.targetWeight
          })}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          组数
          <input aria-label={`${exercise.name} 目标组数`} className="mt-1 h-11 w-full min-w-0 rounded-lg border border-line px-3 text-sm text-ink" max="20" min="1" onChange={(event) => onChange({ targetSets: Number(event.target.value) })} type="number" value={exercise.targetSets} />
        </label>
        <label className="text-xs text-muted">
          次数
          <input aria-label={`${exercise.name} 目标次数`} className="mt-1 h-11 w-full min-w-0 rounded-lg border border-line px-3 text-sm text-ink" max="1000" min="1" onChange={(event) => onChange({ targetReps: Number(event.target.value) })} type="number" value={exercise.targetReps} />
        </label>
        <label className="text-xs text-muted">
          重量 kg
          <input aria-label={`${exercise.name} 目标重量 kg`} className="mt-1 h-11 w-full min-w-0 rounded-lg border border-line px-3 font-mono text-sm tabular-nums text-ink" max="10000" min="0" onChange={(event) => onChange({ targetWeight: Number(event.target.value) })} step="0.5" type="number" value={exercise.targetWeight} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink" onClick={() => setPickerMode((current) => current === "replace" ? null : "replace")} type="button">
          <Pencil size={16} /> 更换动作
        </button>
        <button aria-label={`上移第 ${index + 1} 个动作`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink disabled:opacity-40" disabled={index === 0} onClick={() => onMove(-1)} type="button">
          <ArrowUp size={16} /> 上移
        </button>
        <button aria-label={`下移第 ${index + 1} 个动作`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink disabled:opacity-40" disabled={index === totalExercises - 1} onClick={() => onMove(1)} type="button">
          <ArrowDown size={16} /> 下移
        </button>
        <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-600 disabled:opacity-40" disabled={!canRemove} onClick={onRemove} title={canRemove ? undefined : "至少保留一个动作"} type="button">
          <Trash2 size={16} /> 删除动作
        </button>
      </div>

      {pickerMode === "replace" ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-field p-2">
          <select aria-label={`更换${exercise.name}`} className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm" defaultValue="" onChange={(event) => replaceExercise(event.target.value)}>
            <option value="">选择替换动作</option>
            {replacementOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button aria-label="关闭更换动作" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white" onClick={() => setPickerMode(null)} type="button"><X size={16} /></button>
        </div>
      ) : null}

      <button className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-action/50 px-3 text-sm font-semibold text-action disabled:opacity-40" disabled={!canInsert} onClick={() => setPickerMode((current) => current === "insert" ? null : "insert")} title={canInsert ? undefined : "每个训练日最多 12 个动作"} type="button">
        <Plus size={16} /> 在此动作后新增
      </button>

      {pickerMode === "insert" ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-action/5 p-2">
          <select aria-label={`在${exercise.name}后新增动作`} className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm" defaultValue="" disabled={insertionOptions.length === 0} onChange={(event) => insertExercise(event.target.value)}>
            <option value="">{insertionOptions.length > 0 ? "选择新增动作" : "暂无可用动作"}</option>
            {insertionOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button aria-label="关闭新增动作" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white" onClick={() => setPickerMode(null)} type="button"><X size={16} /></button>
        </div>
      ) : null}
    </div>
  );
}
