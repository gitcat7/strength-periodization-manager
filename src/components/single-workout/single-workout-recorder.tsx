"use client";

import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ExternalExerciseReference } from "@/domain/external-exercise";
import { filterAddableExternalExercises } from "@/domain/exercise-selection";
import { reviewedExerciseSections, searchReviewedExercises, type ExerciseLoadType, type ReviewedExercise, type ReviewedExerciseSection } from "@/domain/reviewed-exercise-library";
import { buildStandaloneWorkoutSavePayload, type ManualExerciseReference, type StandaloneSetDraft } from "@/domain/single-workout";
import { buildCompletionSummary, validateRecordedSet, type RecordedSetErrors } from "@/domain/workout-recording";
import { clearTrainingDataCaches } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type Source =
  | { kind: "reviewed"; reviewed: ReviewedExercise }
  | { kind: "wger"; reference: ExternalExerciseReference }
  | { kind: "manual"; manual: ManualExerciseReference };
type SelectedExercise = Source & { id: string; sets: StandaloneSetDraft[] };
type Summary = ReturnType<typeof buildCompletionSummary>;
type CompletedWorkout = { id: string; summary: Summary };

const createSet = (): StandaloneSetDraft => ({ completed: false, reps: "", rpe: "", weight: "" });
const defaultSets = () => [createSet(), createSet(), createSet()];
const today = new Date().toISOString().slice(0, 10);

