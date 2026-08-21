"use client";

import { DB_TABLE } from "../../lib/supabase/table-names";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Brain, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Moon, Save, TrendingUp } from "lucide-react";
import { buildHistoryCalendarDays, selectHistoryDetailWorkouts, type CalendarDay, type CalendarWorkout } from "@/domain/history-calendar";
import { getScheduleItemPresentation } from "@/domain/rest-day-presentation";
import { filterTrainingMetricWorkouts } from "@/domain/training-metric-workouts";
import { requiresRpeForWorkoutExercise, resolveCompletedSetValues, resolveSetLoadType, validateRecordedSet } from "@/domain/workout-recording";
import { clearTrainingDataCaches } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { loadWorkoutsWithDayTypeFallback } from "@/lib/workout-day-type-compat";
import { resolveWorkoutExerciseName } from "@/lib/workout-exercise-presentation";
import { getRecommendationStatusLabel, type RecommendationType } from "@/domain/fitness-coach";
import { getHistoryWorkoutFocusId } from "./history-workout-focus";

type WorkoutRow = {
  day_type: "training" | "rest";
  id: string;
  scheduled_date: string;
  name: string;
  completed_at: string | null;
  status: "scheduled" | "draft" | "completed" | "skipped";
};

type WorkoutExerciseRow = {
  id: string;
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

type WorkoutReview = {
  averageRpe: number | null;
  completedSets: number;
  completionRate: number;
  headline: string;
  plannedSets: number;
  tone: "good" | "neutral" | "warning";
  volume: number;
};

export function TrainingHistory() {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseRow[]>([]);
  const [setLogs, setSetLogs] = useState<SetLogRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => normalizeHistoryMonth(new Date()));
  const [loadedMonth, setLoadedMonth] = useState(() => normalizeHistoryMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isMonthLoading, setIsMonthLoading] = useState(false);
  const [monthLoadError, setMonthLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const focusedWorkoutRef = useRef<HTMLElement | null>(null);
  const hasLoadedMonthRef = useRef(false);

  useEffect(() => {
    setHistorySearch(window.location.search);
  }, []);

  const requestedWorkoutId = new URLSearchParams(historySearch).get("workout")?.trim() ?? "";

  useEffect(() => {
    if (!requestedWorkoutId) return;
    let cancelled = false;

    async function loadFocusedWorkoutMonth() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const user = sessionData.session?.user;
        if (sessionError || !user) return;
        const { data, error } = await supabase
          .from(DB_TABLE.workouts)
          .select("id,scheduled_date")
          .eq("user_id", user.id)
          .eq("id", requestedWorkoutId)
          .maybeSingle();
        if (cancelled || error || !data?.scheduled_date) return;
        setVisibleMonth(normalizeHistoryMonth(new Date(`${data.scheduled_date}T00:00:00`)));
      } catch {
        // Invalid or inaccessible workout links must leave the current month unchanged.
      }
    }

    void loadFocusedWorkoutMonth();
    return () => {
      cancelled = true;
    };
  }, [requestedWorkoutId]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      const { monthStart, nextMonthStart } = getHistoryMonthBounds(visibleMonth);
      const keepLoadedContent = hasLoadedMonthRef.current;
      const handleMonthLoadError = (errorMessage: string) => {
        setMonthLoadError(true);
        setMessage(errorMessage);
        setIsMonthLoading(false);
        setStatus(keepLoadedContent ? "ready" : "error");
      };

      if (!keepLoadedContent) {
        setStatus("loading");
      } else {
        setIsMonthLoading(true);
      }
      setMessage("");
      setMonthLoadError(false);

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
            () => supabase.from(DB_TABLE.workouts).select("id,scheduled_date,name,completed_at,day_type,status").eq("user_id", user.id).gte("scheduled_date", monthStart).lt("scheduled_date", nextMonthStart).order("scheduled_date", { ascending: true }),
            () => supabase.from(DB_TABLE.workouts).select("id,scheduled_date,name,completed_at,status").eq("user_id", user.id).gte("scheduled_date", monthStart).lt("scheduled_date", nextMonthStart).order("scheduled_date", { ascending: true })
          ),
          "训练历史读取超时，请刷新页面后重试。"
        );

        if (workoutError) {
          handleMonthLoadError(workoutError.message);
          return;
        }

        const monthWorkouts = (workoutData ?? []) as WorkoutRow[];
        if (cancelled) return;
        setWorkouts(monthWorkouts);

        const workoutIds = monthWorkouts.map((workout) => workout.id);
        if (workoutIds.length === 0) {
          setWorkoutExercises([]);
          setSetLogs([]);
          setRecommendations([]);
          setLoadedMonth(visibleMonth);
          setSelectedDate(null);
          hasLoadedMonthRef.current = true;
          setStatus("ready");
          setIsMonthLoading(false);
          return;
        }

        const [exerciseResult, recommendationResult] = await Promise.all([
          withTimeout(
            supabase
              .from(DB_TABLE.workoutExercises)
              .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercise_name_snapshot,exercise_metadata_snapshot,exercise_provider,external_exercise_id,exercises(name,slug,training_direction)")
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
          handleMonthLoadError(exerciseError.message);
          return;
        }

        const exerciseRows = (exerciseData ?? []) as unknown as WorkoutExerciseRow[];
        if (cancelled) return;
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
            handleMonthLoadError(logsError.message);
            return;
          }

          logRows = (logsData ?? []) as SetLogRow[];
          if (cancelled) return;
        }
        setSetLogs(logRows);

        const { data: recommendationData, error: recommendationError } = recommendationResult;

        if (recommendationError) {
          handleMonthLoadError(recommendationError.message);
          return;
        }

        if (cancelled) return;
        setRecommendations((recommendationData ?? []) as unknown as RecommendationRow[]);
        setLoadedMonth(visibleMonth);
        hasLoadedMonthRef.current = true;
        setStatus("ready");
        setIsMonthLoading(false);
      } catch (error) {
        if (cancelled) return;
        handleMonthLoadError(error instanceof Error ? error.message : "训练历史读取失败，请刷新页面后重试。");
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, visibleMonth]);

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

  useEffect(() => {
    const focusedWorkout = workouts.find((workout) => workout.id === focusedWorkoutId);
    if (focusedWorkout) setSelectedDate(focusedWorkout.scheduled_date);
  }, [focusedWorkoutId, workouts]);

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

  function updateHistorySetLog(logId: string, patch: Partial<SetLogRow>) {
    setSaveStatus("idle");
    setSetLogs((currentLogs) =>
      currentLogs.map((log) => (log.id === logId ? { ...log, ...patch } : log))
    );
  }

  function updateHistorySetCompletion(log: SetLogRow, completed: boolean) {
    const exercise = workoutExercises.find((item) => item.id === log.workout_exercise_id);
    if (completed && requiresRealRpe(exercise) && !isValidRpe(log.rpe)) {
      setSaveStatus("error");
      setMessage(`${getExerciseName(exercise)} 第 ${log.set_index} 组：请先填写真实 RPE（1–10）后再完成该组。`);
      return;
    }

    updateHistorySetLog(log.id, { completed });
  }

  async function saveWorkoutEdits(workoutId: string) {
    const workoutExerciseIds = (exercisesByWorkoutId[workoutId] ?? []).map((exercise) => exercise.id);
    const logsToSave = setLogs.filter((log) => workoutExerciseIds.includes(log.workout_exercise_id));

    if (logsToSave.length === 0) return;

    const exerciseById = new Map(workoutExercises.map((exercise) => [exercise.id, exercise]));
    const normalizedLogs = logsToSave.map((log) => {
      const values = resolveCompletedSetValues({
        actualReps: log.actual_reps,
        actualWeight: log.actual_weight,
        completed: log.completed,
        targetReps: log.target_reps,
        targetWeight: log.target_weight
      });
      return { ...log, actual_reps: values.actualReps, actual_weight: values.actualWeight };
    });
    const invalidLog = normalizedLogs.find((log) => {
      const exercise = exerciseById.get(log.workout_exercise_id);
      return Object.keys(validateRecordedSet({
        completed: log.completed,
        reps: log.actual_reps === null ? "" : String(log.actual_reps),
        rpe: log.rpe === null ? "" : String(log.rpe),
        weight: log.actual_weight === null ? "" : String(log.actual_weight)
      }, getHistoryLoadType(exercise), { requiresRpe: requiresRealRpe(exercise) })).length > 0;
    });

    if (invalidLog) {
      const exercise = exerciseById.get(invalidLog.workout_exercise_id);
      const errors = validateRecordedSet({
        completed: invalidLog.completed,
        reps: invalidLog.actual_reps === null ? "" : String(invalidLog.actual_reps),
        rpe: invalidLog.rpe === null ? "" : String(invalidLog.rpe),
        weight: invalidLog.actual_weight === null ? "" : String(invalidLog.actual_weight)
      }, getHistoryLoadType(exercise), { requiresRpe: requiresRealRpe(exercise) });
      setSaveStatus("error");
      setMessage(`${getExerciseName(exercise)} 第 ${invalidLog.set_index} 组：${Object.values(errors).join(" ")}`);
      return;
    }

    setSaveStatus("saving");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc("revise_completed_workout_logs", {
      p_logs: normalizedLogs.map((log) => ({
          workout_exercise_id: log.workout_exercise_id,
          set_index: log.set_index,
          actual_weight: log.actual_weight,
          actual_reps: log.actual_reps,
          rpe: log.rpe,
          completed: log.completed
        })),
      p_workout_id: workoutId
    });

    if (error) {
      setSaveStatus("error");
      setMessage(error.message);
      return;
    }

    clearTrainingDataCaches();
    const normalizedById = new Map(normalizedLogs.map((log) => [log.id, log]));
    setSetLogs((current) => current.map((log) => normalizedById.get(log.id) ?? log));
    setSaveStatus("saved");
    setMessage("历史训练已保存，Coach 建议已按新记录重新计算。进展页会按新的记录重新计算。");
  }

  const summary = useMemo(() => {
    const trainingWorkoutIds = new Set(
      filterTrainingMetricWorkouts(workouts.map((workout) => ({ ...workout, dayType: workout.day_type })))
        .filter((workout) => workout.status === "completed")
        .map((workout) => workout.id)
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
  }, [setLogs, workoutExercises, workouts]);

  const calendarDays = useMemo(() => {
    const calendarWorkouts: CalendarWorkout[] = workouts.map((workout) => {
      const exercises = exercisesByWorkoutId[workout.id] ?? [];
      const logs = exercises.flatMap((exercise) => setLogsByExerciseId[exercise.id] ?? []);
      const review = buildWorkoutReview(logs);

      return {
        completedVolume: workout.status === "completed" && workout.day_type === "training" ? review.volume : 0,
        dayType: workout.day_type,
        id: workout.id,
        scheduledDate: workout.scheduled_date,
        status: workout.status
      };
    });
    return buildHistoryCalendarDays(loadedMonth, calendarWorkouts);
  }, [exercisesByWorkoutId, loadedMonth, setLogsByExerciseId, workouts]);

  const selectedDay = useMemo(
    () => (selectedDate ? calendarDays.find((day) => day.date === selectedDate) ?? null : null),
    [calendarDays, selectedDate]
  );
  const detailWorkouts = useMemo(
    () => selectHistoryDetailWorkouts(selectedDate, calendarDays, workouts),
    [calendarDays, selectedDate, workouts]
  );
  const workoutById = useMemo(() => new Map(workouts.map((workout) => [workout.id, workout])), [workouts]);
  const currentMonth = normalizeHistoryMonth(new Date());
  const canMoveToNextMonth = loadedMonth.getTime() < currentMonth.getTime();

  function moveVisibleMonth(offset: number) {
    const nextMonth = new Date(loadedMonth.getFullYear(), loadedMonth.getMonth() + offset, 1);
    if (nextMonth.getTime() > currentMonth.getTime()) return;
    setSelectedDate(null);
    if (nextMonth.getTime() === visibleMonth.getTime()) {
      setLoadAttempt((attempt) => attempt + 1);
    } else {
      setVisibleMonth(nextMonth);
    }
  }

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

  return (
    <div className="space-y-4">
      <section aria-label="按月查看训练历史" className="rounded-lg border border-line bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            aria-label="上个月"
            className="pressable grid h-11 w-11 place-items-center rounded-md border border-line text-ink disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isMonthLoading}
            onClick={() => moveVisibleMonth(-1)}
            type="button"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-sm text-muted">训练历史</p>
            <h2 className="font-semibold">{loadedMonth.getFullYear()} 年 {loadedMonth.getMonth() + 1} 月</h2>
          </div>
          <button
            aria-label="下个月"
            className="pressable grid h-11 w-11 place-items-center rounded-md border border-line text-ink disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isMonthLoading || !canMoveToNextMonth}
            onClick={() => moveVisibleMonth(1)}
            type="button"
          >
            {isMonthLoading ? <Loader2 className="animate-spin" size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">
          {["一", "二", "三", "四", "五", "六", "日"].map((label) => <span key={label}>{label}</span>)}
        </div>
        <div aria-label={`${loadedMonth.getFullYear()} 年 ${loadedMonth.getMonth() + 1} 月训练日历`} className="mt-1 grid grid-cols-7 gap-1" role="grid">
          {calendarDays.map((day) => (
            <CalendarDateCell day={day} key={day.date} onSelect={() => setSelectedDate(day.date)} selected={selectedDate === day.date} workoutById={workoutById} />
          ))}
        </div>
      </section>

      {monthLoadError ? (
        <section className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          <p>{message}</p>
          <button className="pressable mt-2 h-11 rounded-md border border-red-200 bg-white px-3 font-semibold text-ink" onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">重新加载本月</button>
        </section>
      ) : null}

      {!selectedDate ? (
        <section className="rounded-lg border border-line bg-field p-4 text-sm text-muted">
          请选择一个有训练安排或记录的日期，查看当天计划或已完成训练。
        </section>
      ) : null}

      {selectedDay && selectedDay.workouts.length > 0 ? (
        <section className="rounded-lg border border-line bg-white p-4">
          <h2 className="font-semibold">{selectedDay.date} 训练摘要</h2>
          <div className="mt-3 space-y-2">
            {selectedDay.workouts.map((calendarWorkout) => {
              const workout = workoutById.get(calendarWorkout.id);
              if (!workout) return null;
              const exercises = exercisesByWorkoutId[workout.id] ?? [];
              const workoutLogs = exercises.flatMap((exercise) => setLogsByExerciseId[exercise.id] ?? []);
              const review = buildWorkoutReview(workoutLogs);
              return (
                <div className="rounded-lg border border-line bg-field px-3 py-3" key={workout.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{workout.name}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {workout.status === "completed"
                          ? `${review.completedSets} 组 · ${Math.round(review.volume).toLocaleString()} kg`
                          : workout.day_type === "rest" ? "恢复安排" : "计划训练"}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-muted">
                      {workout.status === "completed" ? "已完成" : workout.status === "skipped" ? "已跳过" : "已计划"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedDate ? <>
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

        {detailWorkouts.map((workout) => {
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
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${isRecovery ? "bg-[#4a7a9a]/10 text-[#4a7a9a]" : "bg-action/10 text-action"}`}>
                    {isRecovery ? <Moon size={20} /> : <CheckCircle2 size={20} />}
                  </span>
                  <div>
                    <p className="text-sm text-muted">{workout.scheduled_date}</p>
                    <h2 className="font-semibold">{workout.name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {review.completedSets} 组 · {Math.round(review.volume).toLocaleString()} kg
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${isRecovery ? "bg-[#4a7a9a]/10 text-[#4a7a9a]" : "bg-action/10 text-action"}`}>
                  {isRecovery ? "已休息" : "已完成"}
                </span>
              </div>

              <div className={`mb-4 rounded-lg border px-3 py-3 ${getWorkoutReviewClassName(review.tone)}`}>
                <div className="grid gap-2 text-sm sm:grid-cols-4">
                  <ReviewMetric label="完成率" value={`${Math.round(review.completionRate * 100)}%`} />
                  <ReviewMetric label="完成组数" value={`${review.completedSets}/${review.plannedSets}`} />
                  <ReviewMetric label="平均 RPE" value={review.averageRpe === null ? "-" : review.averageRpe.toFixed(1)} />
                  <ReviewMetric label="训练量" value={`${Math.round(review.volume).toLocaleString()}kg`} />
                </div>
                <p className="mt-3 text-sm leading-6">{review.headline}</p>
              </div>

              <div className="space-y-3">
                {exercises.map((exercise) => {
                  const logs = setLogsByExerciseId[exercise.id] ?? [];
                  const bestSet = getBestSet(logs);

                  return (
                    <div className="rounded-lg bg-field px-3 py-2 text-sm" key={exercise.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{resolveWorkoutExerciseName(exercise)}</span>
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
                                onChange={(event) => updateHistorySetCompletion(log, event.target.checked)}
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
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-action bg-white px-4 text-sm font-semibold text-action transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
                            {getRecommendationStatusLabel(recommendation.status)}
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
      </> : null}
    </div>
  );
}

function CalendarDateCell({
  day,
  onSelect,
  selected,
  workoutById
}: {
  day: CalendarDay;
  onSelect: () => void;
  selected: boolean;
  workoutById: Map<string, WorkoutRow>;
}) {
  const workouts = day.workouts
    .map((workout) => workoutById.get(workout.id))
    .filter((workout): workout is WorkoutRow => Boolean(workout));
  const hasRecords = workouts.length > 0;
  const completedTraining = workouts.filter((workout) => workout.status === "completed" && workout.day_type === "training");
  const plannedTraining = workouts.find((workout) => workout.status !== "completed" && workout.day_type === "training");
  const hasRest = workouts.some((workout) => workout.day_type === "rest");
  const dayNumber = Number(day.date.slice(-2));
  const labels = completedTraining.length > 1
    ? [`${completedTraining.length} 次完成`, `${Math.round(day.completedVolume).toLocaleString()} kg`]
    : completedTraining.length === 1
      ? [completedTraining[0].name, `${Math.round(day.completedVolume).toLocaleString()} kg`]
      : hasRest
        ? ["恢复"]
        : plannedTraining
          ? [plannedTraining.name]
          : [];
  const statusClassName = day.status === "completed"
    ? "border-action/35 bg-action/5 text-ink"
    : day.status === "rest"
      ? "border-slate-300 bg-slate-50 text-slate-700"
      : day.status === "planned"
        ? "border-line bg-field text-muted"
        : "border-transparent text-muted";
  const description = labels.length > 0 ? labels.join("，") : "无训练记录";

  return (
    <button
      aria-label={`${day.date}，${description}`}
      className={`min-h-16 rounded-md border p-1 text-left text-[10px] leading-4 ${statusClassName} ${selected ? "ring-2 ring-action/45" : ""} ${!day.inMonth ? "opacity-35" : ""} disabled:cursor-default`}
      disabled={!day.inMonth || !hasRecords}
      onClick={onSelect}
      type="button"
    >
      <span className="block font-semibold">{dayNumber}</span>
      {labels.slice(0, 2).map((label) => <span className="block truncate" key={label}>{label}</span>)}
    </button>
  );
}

export function normalizeHistoryMonth(date: Date, currentDate = new Date()) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), 1);
  const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  return normalized.getTime() > currentMonth.getTime() ? currentMonth : normalized;
}

export function getHistoryMonthBounds(month: Date) {
  const normalized = normalizeHistoryMonth(month);
  const nextMonth = new Date(normalized.getFullYear(), normalized.getMonth() + 1, 1);
  return { monthStart: formatDate(normalized), nextMonthStart: formatDate(nextMonth) };
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
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

function getWorkoutReviewClassName(tone: WorkoutReview["tone"]) {
  if (tone === "good") return "border-action/20 bg-action/5 text-ink";
  if (tone === "warning") return "border-amber/30 bg-amber/10 text-amber-900";
  return "border-line bg-field text-ink";
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

function requiresRealRpe(exercise: WorkoutExerciseRow | undefined) {
  return requiresRpeForWorkoutExercise({
    movementPattern: exercise?.exercise_metadata_snapshot?.movementPattern,
    provider: exercise?.exercise_provider,
    referenceId: exercise?.external_exercise_id,
    slug: exercise?.exercises?.slug,
    trainingDirection: exercise?.exercises?.training_direction
  });
}

function isValidRpe(rpe: number | null) {
  return typeof rpe === "number" && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10;
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
