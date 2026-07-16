"use client";

import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type ExternalExerciseReference } from "@/domain/external-exercise";
import { exerciseSearchSections, filterExternalExerciseSearchResults, type ExerciseSearchSection } from "@/domain/external-exercise-search";
import { buildStandaloneWorkoutSavePayload, type StandaloneSetDraft } from "@/domain/single-workout";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SelectedExercise = { id: string; reference: ExternalExerciseReference; sets: StandaloneSetDraft[] };
const createSet = (): StandaloneSetDraft => ({ completed: false, reps: "", rpe: "", weight: "" });

export function SingleWorkoutRecorder() {
  const [category, setCategory] = useState<ExerciseSearchSection>("全部");
  const [draftWorkoutId, setDraftWorkoutId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExternalExerciseReference[]>([]);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [saving, setSaving] = useState<"draft" | "completed" | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [selected, setSelected] = useState<SelectedExercise[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void supabase.rpc("get_standalone_workout_draft").then(({ data, error }) => {
      if (error) { setMessage("草稿读取失败，请刷新后重试。"); return; }
      if (!data || typeof data !== "object") return;
      const stored = data as { workout_id?: string; exercises?: Array<Record<string, unknown>> };
      const restored = (stored.exercises ?? []).flatMap((item): SelectedExercise[] => {
        const metadata = item.exercise_metadata_snapshot;
        if (item.exercise_id !== null || item.exercise_provider !== "wger" || typeof item.external_exercise_id !== "string"
          || typeof item.exercise_name_snapshot !== "string" || !metadata || typeof metadata !== "object") return [];
        const snapshot = metadata as { category?: unknown; equipment?: unknown; muscles?: unknown; sourceUrl?: unknown };
        if (!Array.isArray(snapshot.equipment) || !Array.isArray(snapshot.muscles) || typeof snapshot.sourceUrl !== "string") return [];
        return [{
          id: `wger:${item.external_exercise_id}`,
          reference: { category: typeof snapshot.category === "string" ? snapshot.category : null, equipment: snapshot.equipment.filter((value): value is string => typeof value === "string"), externalId: item.external_exercise_id, muscles: snapshot.muscles.filter((value): value is string => typeof value === "string"), name: item.exercise_name_snapshot, provider: "wger", sourceUrl: snapshot.sourceUrl },
          sets: Array.isArray(item.sets) ? item.sets as StandaloneSetDraft[] : [createSet(), createSet(), createSet()]
        }];
      });
      setDraftWorkoutId(typeof stored.workout_id === "string" ? stored.workout_id : null);
      setSelected(restored);
      if (stored.workout_id) setMessage("已恢复上次未完成的单次训练草稿。");
    });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setResults([]); setSearchError(false); setSearchStatus("idle"); return; }
    setSearchStatus("loading");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        if (!data.session) { setMessage("登录已失效，请重新登录。"); setSearchError(true); setSearchStatus("error"); return; }
        try {
          const response = await fetch(`/api/exercise-catalog/search?q=${encodeURIComponent(trimmed)}&page=1`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, signal: controller.signal });
          if (!response.ok) throw new Error("search failed");
          const payload = await response.json() as { items?: ExternalExerciseReference[] };
          setResults((payload.items ?? []).filter((item) => item.provider === "wger")); setSearchError(false); setSearchStatus("success");
        } catch (error) { if (!controller.signal.aborted) { setSearchError(true); setSearchStatus("error"); } }
      })();
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, searchAttempt]);

  const visible = useMemo(() => filterExternalExerciseSearchResults(results, category, new Set(selected.map((entry) => entry.reference.externalId))), [category, results, selected]);
  const mutate = (id: string, update: (exercise: SelectedExercise) => SelectedExercise) => setSelected((items) => items.map((item) => item.id === id ? update(item) : item));
  function add(reference: ExternalExerciseReference) { setSelected((items) => items.some((item) => item.reference.externalId === reference.externalId) ? items : [...items, { id: `wger:${reference.externalId}`, reference, sets: [createSet(), createSet(), createSet()] }]); }
  function move(id: string, direction: -1 | 1) { setSelected((items) => { const index = items.findIndex((item) => item.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; }); }
  async function save(status: "draft" | "completed") {
    if (!selected.length) { setMessage("请先添加至少一个动作。"); return; }
    setSaving(status); setMessage("");
    const payload = { ...buildStandaloneWorkoutSavePayload(today, selected.map((item) => ({ externalReference: item.reference, sets: item.sets })), draftWorkoutId ?? undefined), status };
    const { data, error } = await createBrowserSupabaseClient().rpc("save_standalone_workout", { p_payload: payload });
    setSaving(null);
    if (error) { setMessage("保存失败，请检查网络后重试。"); return; }
    if (status === "completed") { setDraftWorkoutId(null); setSelected([]); setMessage("训练已完成，已计入历史与进展。"); return; }
    setDraftWorkoutId(typeof data === "string" ? data : draftWorkoutId); setMessage("草稿已保存，可随时继续编辑。");
  }

  return <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
    <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} />返回首页</Link>
    <div className="mt-4 flex items-start justify-between gap-3"><div><p className="page-kicker">{today}</p><h1 className="text-2xl font-bold">记录今日训练</h1><p className="mt-1 text-sm text-muted">单次记录会进入历史和进展，但不会生成或修改周期计划。</p></div><button disabled={saving !== null} onClick={() => void save("completed")} className="pressable shrink-0 rounded-md bg-action px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving === "completed" ? "完成中…" : "完成训练"}</button></div>
    <section className="mt-6 border-y border-line py-4"><h2 className="section-heading">添加动作</h2><p className="mt-2 text-sm text-muted">从动作库搜索并添加动作。支持中文和英文，例如：卧推、深蹲、bench、squat。</p><label className="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜索中文或英文动作名" /></label><div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="按部位筛选搜索结果">{exerciseSearchSections.map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${category === item ? "bg-action text-white" : "bg-field text-muted"}`}>{item}</button>)}</div><div className="mt-3 divide-y divide-line border-y border-line">{searchStatus === "idle" ? <p className="py-3 text-sm text-muted">输入动作名即可搜索动作库；默认显示全部匹配结果。</p> : null}{searchStatus === "loading" ? <p className="py-3 text-sm text-muted">正在搜索动作库…</p> : null}{searchStatus === "error" && searchError ? <button aria-label="重试动作搜索" className="my-3 inline-flex items-center gap-1 text-sm font-semibold text-action" onClick={() => setSearchAttempt((attempt) => attempt + 1)}><RefreshCcw size={15} />动作服务暂不可用，重试</button> : null}{searchStatus === "success" ? <>{visible.map((exercise) => <button key={exercise.externalId} onClick={() => add(exercise)} className="flex w-full items-center justify-between py-3 text-left"><span><strong>{exercise.name}</strong><small className="ml-2 text-muted">{[...exercise.muscles, ...exercise.equipment].join(" · ")}</small></span><Plus size={18} className="text-action" /></button>)}{!visible.length ? <p className="py-3 text-sm text-muted">{results.length ? "当前部位没有未添加的匹配动作。可切换为“全部”查看。" : "没有匹配动作。试试更短的中文或英文关键词。"}</p> : null}</> : null}</div></section>
    <section className="mt-6"><h2 className="section-heading">已选动作</h2><div className="mt-3 space-y-5">{selected.map((exercise) => <div key={exercise.id} className="border-b border-line pb-5"><div className="flex items-center justify-between gap-2"><div><strong>{exercise.reference.name}</strong><small className="ml-2 text-muted">{[...exercise.reference.muscles, ...exercise.reference.equipment].join(" · ")}</small></div><div className="flex gap-1"><button aria-label="上移" onClick={() => move(exercise.id, -1)}><ChevronUp size={18} /></button><button aria-label="下移" onClick={() => move(exercise.id, 1)}><ChevronDown size={18} /></button><button aria-label="移除动作" onClick={() => setSelected((items) => items.filter((item) => item.id !== exercise.id))}><Trash2 size={18} /></button></div></div><div className="mt-3 space-y-2">{exercise.sets.map((set, index) => <div key={index} className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-1 text-sm"><span>{index + 1}</span><input inputMode="decimal" value={set.weight} onChange={(e) => mutate(exercise.id, (item) => ({ ...item, sets: item.sets.map((value, i) => i === index ? { ...value, weight: e.target.value } : value) }))} className="min-w-0 rounded-md border border-line px-2 py-2" placeholder="kg" /><input inputMode="numeric" value={set.reps} onChange={(e) => mutate(exercise.id, (item) => ({ ...item, sets: item.sets.map((value, i) => i === index ? { ...value, reps: e.target.value } : value) }))} className="min-w-0 rounded-md border border-line px-2 py-2" placeholder="次数" /><input inputMode="decimal" value={set.rpe} onChange={(e) => mutate(exercise.id, (item) => ({ ...item, sets: item.sets.map((value, i) => i === index ? { ...value, rpe: e.target.value } : value) }))} className="min-w-0 rounded-md border border-line px-2 py-2" placeholder="RPE" /><button aria-label="完成本组" onClick={() => mutate(exercise.id, (item) => ({ ...item, sets: item.sets.map((value, i) => i === index ? { ...value, completed: !value.completed } : value) }))} className={set.completed ? "text-action" : "text-muted"}><Check size={18} /></button></div>)}</div><div className="mt-2 flex gap-3 text-sm"><button onClick={() => mutate(exercise.id, (item) => ({ ...item, sets: [...item.sets, createSet()] }))} className="text-action">+ 增加一组</button>{exercise.sets.length > 1 ? <button onClick={() => mutate(exercise.id, (item) => ({ ...item, sets: item.sets.slice(0, -1) }))} className="text-muted">删除末组</button> : null}</div></div>)}</div></section>
    <div className="mt-6 flex items-center justify-between gap-3"><button disabled={saving !== null} onClick={() => void save("draft")} className="pressable rounded-md border border-action px-3 py-2 text-sm font-semibold text-action disabled:opacity-60">{saving === "draft" ? "保存中…" : "保存草稿"}</button><p aria-live="polite" className="text-sm text-muted">{message}</p></div>
  </main>;
}