export function SingleWorkoutRecorder() {
  const [section, setSection] = useState<ReviewedExerciseSection>("全部");
  const [query, setQuery] = useState("");
  const [external, setExternal] = useState<ExternalExerciseReference[]>([]);
  const [selected, setSelected] = useState<SelectedExercise[]>([]);
  const [draftWorkoutId, setDraftWorkoutId] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "completed" | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, RecordedSetErrors>>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [completedWorkout, setCompletedWorkout] = useState<CompletedWorkout | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualEquipment, setManualEquipment] = useState("");
  const [manualMuscles, setManualMuscles] = useState("");
  const [manualLoadType, setManualLoadType] = useState<ExerciseLoadType>("weighted");

  useEffect(() => {
    void createBrowserSupabaseClient().rpc("get_standalone_workout_draft").then(({ data, error }) => {
      if (error) { setMessage("草稿读取失败，请刷新后重试。"); return; }
      if (!data || typeof data !== "object") return;
      const stored = data as { workout_id?: unknown; exercises?: unknown };
      if (!Array.isArray(stored.exercises)) return;
      const restored = stored.exercises.flatMap((value, index) => restoreSelection(value, index));
      setSelected(restored);
      setDraftWorkoutId(typeof stored.workout_id === "string" ? stored.workout_id : null);
      if (stored.workout_id) setMessage("已恢复上次未完成的自由训练草稿。");
    });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setExternal([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void searchExternal(trimmed, controller), 280);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  async function searchExternal(queryText: string, controller: AbortController) {
    try {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      if (!data.session) return;
      const response = await fetch(`/api/exercise-catalog/search?q=${encodeURIComponent(queryText)}&page=1`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, signal: controller.signal
      });
      if (!response.ok) throw new Error("external search failed");
      const payload = await response.json() as { items?: ExternalExerciseReference[] };
      if (!controller.signal.aborted) setExternal(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      if (!controller.signal.aborted) setExternal([]);
    }
  }

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);
  const reviewed = useMemo(() => searchReviewedExercises(query, section).filter((item) => !selectedIds.has(`reviewed:${item.id}`)), [query, section, selectedIds]);
  const supplemental = useMemo(() => filterAddableExternalExercises(external, query, section)
    .filter((item) => !selectedIds.has(`wger:${item.externalId}`)), [external, query, section, selectedIds]);

  function add(item: Source) {
    const id = item.kind === "reviewed" ? `reviewed:${item.reviewed.id}` : item.kind === "wger" ? `wger:${item.reference.externalId}` : item.manual.id;
    setSelected((current) => current.some((entry) => entry.id === id) ? current : [...current, { ...item, id, sets: defaultSets() }]);
  }
  function update(id: string, mapper: (item: SelectedExercise) => SelectedExercise) { setSelected((current) => current.map((item) => item.id === id ? mapper(item) : item)); }
  function loadType(item: SelectedExercise): ExerciseLoadType { return item.kind === "reviewed" ? item.reviewed.loadType : item.kind === "manual" ? item.manual.loadType : "weighted"; }
  function description(item: SelectedExercise | ReviewedExercise | ExternalExerciseReference) {
    if ("kind" in item) return item.kind === "reviewed" ? [item.reviewed.equipment.join("/"), item.reviewed.primaryMuscles.join("/")].filter(Boolean).join(" · ") : item.kind === "manual" ? [item.manual.equipment.join("/"), item.manual.muscles.join("/")].filter(Boolean).join(" · ") : [...item.reference.equipment, ...item.reference.muscles].join(" · ");
    if ("nameZh" in item) return [item.equipment.join("/"), item.primaryMuscles.join("/")].filter(Boolean).join(" · ");
    return [...item.equipment, ...item.muscles].join(" · ");
  }
  function name(item: SelectedExercise) { return item.kind === "reviewed" ? item.reviewed.nameZh : item.kind === "manual" ? item.manual.name : item.reference.name; }
  function requestComplete() {
    const next: Record<string, RecordedSetErrors> = {};
    selected.forEach((exercise) => exercise.sets.forEach((set, index) => { const result = validateRecordedSet(set, loadType(exercise)); if (Object.keys(result).length) next[`${exercise.id}:${index}`] = result; }));
    setErrors(next);
    if (Object.keys(next).length) { setMessage("请修正已完成组的字段后再结束训练。输入内容已保留。"); return; }
    const allRecordedSets = selected.flatMap((exercise) => exercise.sets.map((set) => ({ ...set, loadType: loadType(exercise) })));
    setSummary(buildCompletionSummary(allRecordedSets));
  }
  async function save(status: "draft" | "completed") {
    if (!selected.length) { setMessage("请先添加至少一个动作。"); return; }
    setSaving(status); setMessage("");
    const payloadItems = selected.map((item) => item.kind === "reviewed" ? { reviewedExercise: item.reviewed, sets: item.sets } : item.kind === "wger" ? { externalReference: item.reference, sets: item.sets } : { manualExercise: item.manual, sets: item.sets });
    const { data, error } = await createBrowserSupabaseClient().rpc("save_standalone_workout", { p_payload: { ...buildStandaloneWorkoutSavePayload(today, payloadItems, draftWorkoutId ?? undefined), status } });
    setSaving(null);
    if (error) { setMessage("保存失败，请检查网络或字段后重试。输入内容已保留。"); return; }
    if (status === "completed") {
      const workoutId = typeof data === "string" ? data : null;
      if (!workoutId || !summary) { setMessage("训练已保存，但暂时无法定位该次记录。请前往全部历史查看。 "); return; }
      clearTrainingDataCaches();
      setDraftWorkoutId(null);
      setSelected([]);
      setSummary(null);
      setCompletedWorkout({ id: workoutId, summary });
      return;
    }
    setDraftWorkoutId(typeof data === "string" ? data : draftWorkoutId); setMessage("草稿已保存，可随时继续编辑。");
  }
  function addManual() {
    const name = manualName.trim();
    if (!name) { setMessage("手动动作至少需要填写名称。"); return; }
    const manual: ManualExerciseReference = { equipment: split(manualEquipment), id: `manual:${crypto.randomUUID()}`, loadType: manualLoadType, muscles: split(manualMuscles), name };
    add({ kind: "manual", manual }); setManualName(""); setManualEquipment(""); setManualMuscles("");
  }

  const noResult = Boolean(query.trim()) && !reviewed.length && !supplemental.length;
  if (completedWorkout) {
    const completedSummary = completedWorkout.summary;
    return <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} />返回首页</Link>
      <section className="mt-5 border border-line bg-white p-4">
        <p className="page-kicker">自由训练 · 已完成</p>
        <h1 className="mt-1 text-2xl font-bold">自由训练已完成</h1>
        <p className="mt-2 text-sm text-muted">完成日期：{today}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-line py-4 text-sm">
          <div><dt className="text-muted">训练类型</dt><dd className="mt-1 font-semibold">自由训练</dd></div>
          <div><dt className="text-muted">完成组数</dt><dd className="mt-1 font-semibold">{completedSummary.completedSetCount} 组</dd></div>
          <div><dt className="text-muted">总吨位</dt><dd className="mt-1 font-semibold">{completedSummary.totalTonnage === null ? "不适用" : `${completedSummary.totalTonnage} kg`}</dd></div>
          <div><dt className="text-muted">最高 e1RM</dt><dd className="mt-1 font-semibold">{completedSummary.bestE1rm === null ? "不适用" : `${completedSummary.bestE1rm} kg`}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted">已保存到历史与进展，不会自动调整周期计划。</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Link className="pressable inline-flex min-h-11 items-center justify-center rounded-md bg-action px-3 py-2 text-sm font-semibold text-white" href={`/history?workout=${completedWorkout.id}`}>查看本次记录</Link>
          <Link className="pressable inline-flex min-h-11 items-center justify-center rounded-md border border-action px-3 py-2 text-sm font-semibold text-action" href="/history">查看全部历史</Link>
          <Link className="pressable inline-flex min-h-11 items-center justify-center rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink" href="/">返回首页</Link>
        </div>
      </section>
    </main>;
  }
  return <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
    <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} />返回首页</Link>
    <header className="mt-4 flex items-start justify-between gap-3"><div><p className="page-kicker">自由训练 · {today}</p><h1 className="text-2xl font-bold">记录今日训练</h1><p className="mt-1 text-sm text-muted">本次记录会保存到历史与进展，不会自动调整你的周期计划。</p></div><button disabled={saving !== null} onClick={requestComplete} className="pressable shrink-0 rounded-md bg-action px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">完成训练</button></header>
    <section className="mt-6 border-y border-line py-4"><h2 className="section-heading">添加动作</h2><p className="mt-1 text-sm text-muted">默认显示审核动作；输入名称后才补充搜索待确认外部动作。</p><label className="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2"><Search size={17} /><input className="min-w-0 flex-1 bg-transparent outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文或英文动作名" type="search" value={query} /></label><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{reviewedExerciseSections.map((item) => <button className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${section === item ? "bg-action text-white" : "bg-field text-muted"}`} key={item} onClick={() => setSection(item)} type="button">{item}</button>)}</div><div className="mt-3 divide-y divide-line border-y border-line">{reviewed.map((item) => <details className="py-3" key={item.id}><summary className="cursor-pointer font-semibold">{item.nameZh}<span className="ml-2 text-xs font-normal text-muted">{description(item)}</span></summary><p className="mt-2 text-sm text-muted">{item.movementPattern} · {item.riskLevel === "technical" ? "技术动作，请使用可控重量" : "基础训练动作"}</p><button className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-action" onClick={() => add({ kind: "reviewed", reviewed: item })} type="button"><Plus size={15} />添加</button></details>)}{supplemental.map((item) => <details className="py-3" key={item.externalId}><summary className="cursor-pointer font-semibold">{item.name}<span className="ml-2 text-xs font-normal text-muted">待确认动作 · {description(item)}</span></summary><a className="mt-2 block text-sm text-action underline" href={item.sourceUrl} rel="noreferrer" target="_blank">查看来源信息</a><button className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-action" onClick={() => add({ kind: "wger", reference: item })} type="button"><Plus size={15} />确认后添加</button></details>)}{noResult ? <div className="py-3"><p className="text-sm text-muted">没有可确认的动作结果。</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><input className="rounded-md border border-line px-3 py-2" onChange={(event) => setManualName(event.target.value)} placeholder="手动动作名称（必填）" value={manualName} /><input className="rounded-md border border-line px-3 py-2" onChange={(event) => setManualEquipment(event.target.value)} placeholder="器械（可选）" value={manualEquipment} /><input className="rounded-md border border-line px-3 py-2" onChange={(event) => setManualMuscles(event.target.value)} placeholder="训练部位（可选）" value={manualMuscles} /><select className="rounded-md border border-line px-3 py-2" onChange={(event) => setManualLoadType(event.target.value as ExerciseLoadType)} value={manualLoadType}><option value="weighted">负重</option><option value="bodyweight">自重</option><option value="assisted">辅助重量</option></select></div><button className="mt-2 text-sm font-semibold text-action" onClick={addManual} type="button">添加手动动作</button></div> : null}</div></section>
    <section className="mt-6"><h2 className="section-heading">已选动作</h2><div className="mt-3 space-y-5">{selected.map((exercise) => <div className="border-b border-line pb-5" key={exercise.id}><div className="flex items-start justify-between gap-2"><div><strong>{name(exercise)}</strong><small className="ml-2 text-muted">{description(exercise)}</small></div><div className="flex gap-1"><button aria-label="上移" onClick={() => moveSelection(setSelected, exercise.id, -1)} type="button"><ChevronUp size={18} /></button><button aria-label="下移" onClick={() => moveSelection(setSelected, exercise.id, 1)} type="button"><ChevronDown size={18} /></button><button aria-label="移除动作" onClick={() => setSelected((items) => items.filter((item) => item.id !== exercise.id))} type="button"><Trash2 size={18} /></button></div></div><div className="mt-3 grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] gap-1 text-xs text-muted"><span>组</span><span>重量 (kg)</span><span>次数</span><span>RPE</span><span>完成</span></div><div className="space-y-2">{exercise.sets.map((set, index) => <div key={index}><div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-1"><span>{index + 1}</span>{(["weight", "reps", "rpe"] as const).map((field) => <input className="min-w-0 rounded-md border border-line px-2 py-2" inputMode={field === "reps" ? "numeric" : "decimal"} key={field} onChange={(event) => update(exercise.id, (item) => ({ ...item, sets: item.sets.map((value, setIndex) => setIndex === index ? { ...value, [field]: event.target.value } : value) }))} value={set[field]} />)}<button aria-label="完成本组" className={set.completed ? "text-action" : "text-muted"} onClick={() => update(exercise.id, (item) => ({ ...item, sets: item.sets.map((value, setIndex) => setIndex === index ? { ...value, completed: !value.completed } : value) }))} type="button"><Check size={18} /></button></div>{errors[`${exercise.id}:${index}`] ? <p className="mt-1 text-xs text-red-600">{Object.values(errors[`${exercise.id}:${index}`]).join(" ")}</p> : null}</div>)}</div><div className="mt-2 flex gap-3 text-sm"><button className="text-action" onClick={() => update(exercise.id, (item) => ({ ...item, sets: [...item.sets, createSet()] }))} type="button">+ 增加一组</button>{exercise.sets.length > 1 ? <button className="text-muted" onClick={() => update(exercise.id, (item) => ({ ...item, sets: item.sets.slice(0, -1) }))} type="button">删除末组</button> : null}</div></div>)}</div></section>
    <div className="mt-6 flex items-center justify-between gap-3"><button className="pressable rounded-md border border-action px-3 py-2 text-sm font-semibold text-action" disabled={saving !== null} onClick={() => void save("draft")} type="button">{saving === "draft" ? "保存中…" : "保存草稿"}</button><p aria-live="polite" className="text-sm text-muted">{message}</p></div>
    {summary ? <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 p-4 sm:place-items-center" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-lg bg-white p-4"><h2 className="text-lg font-bold">本次训练摘要</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">已完成组</dt><dd className="font-semibold">{summary.completedSetCount} 组</dd></div><div><dt className="text-muted">漏记组</dt><dd className="font-semibold">{summary.incompleteSetCount} 组</dd></div><div><dt className="text-muted">总吨位</dt><dd className="font-semibold">{summary.totalTonnage === null ? "不适用" : `${summary.totalTonnage} kg`}</dd></div><div><dt className="text-muted">最高 e1RM</dt><dd className="font-semibold">{summary.bestE1rm === null ? "不适用" : `${summary.bestE1rm} kg`}</dd></div></dl><p className="mt-3 text-sm text-muted">自由训练会保存到历史与进展，不会自动调整周期计划。</p><div className="mt-4 flex gap-2"><button className="rounded-md border border-line px-3 py-2 text-sm font-semibold" onClick={() => setSummary(null)} type="button">返回继续记录</button><button className="rounded-md bg-action px-3 py-2 text-sm font-semibold text-white" disabled={saving !== null} onClick={() => void save("completed")} type="button">{summary.incompleteSetCount ? "仍然结束训练" : "确认完成"}</button></div></div></div> : null}
  </main>;
}

function split(value: string) { return value.split(/[，,]/).map((item) => item.trim()).filter(Boolean).slice(0, 6); }

function moveSelection(setSelected: Dispatch<SetStateAction<SelectedExercise[]>>, id: string, direction: -1 | 1) {
  setSelected((items) => { const index = items.findIndex((item) => item.id === id); const target = index + direction; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; });
}

function restoreSelection(value: unknown, index: number): SelectedExercise[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = value as Record<string, unknown>; const sets = Array.isArray(item.sets) ? item.sets as StandaloneSetDraft[] : defaultSets();
  const metadata = item.exercise_metadata_snapshot as Record<string, unknown> | null;
  const equipment = Array.isArray(metadata?.equipment) ? metadata.equipment.filter((entry): entry is string => typeof entry === "string") : [];
  const muscles = Array.isArray(metadata?.muscles) ? metadata.muscles.filter((entry): entry is string => typeof entry === "string") : [];
  if (item.exercise_provider === "reviewed" && typeof item.external_exercise_id === "string") { const reviewed = searchReviewedExercises("", "全部").find((entry) => `reviewed:${entry.id}` === item.external_exercise_id); return reviewed ? [{ id: item.external_exercise_id, kind: "reviewed", reviewed, sets }] : []; }
  if (item.exercise_provider === "manual" && typeof item.external_exercise_id === "string" && typeof item.exercise_name_snapshot === "string") return [{ id: item.external_exercise_id, kind: "manual", manual: { equipment, id: item.external_exercise_id, loadType: metadata?.loadType === "bodyweight" || metadata?.loadType === "assisted" ? metadata.loadType : "weighted", muscles, name: item.exercise_name_snapshot }, sets }];
  if (item.exercise_provider === "wger" && typeof item.external_exercise_id === "string" && typeof item.exercise_name_snapshot === "string" && typeof metadata?.sourceUrl === "string") return [{ id: `wger:${item.external_exercise_id}`, kind: "wger", reference: { category: typeof metadata.category === "string" ? metadata.category : null, equipment, externalId: item.external_exercise_id, muscles, name: item.exercise_name_snapshot, provider: "wger", sourceUrl: metadata.sourceUrl }, sets }];
  return [];
}
