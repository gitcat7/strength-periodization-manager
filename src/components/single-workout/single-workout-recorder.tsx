"use client";

import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { filterSelectableExercises, type SelectableExercise, type SingleWorkoutCategory } from "@/domain/single-workout";

type SetDraft = { completed: boolean; reps: string; rpe: string; weight: string };
type ExerciseDraft = SelectableExercise & { sets: SetDraft[] };
const categories: SingleWorkoutCategory[] = ["胸", "背", "腿", "肩", "手臂", "核心", "全身"];
const createSet = (): SetDraft => ({ completed: false, reps: "", rpe: "", weight: "" });

export function SingleWorkoutRecorder() {
  const [allExercises, setAllExercises] = useState<SelectableExercise[]>([]);
  const [selected, setSelected] = useState<ExerciseDraft[]>([]);
  const [category, setCategory] = useState<SingleWorkoutCategory>("胸");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<"draft" | "completed" | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void supabase.from("exercises").select("id,name,category,default_increment").order("name").then(({ data, error }) => {
      if (error) setMessage("动作列表读取失败，请刷新后重试。");
      else setAllExercises((data ?? []).map((item) => ({ id: item.id, name: item.name, category: item.category, defaultIncrement: Number(item.default_increment) })));
    });
  }, []);

  const visibleExercises = useMemo(
    () => filterSelectableExercises(allExercises, { category, query }).filter((item) => !selected.some((chosen) => chosen.id === item.id)).slice(0, 30),
    [allExercises, category, query, selected]
  );

  function addExercise(exercise: SelectableExercise) {
    setSelected((current) => current.some((item) => item.id === exercise.id) ? current : [...current, { ...exercise, sets: [createSet(), createSet(), createSet()] }]);
  }
  function updateSet(exerciseId: string, setIndex: number, patch: Partial<SetDraft>) {
    setSelected((current) => current.map((exercise) => exercise.id !== exerciseId ? exercise : { ...exercise, sets: exercise.sets.map((set, index) => index === setIndex ? { ...set, ...patch } : set) }));
  }
  function move(exerciseId: string, direction: -1 | 1) {
    setSelected((current) => { const index = current.findIndex((item) => item.id === exerciseId); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  async function save(status: "draft" | "completed") {
    if (!selected.length) { setMessage("请先添加至少一个动作。"); return; }
    setSaving(status); setMessage("");
    const { error } = await createBrowserSupabaseClient().rpc("create_standalone_workout", {
      p_payload: { scheduled_date: today, status, exercises: selected.map((exercise) => ({ exercise_id: exercise.id, sets: exercise.sets.map((set, index) => ({ set_index: index + 1, ...set })) })) }
    });
    setSaving(null);
    setMessage(error ? "保存失败，请检查网络后重试。" : status === "completed" ? "训练已完成，已计入历史与进展。" : "草稿已保存，可随时继续编辑。");
  }

  return <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
    <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} />返回首页</Link>
    <div className="mt-4 flex items-start justify-between gap-3"><div><p className="page-kicker">{today}</p><h1 className="text-2xl font-bold">记录今日训练</h1><p className="mt-1 text-sm text-muted">单次记录会进入历史和进展，但不会生成或修改周期计划。</p></div><button disabled={saving !== null} onClick={() => save("completed")} className="pressable shrink-0 rounded-md bg-action px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving === "completed" ? "完成中…" : "完成训练"}</button></div>
    <section className="mt-6 border-y border-line py-4"><h2 className="section-heading">添加动作</h2><label className="mt-3 flex items-center gap-2 rounded-md border border-line px-3 py-2"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜索中文动作名" /></label><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${category === item ? "bg-action text-white" : "bg-field text-muted"}`}>{item}</button>)}</div><div className="mt-3 divide-y divide-line border-y border-line">{visibleExercises.map((exercise) => <button key={exercise.id} onClick={() => addExercise(exercise)} className="flex w-full items-center justify-between py-3 text-left"><span><strong>{exercise.name}</strong><small className="ml-2 text-muted">{exercise.category}</small></span><Plus size={18} className="text-action" /></button>)}{!visibleExercises.length && <p className="py-3 text-sm text-muted">没有匹配动作。</p>}</div></section>
    <section className="mt-6"><h2 className="section-heading">已选动作</h2><div className="mt-3 space-y-5">{selected.map((exercise) => <div key={exercise.id} className="border-b border-line pb-5"><div className="flex items-center justify-between gap-2"><div><strong>{exercise.name}</strong><small className="ml-2 text-muted">{exercise.category}</small></div><div className="flex gap-1"><button aria-label="上移" onClick={() => move(exercise.id, -1)}><ChevronUp size={18} /></button><button aria-label="下移" onClick={() => move(exercise.id, 1)}><ChevronDown size={18} /></button><button aria-label="移除动作" onClick={() => setSelected((items) => items.filter((item) => item.id !== exercise.id))}><Trash2 size={18} /></button></div></div><div className="mt-3 space-y-2">{exercise.sets.map((set, index) => <div key={index} className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] items-center gap-1 text-sm"><span>{index + 1}</span><input inputMode="decimal" value={set.weight} onChange={(e) => updateSet(exercise.id,index,{weight:e.target.value})} className="min-w-0 rounded-md border border-line px-2 py-2" placeholder="kg" /><input inputMode="numeric" value={set.reps} onChange={(e) => updateSet(exercise.id,index,{reps:e.target.value})} className="min-w-0 rounded-md border border-line px-2 py-2" placeholder="次数" /><input inputMode="decimal" value={set.rpe} onChange={(e) => updateSet(exercise.id,index,{rpe:e.target.value})} className="min-w-0 rounded-md border border-line px-2 py-2" placeholder="RPE" /><button aria-label="完成本组" onClick={() => updateSet(exercise.id,index,{completed:!set.completed})} className={set.completed ? "text-action" : "text-muted"}><Check size={18} /></button></div>)}</div><div className="mt-2 flex gap-3 text-sm"><button onClick={() => setSelected((items) => items.map((item) => item.id === exercise.id ? {...item,sets:[...item.sets,createSet()]}:item))} className="text-action">+ 增加一组</button>{exercise.sets.length > 1 && <button onClick={() => setSelected((items) => items.map((item) => item.id === exercise.id ? {...item,sets:item.sets.slice(0,-1)}:item))} className="text-muted">删除末组</button>}</div></div>)}</div></section>
    <div className="mt-6 flex items-center justify-between gap-3"><button disabled={saving !== null} onClick={() => save("draft")} className="pressable rounded-md border border-action px-3 py-2 text-sm font-semibold text-action disabled:opacity-60">{saving === "draft" ? "保存中…" : "保存草稿"}</button><p aria-live="polite" className="text-sm text-muted">{message}</p></div>
  </main>;
}
