"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brain, CalendarDays, Loader2, Save, TrendingUp } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { RecommendationType } from "@/domain/fitness-coach";

type WorkoutRow = {
  id: string;
  scheduled_date: string;
  name: string;
  completed_at: string | null;
};

type WorkoutExerciseRow = {
  id: string;
  workout_id: string;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  exercises: {
    name: string;
    slug: string;
  } | null;
};

type SetLogRow = {
  id: string;
  workout_exercise_id: string;
  set_index: number;
  target_weight: number;
  target_reps: number;
  actual_weight: number | null;
  actual_reps: number | null;
  rpe: number | null;
  completed: boolean;
};

type RecommendationRow = {
  id: string;
  workout_id: string | null;
  recommendation_type: RecommendationType;
  previous_weight: number;
  suggested_weight: number;
  reason: string;
  status: string;
  exercises: {
    name: string;
    slug: string;
  } | null;
};

export function TrainingHistory() {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseRow[]>([]);
  const [setLogs, setSetLogs] = useState<SetLogRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadHistory() {
      setStatus("loading");
      setMessage("");

      try {
        const supabase = createBrowserSupabaseClient();
        const { data: sessionData, error: sessionError } = await withTimeout(
          supabase.auth.getSession(),
          "登录状态读取超时，请刷新页面后重试。"
        );
        const user = sessionData.session?.user;

        if (sessionError || !user) {
          window.location.href = "/login?next=/history";
          return;
        }

        const { data: workoutData, error: workoutError } = await withTimeout(
          supabase
            .from("workouts")
            .select("id,scheduled_date,name,completed_at")
            .eq("user_id", user.id)
            .eq("status", "completed")
            .order("scheduled_date", { ascending: false })
            .limit(12),
          "训练历史读取超时，请刷新页面后重试。"
        );

        if (workoutError) {
          setStatus("error");
          setMessage(workoutError.message);
          return;
        }

        const completedWorkouts = (workoutData ?? []) as WorkoutRow[];
        setWorkouts(completedWorkouts);

        const workoutIds = completedWorkouts.map((workout) => workout.id);
        if (workoutIds.length === 0) {
          setWorkoutExercises([]);
          setSetLogs([]);
          setRecommendations([]);
          setStatus("ready");
          return;
        }

        const { data: exerciseData, error: exerciseError } = await withTimeout(
          supabase
            .from("workout_exercises")
            .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug)")
            .in("workout_id", workoutIds)
            .order("order_index", { ascending: true }),
          "历史动作读取超时，请刷新页面后重试。"
        );

        if (exerciseError) {
          setStatus("error");
          setMessage(exerciseError.message);
          return;
        }

        const exerciseRows = (exerciseData ?? []) as unknown as WorkoutExerciseRow[];
        setWorkoutExercises(exerciseRows);

        const workoutExerciseIds = exerciseRows.map((exercise) => exercise.id);
        if (workoutExerciseIds.length > 0) {
          const { data: logsData, error: logsError } = await withTimeout(
            supabase
              .from("set_logs")
              .select("id,workout_exercise_id,set_index,target_weight,target_reps,actual_weight,actual_reps,rpe,completed")
              .in("workout_exercise_id", workoutExerciseIds)
              .order("set_index", { ascending: true }),
            "历史组记录读取超时，请刷新页面后重试。"
          );

          if (logsError) {
            setStatus("error");
            setMessage(logsError.message);
            return;
          }

          setSetLogs((logsData ?? []) as SetLogRow[]);
        }

        const { data: recommendationData, error: recommendationError } = await withTimeout(
          supabase
            .from("recommendations")
            .select("id,workout_id,recommendation_type,previous_weight,suggested_weight,reason,status,exercises(name,slug)")
            .eq("user_id", user.id)
            .in("workout_id", workoutIds)
            .order("created_at", { ascending: false }),
          "Coach 建议读取超时，请刷新页面后重试。"
        );

        if (recommendationError) {
          setStatus("error");
          setMessage(recommendationError.message);
          return;
        }

        setRecommendations((recommendationData ?? []) as unknown as RecommendationRow[]);
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "训练历史读取失败，请刷新页面后重试。");
      }
    }

    loadHistory();
  }, []);

  const exercisesByWorkoutId = useMemo(() => {
    return workoutExercises.reduce<Record<string, WorkoutExerciseRow[]>>((groups, exercise) => {
      groups[exercise.workout_id] = [...(groups[exercise.workout_id] ?? []), exercise].sort(
        (a, b) => a.order_index - b.order_index
      );
      return groups;
    }, {});
  }, [workoutExercises]);

  const setLogsByExerciseId = useMemo(() => {
    return setLogs.reduce<Record<string, SetLogRow[]>>((groups, log) => {
      groups[log.workout_exercise_id] = [...(groups[log.workout_exercise_id] ?? []), log].sort(
        (a, b) => a.set_index - b.set_index
      );
      return groups;
    }, {});
  }, [setLogs]);

  const recommendationsByWorkoutId = useMemo(() => {
    return recommendations.reduce<Record<string, RecommendationRow[]>>((groups, recommendation) => {
      if (!recommendation.workout_id) return groups;
      groups[recommendation.workout_id] = [...(groups[recommendation.workout_id] ?? []), recommendation];
      return groups;
    }, {});
  }, [recommendations]);

  function updateHistorySetLog(logId: string, patch: Partial<SetLogRow>) {
    setSaveStatus("idle");
    setSetLogs((currentLogs) =>
      currentLogs.map((log) => (log.id === logId ? { ...log, ...patch } : log))
    );
  }

  async function saveWorkoutEdits(workoutId: string) {
    const workoutExerciseIds = (exercisesByWorkoutId[workoutId] ?? []).map((exercise) => exercise.id);
    const logsToSave = setLogs.filter((log) => workoutExerciseIds.includes(log.workout_exercise_id));

    if (logsToSave.length === 0) return;

    setSaveStatus("saving");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("set_logs")
      .upsert(
        logsToSave.map((log) => ({
          workout_exercise_id: log.workout_exercise_id,
          set_index: log.set_index,
          target_weight: log.target_weight,
          target_reps: log.target_reps,
          actual_weight: log.actual_weight,
          actual_reps: log.actual_reps,
          rpe: log.rpe,
          completed: log.completed,
          updated_at: new Date().toISOString()
        })),
        { onConflict: "workout_exercise_id,set_index" }
      );

    if (error) {
      setSaveStatus("error");
      setMessage(error.message);
      return;
    }

    setSaveStatus("saved");
    setMessage("历史训练已保存。进展页会按新的记录重新计算。");
  }

  const summary = useMemo(() => {
    const completedLogs = setLogs.filter((log) => log.completed);
    const volume = completedLogs.reduce(
      (sum, log) => sum + Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0),
      0
    );
    const rpeValues = completedLogs
      .map((log) => log.rpe)
      .filter((rpe): rpe is number => typeof rpe === "number");
    const averageRpe = rpeValues.length > 0 ? rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length : null;

    return {
      averageRpe,
      completedSets: completedLogs.length,
      volume,
      workouts: workouts.length
    };
  }, [setLogs, workouts.length]);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取训练历史
      </div>
    );
  }

  if (status === "error") {
    return <p className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600">{message}</p>;
  }

  if (workouts.length === 0) {
    return (
      <section className="rounded-xl border border-line p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
            <CalendarDays size={20} />
          </span>
          <div>
            <h2 className="font-semibold">还没有完成训练</h2>
            <p className="text-sm text-muted">完成一次今日训练后，这里会显示每组记录和 Coach 调整。</p>
          </div>
        </div>
        <Link className="inline-flex rounded-lg bg-action px-4 py-2 font-semibold text-white" href="/today">
          去训练
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="已完成" value={`${summary.workouts} 次`} />
        <Metric label="总训练量" value={`${Math.round(summary.volume).toLocaleString()} kg`} />
        <Metric label="平均 RPE" value={summary.averageRpe === null ? "-" : summary.averageRpe.toFixed(1)} />
      </section>

      <section className="space-y-3">
        {message ? (
          <p className={`rounded-lg border px-3 py-2 text-sm ${saveStatus === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
            {message}
          </p>
        ) : null}

        {workouts.map((workout) => {
          const exercises = exercisesByWorkoutId[workout.id] ?? [];
          const workoutRecommendations = recommendationsByWorkoutId[workout.id] ?? [];
          const workoutLogs = exercises.flatMap((exercise) => setLogsByExerciseId[exercise.id] ?? []);
          const completedSets = workoutLogs.filter((log) => log.completed);
          const volume = completedSets.reduce(
            (sum, log) => sum + Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0),
            0
          );

          return (
            <article className="rounded-xl border border-line bg-white p-4" key={workout.id}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">{workout.scheduled_date}</p>
                  <h2 className="font-semibold">{workout.name}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {completedSets.length} 组 · {Math.round(volume).toLocaleString()} kg
                  </p>
                </div>
                <span className="rounded-full bg-action/10 px-3 py-1 text-xs font-semibold text-action">已完成</span>
              </div>

              <div className="space-y-3">
                {exercises.map((exercise) => {
                  const logs = setLogsByExerciseId[exercise.id] ?? [];
                  const bestSet = getBestSet(logs);

                  return (
                    <div className="rounded-lg bg-field px-3 py-2 text-sm" key={exercise.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{exercise.exercises?.name ?? "动作"}</span>
                        <span className="text-action">
                          {logs.filter((log) => log.completed).length}/{logs.length} 组
                        </span>
                      </div>
                      <p className="mt-1 text-muted">
                        计划 {exercise.target_sets}x{exercise.target_reps}
                        {Number(exercise.target_weight) > 0 ? ` @ ${Number(exercise.target_weight)}kg` : ""}
                      </p>
                      {bestSet ? (
                        <p className="mt-1 text-muted">
                          最佳组：{bestSet.actual_weight ?? 0}kg x {bestSet.actual_reps ?? 0}
                          {bestSet.rpe ? ` · RPE ${bestSet.rpe}` : ""}
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {logs.map((log) => (
                          <div
                            className="grid grid-cols-[2rem_1fr_1fr_1fr_2.25rem] items-center gap-2 rounded-lg bg-white px-2 py-2"
                            key={log.id}
                          >
                            <span className="font-semibold">{log.set_index}</span>
                            <NumberInput
                              label="重量"
                              min={0}
                              step={0.5}
                              value={log.actual_weight}
                              onChange={(value) => updateHistorySetLog(log.id, { actual_weight: value })}
                            />
                            <NumberInput
                              label="次数"
                              min={0}
                              step={1}
                              value={log.actual_reps}
                              onChange={(value) => updateHistorySetLog(log.id, { actual_reps: value })}
                            />
                            <NumberInput
                              label="RPE"
                              max={10}
                              min={1}
                              step={0.5}
                              value={log.rpe}
                              onChange={(value) => updateHistorySetLog(log.id, { rpe: value })}
                            />
                            <label className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white">
                              <input
                                aria-label={`第 ${log.set_index} 组完成`}
                                checked={log.completed}
                                className="h-4 w-4 accent-action"
                                onChange={(event) => updateHistorySetLog(log.id, { completed: event.target.checked })}
                                type="checkbox"
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-action bg-white px-4 text-sm font-semibold text-action disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saveStatus === "saving"}
                onClick={() => saveWorkoutEdits(workout.id)}
                type="button"
              >
                {saveStatus === "saving" ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                保存本次修改
              </button>

              {workoutRecommendations.length > 0 ? (
                <div className="mt-4 rounded-lg border border-line p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Brain size={16} className="text-action" />
                    <h3 className="font-semibold">Coach 调整</h3>
                  </div>
                  <div className="space-y-2">
                    {workoutRecommendations.map((recommendation) => (
                      <div className="text-sm" key={recommendation.id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold">{recommendation.exercises?.name ?? "动作"}</span>
                          <span className="rounded-full bg-field px-2 py-1 text-xs text-muted">
                            {formatRecommendationStatus(recommendation.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-muted">
                          {recommendation.previous_weight}kg → {recommendation.suggested_weight}kg ·{" "}
                          {formatRecommendationType(recommendation.recommendation_type)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-field p-4">
      <div className="mb-2 flex items-center gap-2 text-muted">
        <TrendingUp size={16} />
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function NumberInput({
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  label: string;
  max?: number;
  min: number;
  onChange: (value: number | null) => void;
  step: number;
  value: number | null;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-line bg-white px-2 text-sm outline-none focus:border-action"
        inputMode="decimal"
        max={max}
        min={min}
        onChange={(event) => {
          const nextValue = event.target.value === "" ? null : Number(event.target.value);
          onChange(Number.isNaN(nextValue) ? null : nextValue);
        }}
        step={step}
        type="number"
        value={value ?? ""}
      />
    </label>
  );
}

function getBestSet(logs: SetLogRow[]) {
  return logs
    .filter((log) => log.completed)
    .sort((a, b) => Number(b.actual_weight ?? 0) * Number(b.actual_reps ?? 0) - Number(a.actual_weight ?? 0) * Number(a.actual_reps ?? 0))[0];
}

function formatRecommendationType(type: RecommendationType) {
  if (type === "increase") return "加重";
  if (type === "decrease") return "降重";
  if (type === "deload") return "减量恢复";
  return "保持";
}

function formatRecommendationStatus(status: string) {
  if (status === "accepted") return "已应用";
  if (status === "rejected") return "已忽略";
  if (status === "modified") return "已修改";
  return "待处理";
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 10000) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
