"use client";

import { DB_TABLE } from "../../lib/supabase/table-names";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2, Moon, TrendingUp } from "lucide-react";
import { getScheduleItemPresentation } from "@/domain/rest-day-presentation";
import { filterTrainingMetricWorkouts } from "@/domain/training-metric-workouts";
import { filterHistoryWorkoutsByDate } from "@/domain/history-date-filter";
import { requiresRpeForWorkoutExercise, resolveCompletedSetValues, resolveSetLoadType, validateRecordedSet } from "@/domain/workout-recording";
import { clearTrainingDataCaches, readClientCache, writeClientCache } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { loadWorkoutsWithDayTypeFallback } from "@/lib/workout-day-type-compat";
import { resolveWorkoutExerciseName } from "@/lib/workout-exercise-presentation";
import { getRecommendationStatusLabel, type RecommendationType } from "@/domain/fitness-coach";
import { type HistoryCalendarEntry } from "@/domain/history-calendar";
import { getHistoryWorkoutFocusId } from "./history-workout-focus";
import { HistoryCalendar } from "./history-calendar";
import {
  HistoryWorkoutCard,
  type SaveHistoryWorkoutInput,
  type SaveHistoryWorkoutResult
} from "./history-workout-card";

type WorkoutRow = {
  day_type: "training" | "rest";
  id: string;
  scheduled_date: string;
  name: string;
  completed_at: string | null;
  duration_seconds: number | null;
  status: string;
};

export type WorkoutExerciseRow = {
  id: string;
  exercise_id?: string | null;
  workout_id: string;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  exercise_provider?: string | null;
  external_exercise_id?: string | null;
  exercise_name_snapshot?: string | null;
  exercise_metadata_snapshot?: { loadType?: string; movementPattern?: string } | null;
  exercises: {
    name: string;
    slug: string;
    training_direction: string | null;
  } | null;
};

export type SetLogRow = {
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

type HistoryCache = {
  recommendations: RecommendationRow[];
  setLogs: SetLogRow[];
  workoutExercises: WorkoutExerciseRow[];
  workouts: WorkoutRow[];
};

type WorkoutReview = {
  averageRpe: number | null;
  completedSets: number;
  completionRate: number;
  headline: string;
  plannedSets: number;
  tone: "good" | "neutral" | "warning";
  volume: number;
};

const historyCacheKey = "strength-training-cache:history";

export function TrainingHistory() {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseRow[]>([]);
  const [setLogs, setSetLogs] = useState<SetLogRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(getCalendarMonth);
  const focusedWorkoutRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setHistorySearch(window.location.search);
  }, []);

  useEffect(() => {
    async function loadHistory() {
      if (!readClientCache<HistoryCache>(historyCacheKey)) {
        setStatus("loading");
      }
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
          loadWorkoutsWithDayTypeFallback(
            () => supabase.from(DB_TABLE.workouts).select("id,scheduled_date,name,completed_at,duration_seconds,day_type,status").eq("user_id", user.id).in("status", ["completed", "scheduled"]).order("scheduled_date", { ascending: false }),
            () => supabase.from(DB_TABLE.workouts).select("id,scheduled_date,name,completed_at,duration_seconds,status").eq("user_id", user.id).in("status", ["completed", "scheduled"]).order("scheduled_date", { ascending: false })
          ),
          "训练历史读取超时，请刷新页面后重试。"
        );

        if (workoutError) {
          setStatus("error");
          setMessage(workoutError.message);
          return;
        }

        const loadedWorkouts = ((workoutData ?? []) as WorkoutRow[]).map((workout) => ({
          ...workout,
          day_type: workout.day_type ?? "training"
        }));
        setWorkouts(loadedWorkouts);

        const completedWorkouts = loadedWorkouts.filter((workout) => workout.status === "completed");
        const workoutIds = completedWorkouts.map((workout) => workout.id);
        if (workoutIds.length === 0) {
          setWorkoutExercises([]);
          setSetLogs([]);
          setRecommendations([]);
          writeClientCache<HistoryCache>(historyCacheKey, {
            recommendations: [],
            setLogs: [],
            workoutExercises: [],
            workouts: loadedWorkouts
          });
          setStatus("ready");
          return;
        }

        const [exerciseResult, recommendationResult] = await Promise.all([
          withTimeout(
            supabase
              .from(DB_TABLE.workoutExercises)
              .select("id,workout_id,exercise_id,order_index,target_sets,target_reps,target_weight,exercise_name_snapshot,exercise_metadata_snapshot,exercise_provider,external_exercise_id,exercises(name,slug,training_direction)")
              .in("workout_id", workoutIds)
              .order("order_index", { ascending: true }),
            "历史动作读取超时，请刷新页面后重试。"
          ),
          withTimeout(
            supabase
              .from(DB_TABLE.recommendations)
              .select("id,workout_id,recommendation_type,previous_weight,suggested_weight,reason,status,exercises(name,slug)")
              .eq("user_id", user.id)
              .in("workout_id", workoutIds)
              .order("created_at", { ascending: false }),
            "Coach 建议读取超时，请刷新页面后重试。"
          )
        ]);

        const { data: exerciseData, error: exerciseError } = exerciseResult;

        if (exerciseError) {
          setStatus("error");
          setMessage(exerciseError.message);
          return;
        }

        const exerciseRows = (exerciseData ?? []) as unknown as WorkoutExerciseRow[];
        setWorkoutExercises(exerciseRows);

        const workoutExerciseIds = exerciseRows.map((exercise) => exercise.id);
        let logRows: SetLogRow[] = [];
        if (workoutExerciseIds.length > 0) {
          const { data: logsData, error: logsError } = await withTimeout(
            supabase
              .from(DB_TABLE.setLogs)
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

          logRows = (logsData ?? []) as SetLogRow[];
          setSetLogs(logRows);
        }

        const { data: recommendationData, error: recommendationError } = recommendationResult;

        if (recommendationError) {
          setStatus("error");
          setMessage(recommendationError.message);
          return;
        }

        setRecommendations((recommendationData ?? []) as unknown as RecommendationRow[]);
        writeClientCache<HistoryCache>(historyCacheKey, {
          recommendations: (recommendationData ?? []) as unknown as RecommendationRow[],
          setLogs: logRows,
          workoutExercises: exerciseRows,
          workouts: loadedWorkouts
        });
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "训练历史读取失败，请刷新页面后重试。");
      }
    }

    const cached = readClientCache<HistoryCache>(historyCacheKey);
    if (cached) {
      setWorkouts(cached.workouts.map((workout) => ({ ...workout, day_type: workout.day_type ?? "training", status: workout.status ?? "completed" })));
      setWorkoutExercises(cached.workoutExercises);
      setSetLogs(cached.setLogs);
      setRecommendations(cached.recommendations);
      setStatus("ready");
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

  const focusedWorkoutId = useMemo(() => getHistoryWorkoutFocusId(historySearch, workouts), [historySearch, workouts]);
  const completedWorkouts = useMemo(() => workouts.filter((workout) => workout.status === "completed"), [workouts]);
  const filteredWorkouts = useMemo(
    () => filterHistoryWorkoutsByDate(completedWorkouts, selectedDate),
    [completedWorkouts, selectedDate]
  );

  const calendarEntries = useMemo<HistoryCalendarEntry[]>(() => {
    const workoutIdByExerciseId = new Map(workoutExercises.map((exercise) => [exercise.id, exercise.workout_id]));
    const completedVolumeByWorkoutId = new Map<string, number>();
    setLogs.filter((log) => log.completed).forEach((log) => {
      const workoutId = workoutIdByExerciseId.get(log.workout_exercise_id);
      if (!workoutId) return;
      const volume = Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0);
      completedVolumeByWorkoutId.set(workoutId, (completedVolumeByWorkoutId.get(workoutId) ?? 0) + volume);
    });

    return workouts.map((workout) => ({
      day_type: workout.day_type,
      id: workout.id,
      name: workout.name,
      scheduled_date: workout.scheduled_date,
      status: workout.status,
      volume: completedVolumeByWorkoutId.get(workout.id) ?? 0
    }));
  }, [setLogs, workoutExercises, workouts]);

  useEffect(() => {
    if (!focusedWorkoutId || status !== "ready" || !focusedWorkoutRef.current) return;
    const timer = window.setTimeout(() => {
      focusedWorkoutRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
      focusedWorkoutRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusedWorkoutId, status]);

  async function saveWorkoutEdits(input: SaveHistoryWorkoutInput): Promise<SaveHistoryWorkoutResult> {
    const supabase = createBrowserSupabaseClient();
    let response;
    try {
      response = await supabase.rpc("revise_completed_workout", {
        p_workout_id: input.workoutId,
        p_duration_seconds: input.durationSeconds,
        p_logs: input.logs.map((log) => ({
          workout_exercise_id: log.workout_exercise_id,
          set_index: log.set_index,
          actual_weight: log.actual_weight,
          actual_reps: log.actual_reps,
          rpe: log.rpe,
          completed: log.completed
        }))
      });
    } catch (error) {
      throw new Error(getHistorySaveErrorMessage(error));
    }
    const { data, error } = response;

    if (error) {
      throw new Error(getHistorySaveErrorMessage(error));
    }

    clearTrainingDataCaches();
    const result = data as {
      duration_seconds?: number | null;
      recommendations?: Array<Partial<RecommendationRow> & { exercise_id?: string }>;
      set_logs?: SetLogRow[];
    } | null;
    const returnedLogs = Array.isArray(result?.set_logs) ? result.set_logs : input.logs;
    const durationSeconds = result?.duration_seconds ?? input.durationSeconds;
    setSetLogs((current) => current.map((log) => returnedLogs.find((item) => item.workout_exercise_id === log.workout_exercise_id && item.set_index === log.set_index) ?? log));
    setWorkouts((current) => current.map((workout) => workout.id === input.workoutId
      ? { ...workout, duration_seconds: durationSeconds }
      : workout));
    if (Array.isArray(result?.recommendations)) {
      const exerciseByCatalogId = new Map(workoutExercises.map((exercise) => [exercise.exercise_id, exercise]));
      const returnedRecommendations = result.recommendations.map((recommendation, index) => ({
        id: recommendation.id ?? `${input.workoutId}-pending-${index}`,
        workout_id: input.workoutId,
        recommendation_type: recommendation.recommendation_type ?? "hold",
        previous_weight: Number(recommendation.previous_weight ?? 0),
        suggested_weight: Number(recommendation.suggested_weight ?? recommendation.previous_weight ?? 0),
        reason: recommendation.reason ?? "已按修改后的历史训练重新计算。",
        status: recommendation.status ?? "pending",
        exercises: recommendation.exercises ?? exerciseByCatalogId.get(recommendation.exercise_id)?.exercises ?? null
      }));
      setRecommendations((current) => [
        ...current.filter((item) => item.workout_id !== input.workoutId || item.status !== "pending"),
        ...returnedRecommendations
      ]);
    }
    return { durationSeconds, logs: returnedLogs };
  }

  const summary = useMemo(() => {
    const trainingWorkoutIds = new Set(
      filterTrainingMetricWorkouts(completedWorkouts.map((workout) => ({ ...workout, dayType: workout.day_type }))).map((workout) => workout.id)
    );
    const trainingExerciseIds = new Set(workoutExercises.filter((exercise) => trainingWorkoutIds.has(exercise.workout_id)).map((exercise) => exercise.id));
    const completedLogs = setLogs.filter((log) => log.completed && trainingExerciseIds.has(log.workout_exercise_id));
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
      workouts: trainingWorkoutIds.size
    };
  }, [completedWorkouts, setLogs, workoutExercises]);

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

      <HistoryCalendar
        entries={calendarEntries}
        month={calendarMonth}
        onMonthChange={setCalendarMonth}
        onSelectedDateChange={setSelectedDate}
        selectedDate={selectedDate}
      />

      {selectedDate && filteredWorkouts.length === 0 ? (
        <p className="rounded-lg bg-field px-3 py-3 text-sm text-muted">当天没有完成训练；月历会继续显示待训练或休息安排。</p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">当天训练摘要</h2>
        {message ? (
          <p className="rounded-lg border border-line px-3 py-2 text-sm text-muted">
            {message}
          </p>
        ) : null}

        {filteredWorkouts.map((workout) => {
          const exercises = exercisesByWorkoutId[workout.id] ?? [];
          const workoutRecommendations = recommendationsByWorkoutId[workout.id] ?? [];
          const workoutLogs = exercises.flatMap((exercise) => setLogsByExerciseId[exercise.id] ?? []);
          const review = buildWorkoutReview(workoutLogs);
          const isRecovery = workout.name.includes("恢复") || workout.name.includes("休息") || workout.name.includes("有氧");

          if (workout.day_type === "rest") {
            const presentation = getScheduleItemPresentation({ dayType: workout.day_type, status: "completed" });

            return (
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={workout.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted">{workout.scheduled_date}</p>
                    <h2 className="flex items-center gap-2 font-semibold"><Moon size={16} />{presentation.title}</h2>
                    <p className="mt-2 text-sm text-slate-600">今天以恢复为主，没有动作、组数或 RPE 需要记录。</p>
                  </div>
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">{presentation.statusLabel}</span>
                </div>
              </article>
            );
          }

          return (
            <article
              aria-label={workout.id === focusedWorkoutId ? "当前查看的训练记录" : undefined}
              className={`rounded-xl border p-4 ${isRecovery ? "border-line bg-field/60" : "border-line bg-white"} ${workout.id === focusedWorkoutId ? "ring-2 ring-action/40" : ""}`}
              id={`history-workout-${workout.id}`}
              key={workout.id}
              ref={workout.id === focusedWorkoutId ? focusedWorkoutRef : undefined}
              tabIndex={workout.id === focusedWorkoutId ? -1 : undefined}
            >
              <HistoryWorkoutCard
                durationSeconds={workout.duration_seconds}
                exercises={exercises.map((exercise) => ({
                  id: exercise.id,
                  logs: setLogsByExerciseId[exercise.id] ?? [],
                  name: resolveWorkoutExerciseName(exercise),
                  targetReps: exercise.target_reps,
                  targetSets: exercise.target_sets,
                  targetWeight: Number(exercise.target_weight)
                }))}
                initiallyExpanded={workout.id === focusedWorkoutId}
                isRecovery={isRecovery}
                name={workout.name}
                onSave={saveWorkoutEdits}
                onValidate={(logs) => validateHistoryWorkoutLogs({ exercises, logs })}
                recommendations={workoutRecommendations.map((recommendation) => ({
                  id: recommendation.id,
                  label: `${recommendation.exercises?.name ?? "动作"} · ${formatRecommendationType(recommendation.recommendation_type)}`,
                  previousWeight: recommendation.previous_weight,
                  statusLabel: getRecommendationStatusLabel(recommendation.status),
                  suggestedWeight: recommendation.suggested_weight
                }))}
                review={review}
                scheduledDate={workout.scheduled_date}
                workoutId={workout.id}
              />

            </article>
          );
        })}
      </section>
    </div>
  );
}

export function validateHistoryWorkoutLogs({
  exercises,
  logs
}: {
  exercises: WorkoutExerciseRow[];
  logs: SetLogRow[];
}): { ok: true; logs: SetLogRow[] } | { ok: false; message: string } {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const normalizedLogs = logs.map((log) => {
    const values = resolveCompletedSetValues({
      actualReps: log.actual_reps,
      actualWeight: log.actual_weight,
      completed: log.completed,
      targetReps: log.target_reps,
      targetWeight: log.target_weight
    });
    return { ...log, actual_reps: values.actualReps, actual_weight: values.actualWeight };
  });
  for (const log of normalizedLogs) {
    const exercise = exerciseById.get(log.workout_exercise_id);
    const errors = validateRecordedSet({
      completed: log.completed,
      reps: log.actual_reps === null ? "" : String(log.actual_reps),
      rpe: log.rpe === null ? "" : String(log.rpe),
      weight: log.actual_weight === null ? "" : String(log.actual_weight)
    }, getHistoryLoadType(exercise), { requiresRpe: requiresRealRpe(exercise) });
    if (Object.keys(errors).length > 0) {
      return {
        ok: false,
        message: `${getExerciseName(exercise)} 第 ${log.set_index} 组：${Object.values(errors).join(" ")}`
      };
    }
  }
  return { ok: true, logs: normalizedLogs };
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

function buildWorkoutReview(logs: SetLogRow[]): WorkoutReview {
  const completedLogs = logs.filter((log) => log.completed);
  const rpeValues = completedLogs
    .map((log) => log.rpe)
    .filter((rpe): rpe is number => typeof rpe === "number");
  const averageRpe = rpeValues.length > 0 ? rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length : null;
  const volume = completedLogs.reduce(
    (sum, log) => sum + Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0),
    0
  );
  const completionRate = logs.length > 0 ? completedLogs.length / logs.length : 0;
  const tone = getWorkoutReviewTone(completionRate, averageRpe);

  return {
    averageRpe,
    completedSets: completedLogs.length,
    completionRate,
    headline: getWorkoutReviewHeadline(tone, completionRate, averageRpe),
    plannedSets: logs.length,
    tone,
    volume
  };
}

function getWorkoutReviewTone(completionRate: number, averageRpe: number | null): WorkoutReview["tone"] {
  if (completionRate < 0.8 || (averageRpe !== null && averageRpe >= 9)) return "warning";
  if (completionRate >= 0.95 && averageRpe !== null && averageRpe <= 8.5) return "good";
  return "neutral";
}

function getWorkoutReviewHeadline(
  tone: WorkoutReview["tone"],
  completionRate: number,
  averageRpe: number | null
) {
  if (tone === "good") return "这次执行质量不错：完成度高，主观强度也处在可持续推进区间。";
  if (completionRate < 0.8) return "这次完成度偏低，复盘时优先看是否是时间、恢复或计划难度造成。";
  if (averageRpe !== null && averageRpe >= 9) return "这次平均 RPE 偏高，下次同方向训练可以更关注恢复和动作速度。";
  return "这次训练整体稳定，可以结合 Coach 建议继续微调后续重量。";
}

function requiresRealRpe(exercise: WorkoutExerciseRow | undefined) {
  return requiresRpeForWorkoutExercise({
    movementPattern: exercise?.exercise_metadata_snapshot?.movementPattern,
    provider: exercise?.exercise_provider,
    referenceId: exercise?.external_exercise_id,
    slug: exercise?.exercises?.slug,
    trainingDirection: exercise?.exercises?.training_direction
  });
}

function getHistoryLoadType(exercise: WorkoutExerciseRow | undefined) {
  return resolveSetLoadType({
    snapshotLoadType: exercise?.exercise_metadata_snapshot?.loadType,
    targetWeight: exercise?.target_weight
  });
}

function getExerciseName(exercise: WorkoutExerciseRow | undefined) {
  return exercise?.exercises?.name ?? exercise?.exercise_name_snapshot ?? "动作";
}

export function getHistorySaveErrorMessage(error: unknown) {
  if (error instanceof TypeError && /load failed|failed to fetch/i.test(error.message)) {
    return "网络连接失败，请检查网络后重试。修改草稿仍会保留。";
  }
  return "历史训练保存失败，请重试。修改草稿仍会保留。";
}

function formatRecommendationType(type: RecommendationType) {
  if (type === "increase") return "加重";
  if (type === "decrease") return "降重";
  if (type === "deload") return "减量恢复";
  return "保持";
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 10000) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function getCalendarMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
