"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Brain,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Loader2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Timer
} from "lucide-react";
import {
  buildExerciseCoachRecommendation,
  getInterruptionAdvice,
  getWorkoutCoachCue,
  type ExerciseCoachRecommendation
} from "@/domain/fitness-coach";
import { trackEvent } from "@/lib/analytics";
import { clearTrainingDataCaches, readClientCache, writeClientCache } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatPrescription, getExerciseNote, getWorkoutMeta } from "@/domain/training-format";

type WorkoutRow = {
  id: string;
  scheduled_date: string;
  name: string;
  status: string;
};

type WorkoutExerciseRow = {
  id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps: number;
  target_weight: number;
  exercises: {
    default_increment: number;
    name: string;
    slug: string;
  } | null;
};

type LastCompletedWorkoutRow = {
  scheduled_date: string;
  name: string;
};

type SetLogRow = {
  id?: string;
  workout_exercise_id: string;
  set_index: number;
  target_weight: number;
  target_reps: number;
  actual_weight: number | null;
  actual_reps: number | null;
  rpe: number | null;
  completed: boolean;
};

type TodayCache = {
  coachRecommendations: Array<ExerciseCoachRecommendation & { exerciseName: string }>;
  exercises: WorkoutExerciseRow[];
  lastCompletedWorkout: LastCompletedWorkoutRow | null;
  setLogs: Record<string, SetLogRow[]>;
  userId: string;
  workout: WorkoutRow | null;
};

type TrainingValidationIssue = {
  exerciseName: string;
  message: string;
  setIndex: number;
  severity: "error" | "warning";
};

const todayCacheKey = "strength-training-cache:today";
const restTimerSettingsKey = "strength-training-rest-timer";
const restTimerOptions = [60, 90, 120, 180];

export function TodayWorkout() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [exercises, setExercises] = useState<WorkoutExerciseRow[]>([]);
  const [setLogs, setSetLogs] = useState<Record<string, SetLogRow[]>>({});
  const [lastCompletedWorkout, setLastCompletedWorkout] = useState<LastCompletedWorkoutRow | null>(null);
  const [coachRecommendations, setCoachRecommendations] = useState<
    Array<ExerciseCoachRecommendation & { exerciseName: string }>
  >([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [validationIssues, setValidationIssues] = useState<TrainingValidationIssue[]>([]);
  const [restTimerEnabled, setRestTimerEnabled] = useState(true);
  const [restSeconds, setRestSeconds] = useState(120);
  const [restRemaining, setRestRemaining] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restContext, setRestContext] = useState("完成一组后自动开始休息");

  useEffect(() => {
    const settings = readRestTimerSettings();
    if (!settings) return;

    setRestTimerEnabled(settings.enabled);
    setRestSeconds(settings.seconds);
  }, []);

  useEffect(() => {
    if (!restRunning || restRemaining <= 0) return;

    const timerId = window.setInterval(() => {
      setRestRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timerId);
          setRestRunning(false);
          setRestContext("休息结束，可以开始下一组。");
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [restRemaining, restRunning]);

  useEffect(() => {
    async function loadTodayWorkout() {
      try {
        if (!readClientCache<TodayCache>(todayCacheKey)) {
          setStatus("loading");
        }

        const supabase = createBrowserSupabaseClient();
        const { data: sessionData, error: sessionError } = await withTimeout(
          supabase.auth.getSession(),
          "登录状态读取超时，请刷新页面后重试。"
        );
        const user = sessionData.session?.user;

        if (sessionError || !user) {
          router.replace("/login?next=/today");
          return;
        }

        setUserId(user.id);

        const { data: program, error: programError } = await withTimeout(
          supabase
            .from("programs")
            .select("id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          "当前训练计划读取超时，请刷新页面后重试。"
        );

        if (programError) {
          setStatus("error");
          setMessage(programError.message);
          return;
        }

        if (!program) {
          writeClientCache<TodayCache>(todayCacheKey, {
            coachRecommendations: [],
            exercises: [],
            lastCompletedWorkout: null,
            setLogs: {},
            userId: user.id,
            workout: null
          });
          setStatus("ready");
          return;
        }

        const today = formatDate(new Date());
        const { data: workoutData, error: workoutError } = await withTimeout(
          supabase
            .from("workouts")
            .select("id,scheduled_date,name,status")
            .eq("program_id", program.id)
            .neq("status", "completed")
            .gte("scheduled_date", today)
            .order("scheduled_date", { ascending: true })
            .limit(1)
            .maybeSingle(),
          "今日训练读取超时，请刷新页面后重试。"
        );

        if (workoutError) {
          setStatus("error");
          setMessage(workoutError.message);
          return;
        }

        if (!workoutData) {
          setStatus("ready");
          setMessage("当前计划已经没有待训练日。");
          return;
        }

        const { data: exerciseData, error: exerciseError } = await withTimeout(
          supabase
            .from("workout_exercises")
            .select(
              "id,exercise_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug,default_increment)"
            )
            .eq("workout_id", workoutData.id)
            .order("order_index", { ascending: true }),
          "训练动作读取超时，请刷新页面后重试。"
        );

        if (exerciseError) {
          setStatus("error");
          setMessage(exerciseError.message);
          return;
        }

        const exerciseRows = (exerciseData ?? []) as unknown as WorkoutExerciseRow[];
        setWorkout(workoutData as WorkoutRow);
        setExercises(exerciseRows);
        const [lastWorkout, groupedLogs] = await Promise.all([
          loadLastCompletedWorkout(program.id, workoutData.scheduled_date),
          ensureSetLogs(exerciseRows, workoutData.id)
        ]);
        writeClientCache<TodayCache>(todayCacheKey, {
          coachRecommendations: [],
          exercises: exerciseRows,
          lastCompletedWorkout: lastWorkout,
          setLogs: groupedLogs,
          userId: user.id,
          workout: workoutData as WorkoutRow
        });
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "今日训练读取失败，请刷新页面后重试。");
      }
    }

    const cached = readClientCache<TodayCache>(todayCacheKey);
    if (cached) {
      setUserId(cached.userId);
      setWorkout(cached.workout);
      setExercises(cached.exercises);
      setSetLogs(cached.setLogs);
      setLastCompletedWorkout(cached.lastCompletedWorkout);
      setCoachRecommendations(cached.coachRecommendations);
      setStatus("ready");
    }

    loadTodayWorkout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadLastCompletedWorkout(programId: string, scheduledDate: string) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("workouts")
      .select("scheduled_date,name")
      .eq("program_id", programId)
      .eq("status", "completed")
      .lt("scheduled_date", scheduledDate)
      .order("scheduled_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return null;
    }

    const row = (data as LastCompletedWorkoutRow | null) ?? null;
    setLastCompletedWorkout(row);
    return row;
  }

  async function ensureSetLogs(exerciseRows: WorkoutExerciseRow[], workoutId: string) {
    if (exerciseRows.length === 0) {
      setSetLogs({});
      return {};
    }

    const supabase = createBrowserSupabaseClient();
    const exerciseIds = exerciseRows.map((exercise) => exercise.id);
    const { data: existingLogs, error: logsError } = await supabase
      .from("set_logs")
      .select("id,workout_exercise_id,set_index,target_weight,target_reps,actual_weight,actual_reps,rpe,completed")
      .in("workout_exercise_id", exerciseIds)
      .order("set_index", { ascending: true });

    if (logsError) {
      setStatus("error");
      setMessage(logsError.message);
      return {};
    }

    const existingByKey = new Map(
      ((existingLogs ?? []) as SetLogRow[]).map((log) => [`${log.workout_exercise_id}-${log.set_index}`, log])
    );
    const missingPayload = exerciseRows.flatMap((exercise) => {
      const rows = [];

      for (let index = 0; index < exercise.target_sets; index += 1) {
        const setIndex = index + 1;
        if (existingByKey.has(`${exercise.id}-${setIndex}`)) continue;

        rows.push({
          workout_exercise_id: exercise.id,
          set_index: setIndex,
          target_weight: exercise.target_weight,
          target_reps: exercise.target_reps,
          actual_weight: null,
          actual_reps: null,
          rpe: null,
          completed: false
        });
      }

      return rows;
    });

    if (missingPayload.length > 0) {
      const { error: insertError } = await supabase
        .from("set_logs")
        .upsert(missingPayload, { onConflict: "workout_exercise_id,set_index" });
      if (insertError) {
        setStatus("error");
        setMessage(insertError.message);
        return {};
      }
    }

    const { data: refreshedLogs, error: refreshError } = await supabase
      .from("set_logs")
      .select("id,workout_exercise_id,set_index,target_weight,target_reps,actual_weight,actual_reps,rpe,completed")
      .in("workout_exercise_id", exerciseIds)
      .order("set_index", { ascending: true });

    if (refreshError) {
      setStatus("error");
      setMessage(refreshError.message);
      return {};
    }

    const groupedLogs = groupSetLogs((refreshedLogs ?? []) as SetLogRow[]);
    const draftLogs = readDraftLogs(workoutId);
    if (draftLogs) {
      const mergedLogs = mergeDraftLogs(groupedLogs, draftLogs);
      setSetLogs(mergedLogs);
      setSaveStatus("saved");
      setMessage("已恢复上次未完成的训练草稿。");
      return mergedLogs;
    }

    setSetLogs(groupedLogs);
    return groupedLogs;
  }

  function updateSetLog(workoutExerciseId: string, setIndex: number, patch: Partial<SetLogRow>) {
    setSaveStatus("idle");
    setValidationIssues([]);
    setSetLogs((current) => {
      const nextLogs = {
        ...current,
        [workoutExerciseId]: (current[workoutExerciseId] ?? []).map((log) =>
          log.set_index === setIndex ? { ...log, ...patch } : log
        )
      };
      writeDraftLogs(workout?.id, nextLogs);
      return nextLogs;
    });
  }

  function updateRestTimerSettings(nextSettings: { enabled?: boolean; seconds?: number }) {
    const nextEnabled = nextSettings.enabled ?? restTimerEnabled;
    const nextSeconds = nextSettings.seconds ?? restSeconds;
    setRestTimerEnabled(nextEnabled);
    setRestSeconds(nextSeconds);
    writeRestTimerSettings({ enabled: nextEnabled, seconds: nextSeconds });
  }

  function startRestTimer(exercise: WorkoutExerciseRow, setIndex: number) {
    if (!restTimerEnabled || exercise.exercises?.slug === "cardio_zone2") return;

    const exerciseName = exercise.exercises?.name ?? "动作";
    setRestRemaining(restSeconds);
    setRestRunning(true);
    setRestContext(`${exerciseName} 第 ${setIndex} 组后休息`);

    if ("vibrate" in navigator) {
      navigator.vibrate(35);
    }
  }

  function handleSetCompletionChange(exercise: WorkoutExerciseRow, log: SetLogRow, completed: boolean) {
    updateSetLog(exercise.id, log.set_index, {
      actual_weight: log.actual_weight ?? log.target_weight,
      actual_reps: log.actual_reps ?? log.target_reps,
      rpe: completed ? getCompletedSetRpe(exercise, log.rpe) : log.rpe,
      completed
    });

    if (completed && !log.completed) {
      startRestTimer(exercise, log.set_index);
    }
  }

  function fillByPlan() {
    setSaveStatus("idle");
    setValidationIssues([]);
    setSetLogs((current) => {
      const nextLogs = Object.fromEntries(
        exercises.map((exercise) => [
          exercise.id,
          (current[exercise.id] ?? []).map((log) => ({
            ...log,
            actual_weight: log.target_weight,
            actual_reps: log.target_reps,
            rpe: getCompletedSetRpe(exercise, log.rpe),
            completed: true
          }))
        ])
      );
      writeDraftLogs(workout?.id, nextLogs);
      return nextLogs;
    });
  }

  function fillExerciseByPlan(exerciseId: string) {
    setSaveStatus("idle");
    setValidationIssues([]);
    const exercise = exercises.find((item) => item.id === exerciseId);
    setSetLogs((current) => {
      const nextLogs = {
        ...current,
        [exerciseId]: (current[exerciseId] ?? []).map((log) => ({
          ...log,
          actual_weight: log.target_weight,
          actual_reps: log.target_reps,
          rpe: exercise ? getCompletedSetRpe(exercise, log.rpe) : log.rpe,
          completed: true
        }))
      };
      writeDraftLogs(workout?.id, nextLogs);
      return nextLogs;
    });
  }

  async function saveLogs({ completeWorkout = false }: { completeWorkout?: boolean } = {}) {
    if (!workout) return;
    if (completeWorkout && !userId) {
      setSaveStatus("error");
      setMessage("登录状态已失效，请重新登录后再完成训练。");
      return;
    }

    const allLogs = Object.values(setLogs).flat();
    const incompleteSetCount = allLogs.filter((log) => !log.completed).length;
    if (completeWorkout && incompleteSetCount > 0) {
      setSaveStatus("error");
      setMessage(`还有 ${incompleteSetCount} 组没有勾选完成。可以先保存记录，或补完后再完成训练。`);
      return;
    }

    const nextValidationIssues = validateTrainingLogs({ completeWorkout, exercises, setLogs });
    const blockingIssues = nextValidationIssues.filter((issue) => issue.severity === "error");
    if (blockingIssues.length > 0) {
      setSaveStatus("error");
      setValidationIssues(nextValidationIssues);
      setMessage(`发现 ${blockingIssues.length} 个需要修正的数据，请检查后再${completeWorkout ? "完成训练" : "保存"}。`);
      return;
    }

    setValidationIssues(nextValidationIssues);
    setSaveStatus("saving");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const payload = allLogs.map((log) => ({
        workout_exercise_id: log.workout_exercise_id,
        set_index: log.set_index,
        target_weight: log.target_weight,
        target_reps: log.target_reps,
        actual_weight: log.completed ? log.actual_weight ?? log.target_weight : log.actual_weight,
        actual_reps: log.completed ? log.actual_reps ?? log.target_reps : log.actual_reps,
        rpe: log.rpe,
        completed: log.completed,
        updated_at: new Date().toISOString()
      }));

    const { error: upsertError } = await supabase
      .from("set_logs")
      .upsert(payload, { onConflict: "workout_exercise_id,set_index" });

    if (upsertError) {
      setSaveStatus("error");
      setMessage(upsertError.message);
      return;
    }

    if (completeWorkout) {
      clearDraftLogs(workout.id);
      clearTrainingDataCaches();
      const { error: workoutError } = await supabase
        .from("workouts")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", workout.id);

      if (workoutError) {
        setSaveStatus("error");
        setMessage(workoutError.message);
        return;
      }

      const recommendations = buildCoachRecommendationsFromCurrentLogs();
      const recommendationPayload = recommendations
        .filter((item) => item.targetWeight > 0)
        .map((item) => ({
          user_id: userId,
          exercise_id: item.exerciseId,
          workout_id: workout.id,
          recommendation_type: item.recommendation.type,
          previous_weight: item.targetWeight,
          suggested_weight: item.recommendation.suggestedWeight,
          reason: item.recommendation.reason,
          status: "pending"
        }));

      if (recommendationPayload.length > 0) {
        const { error: recommendationError } = await supabase.from("recommendations").insert(recommendationPayload);
        if (recommendationError) {
          setSaveStatus("error");
          setMessage(recommendationError.message);
          return;
        }
      }

      setCoachRecommendations(
        recommendations.map((item) => ({
          ...item.recommendation,
          exerciseName: item.exerciseName
        }))
      );
      setWorkout({ ...workout, status: "completed" });
      setValidationIssues([]);
      await trackEvent({
        eventName: "workout_completed",
        properties: {
          completed_sets: allLogs.filter((log) => log.completed).length,
          recommendations: recommendationPayload.length,
          workout_name: workout.name
        },
        supabase,
        userId
      });
      setMessage("训练已完成。Fitness Coach 已生成下次重量建议。");
    } else {
      clearDraftLogs(workout.id);
      clearTrainingDataCaches();
      await trackEvent({
        eventName: "workout_saved",
        properties: {
          completed_sets: allLogs.filter((log) => log.completed).length,
          total_sets: allLogs.length,
          workout_name: workout.name
        },
        supabase,
        userId
      });
      setMessage("训练记录已保存。");
    }

    if (!completeWorkout && nextValidationIssues.length === 0) {
      setValidationIssues([]);
    }
    setSaveStatus("saved");
  }

  function buildCoachRecommendationsFromCurrentLogs() {
    return exercises.map((exercise) => {
      const recommendation = buildExerciseCoachRecommendation({
        exerciseName: exercise.exercises?.name ?? "动作",
        increment: Number(exercise.exercises?.default_increment) || 2.5,
        logs: (setLogs[exercise.id] ?? []).map((log) => ({
          targetWeight: Number(log.target_weight),
          targetReps: Number(log.target_reps),
          actualWeight: log.actual_weight,
          actualReps: log.actual_reps,
          rpe: log.rpe,
          completed: log.completed
        })),
        targetWeight: Number(exercise.target_weight)
      });

      return {
        exerciseId: exercise.exercise_id,
        exerciseName: exercise.exercises?.name ?? "动作",
        recommendation,
        targetWeight: Number(exercise.target_weight)
      };
    });
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取今日训练
      </div>
    );
  }

  if (status === "error") {
    return <p className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600">{message}</p>;
  }

  if (!workout) {
    return (
      <section className="rounded-xl border border-line p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
            <CalendarDays size={20} />
          </span>
          <div>
            <h2 className="font-semibold">还没有可执行的训练计划</h2>
            <p className="text-sm text-muted">{message || "先基于训练画像生成 4 周计划。"}</p>
          </div>
        </div>
        <Link className="inline-flex rounded-lg bg-action px-4 py-2 font-semibold text-white" href="/plan">
          去生成训练计划
        </Link>
      </section>
    );
  }

  const totalSets = Object.values(setLogs).flat().length;
  const completedSets = Object.values(setLogs).flat().filter((log) => log.completed).length;
  const workoutMeta = getWorkoutMeta(workout.name);
  const interruptionAdvice = getInterruptionAdvice({
    lastCompletedDate: lastCompletedWorkout?.scheduled_date,
    scheduledDate: workout.scheduled_date
  });
  const coachCue = getWorkoutCoachCue(workout.name);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-line bg-field p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action text-white">
            <Dumbbell size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{workout.scheduled_date}</p>
            <h2 className="text-xl font-semibold">{workout.name}</h2>
            <p className="mt-1 text-sm text-muted">{workoutMeta.focus}</p>
            <p className="mt-2 text-sm text-muted">{workoutMeta.note}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-action">
            {workout.status === "completed" ? "已完成" : `${completedSets}/${totalSets} 组`}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-action/10 text-action">
            <Brain size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Fitness Coach</h3>
              <span className="rounded-full bg-field px-2 py-1 text-xs font-semibold text-muted">
                {interruptionAdvice.title}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">{interruptionAdvice.message}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{coachCue}</p>
            {lastCompletedWorkout ? (
              <p className="mt-2 text-xs text-muted">
                上次完成：{lastCompletedWorkout.scheduled_date} · {lastCompletedWorkout.name}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${saveStatus === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
          {message}
        </p>
      ) : null}

      {validationIssues.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">提交前检查</h3>
          <div className="mt-3 space-y-2">
            {validationIssues.slice(0, 6).map((issue) => (
              <p className="text-sm leading-6 text-amber-900" key={`${issue.exerciseName}-${issue.setIndex}-${issue.message}`}>
                {issue.severity === "error" ? "需修正" : "建议"} · {issue.exerciseName} 第 {issue.setIndex} 组：{issue.message}
              </p>
            ))}
            {validationIssues.length > 6 ? (
              <p className="text-sm text-amber-900">还有 {validationIssues.length - 6} 条检查结果，请先处理前面的关键项。</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <RestTimerPanel
        context={restContext}
        enabled={restTimerEnabled}
        isRunning={restRunning}
        options={restTimerOptions}
        remaining={restRemaining}
        seconds={restSeconds}
        onNudge={(seconds) => setRestRemaining((current) => Math.max(0, current + seconds))}
        onPause={() => setRestRunning(false)}
        onResume={() => {
          if (restRemaining > 0) setRestRunning(true);
        }}
        onReset={() => {
          setRestRemaining(restSeconds);
          setRestRunning(restTimerEnabled);
          setRestContext("手动重置组间休息");
        }}
        onSecondsChange={(seconds) => updateRestTimerSettings({ seconds })}
        onSkip={() => {
          setRestRemaining(0);
          setRestRunning(false);
          setRestContext("休息已跳过，可以开始下一组。");
        }}
        onToggle={(enabled) => updateRestTimerSettings({ enabled })}
      />

      {coachRecommendations.length > 0 ? (
        <div className="rounded-xl border border-line bg-white p-4">
          <h3 className="font-semibold">下次训练建议</h3>
          <div className="mt-3 space-y-2">
            {coachRecommendations.map((item) => (
              <div className="rounded-lg bg-field px-3 py-2 text-sm" key={`${item.exerciseName}-${item.reason}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{item.exerciseName}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-action">
                    {formatRecommendationType(item.type)}
                  </span>
                </div>
                <p className="mt-1 text-muted">{item.reason}</p>
                {item.suggestedWeight > 0 ? (
                  <p className="mt-1 font-semibold text-ink">建议下次：{item.suggestedWeight}kg</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink"
          onClick={fillByPlan}
          type="button"
        >
          <CheckCircle2 size={17} />
          按计划填入
        </button>
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saveStatus === "saving"}
          onClick={() => saveLogs()}
          type="button"
        >
          {saveStatus === "saving" ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
          保存记录
        </button>
      </div>

      <div className="rounded-xl border border-line bg-white p-4">
        <h3 className="font-semibold">执行记录</h3>
        <p className="mt-1 text-sm text-muted">记录实际完成重量、次数和 RPE。RPE 8 大约是还剩 2 次余量。</p>
      </div>

      <div className="space-y-3">
        {exercises.map((exercise, index) => (
          <article className="rounded-xl border border-line bg-white p-4" key={exercise.id}>
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-action text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-semibold">{exercise.exercises?.name ?? "动作"}</h3>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <p className="font-semibold text-action">
                      {formatPrescription({
                        slug: exercise.exercises?.slug,
                        targetSets: exercise.target_sets,
                        targetReps: exercise.target_reps,
                        targetWeight: Number(exercise.target_weight)
                      })}
                    </p>
                    <button
                      className="h-8 rounded-lg border border-line px-2 text-xs font-semibold text-ink"
                      onClick={() => fillExerciseByPlan(exercise.id)}
                      type="button"
                    >
                      本动作按计划
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">{getExerciseNote(exercise.exercises?.slug, index)}</p>
                <div className="mt-4 space-y-2">
                  {(setLogs[exercise.id] ?? []).map((log) => (
                    <div
                      className={`grid grid-cols-[2.5rem_1fr_1fr_1fr_2.25rem] items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                        log.completed ? "bg-action/10 ring-1 ring-action/20" : "bg-field"
                      }`}
                      key={`${exercise.id}-${log.set_index}`}
                    >
                      <span className={`font-semibold ${log.completed ? "text-action" : ""}`}>{log.set_index}</span>
                      <WeightInput
                        increment={getWeightIncrement(exercise)}
                        label="重量"
                        min={0}
                        value={log.actual_weight ?? log.target_weight}
                        onChange={(value) => updateSetLog(exercise.id, log.set_index, { actual_weight: value })}
                      />
                      <NumberInput
                        label={exercise.exercises?.slug === "cardio_zone2" ? "分钟" : "次数"}
                        min={0}
                        step={1}
                        value={log.actual_reps ?? log.target_reps}
                        onChange={(value) => updateSetLog(exercise.id, log.set_index, { actual_reps: value })}
                      />
                      <NumberInput
                        label="RPE"
                        max={10}
                        min={1}
                        step={0.5}
                        value={log.rpe}
                        onChange={(value) => updateSetLog(exercise.id, log.set_index, { rpe: value })}
                      />
                      <label className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white">
                        <input
                          aria-label={`第 ${log.set_index} 组完成`}
                          checked={log.completed}
                          className="h-4 w-4 accent-action"
                          onChange={(event) => handleSetCompletionChange(exercise, log, event.target.checked)}
                          type="checkbox"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-2">
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saveStatus === "saving" || workout.status === "completed"}
          onClick={() => saveLogs({ completeWorkout: true })}
          type="button"
        >
          {saveStatus === "saving" ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {workout.status === "completed" ? "训练已完成" : "保存并完成训练"}
        </button>
        <Link className="inline-flex h-11 items-center justify-center rounded-lg border border-line px-4 font-semibold text-ink" href="/plan">
          查看完整计划
        </Link>
      </div>
    </section>
  );
}

function RestTimerPanel({
  context,
  enabled,
  isRunning,
  options,
  remaining,
  seconds,
  onNudge,
  onPause,
  onReset,
  onResume,
  onSecondsChange,
  onSkip,
  onToggle
}: {
  context: string;
  enabled: boolean;
  isRunning: boolean;
  options: number[];
  remaining: number;
  seconds: number;
  onNudge: (seconds: number) => void;
  onPause: () => void;
  onReset: () => void;
  onResume: () => void;
  onSecondsChange: (seconds: number) => void;
  onSkip: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const progress = seconds > 0 ? Math.max(0, Math.min(100, (remaining / seconds) * 100)) : 0;
  const hasActiveTimer = remaining > 0;

  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-action/10 text-action">
          <Timer size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">组间休息</h3>
              <p className="mt-1 text-sm text-muted">{enabled ? context : "已关闭自动休息倒计时"}</p>
            </div>
            <button
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                enabled ? "bg-action text-white" : "border border-line text-muted"
              }`}
              onClick={() => onToggle(!enabled)}
              type="button"
            >
              {enabled ? "已开启" : "已关闭"}
            </button>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-4xl font-semibold tabular-nums text-ink">
                {formatRestTimer(remaining || seconds)}
              </p>
              <p className="mt-1 text-xs text-muted">{hasActiveTimer ? "倒计时中" : "默认时长"}</p>
            </div>
            <div className="flex gap-2">
              <button
                aria-label={isRunning ? "暂停休息倒计时" : "继续休息倒计时"}
                className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink disabled:opacity-50"
                disabled={!enabled || !hasActiveTimer}
                onClick={isRunning ? onPause : onResume}
                type="button"
              >
                {isRunning ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <button
                aria-label="重置休息倒计时"
                className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink disabled:opacity-50"
                disabled={!enabled}
                onClick={onReset}
                type="button"
              >
                <RotateCcw size={17} />
              </button>
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-field">
            <div className="h-full rounded-full bg-action transition-all" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                className={`h-9 rounded-lg px-3 text-sm font-semibold ${
                  seconds === option ? "bg-ink text-white" : "border border-line text-ink"
                }`}
                key={option}
                onClick={() => onSecondsChange(option)}
                type="button"
              >
                {formatRestOption(option)}
              </button>
            ))}
            <button
              className="h-9 rounded-lg border border-line px-3 text-sm font-semibold text-ink disabled:opacity-50"
              disabled={!enabled}
              onClick={() => onNudge(30)}
              type="button"
            >
              +30 秒
            </button>
            <button
              className="h-9 rounded-lg border border-line px-3 text-sm font-semibold text-ink disabled:opacity-50"
              disabled={!enabled || !hasActiveTimer}
              onClick={onSkip}
              type="button"
            >
              跳过
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeightInput({
  increment,
  label,
  min,
  value,
  onChange
}: {
  increment: number;
  label: string;
  min: number;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const displayValue = value ?? 0;

  function adjust(delta: number) {
    const nextValue = roundToHalf(Math.max(min, displayValue + delta));
    onChange(nextValue);
  }

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <div className="grid h-9 grid-cols-[2rem_1fr_2rem] overflow-hidden rounded-md border border-line bg-white focus-within:border-action">
        <button
          aria-label={`${label}减少 ${increment}kg`}
          className="grid place-items-center border-r border-line text-muted disabled:opacity-40"
          disabled={displayValue <= min}
          onClick={() => adjust(-increment)}
          type="button"
        >
          <Minus size={14} />
        </button>
        <input
          className="min-w-0 border-0 bg-white px-1 text-center text-sm outline-none"
          inputMode="decimal"
          min={min}
          onChange={(event) => {
            const nextValue = event.target.value === "" ? null : Number(event.target.value);
            onChange(Number.isNaN(nextValue) ? null : nextValue);
          }}
          step={0.5}
          type="number"
          value={value ?? ""}
        />
        <button
          aria-label={`${label}增加 ${increment}kg`}
          className="grid place-items-center border-l border-line text-muted"
          onClick={() => adjust(increment)}
          type="button"
        >
          <Plus size={14} />
        </button>
      </div>
    </label>
  );
}

function NumberInput({
  label,
  max,
  min,
  step,
  value,
  onChange
}: {
  label: string;
  max?: number;
  min: number;
  step: number;
  value: number | null;
  onChange: (value: number | null) => void;
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

function groupSetLogs(logs: SetLogRow[]) {
  return logs.reduce<Record<string, SetLogRow[]>>((groups, log) => {
    groups[log.workout_exercise_id] = [...(groups[log.workout_exercise_id] ?? []), log].sort(
      (a, b) => a.set_index - b.set_index
    );
    return groups;
  }, {});
}

function mergeDraftLogs(currentLogs: Record<string, SetLogRow[]>, draftLogs: Record<string, SetLogRow[]>) {
  return Object.fromEntries(
    Object.entries(currentLogs).map(([workoutExerciseId, logs]) => {
      const draftBySetIndex = new Map(
        (draftLogs[workoutExerciseId] ?? []).map((log) => [log.set_index, log])
      );

      return [
        workoutExerciseId,
        logs.map((log) => ({
          ...log,
          ...pickDraftFields(draftBySetIndex.get(log.set_index))
        }))
      ];
    })
  );
}

function pickDraftFields(log?: SetLogRow) {
  if (!log) return {};

  return {
    actual_reps: log.actual_reps,
    actual_weight: log.actual_weight,
    completed: log.completed,
    rpe: log.rpe
  };
}

function readDraftLogs(workoutId: string) {
  try {
    const rawDraft = window.localStorage.getItem(getDraftKey(workoutId));
    if (!rawDraft) return null;

    return JSON.parse(rawDraft) as Record<string, SetLogRow[]>;
  } catch {
    return null;
  }
}

function writeDraftLogs(workoutId: string | undefined, logs: Record<string, SetLogRow[]>) {
  if (!workoutId) return;

  window.localStorage.setItem(getDraftKey(workoutId), JSON.stringify(logs));
}

function clearDraftLogs(workoutId: string) {
  window.localStorage.removeItem(getDraftKey(workoutId));
}

function getDraftKey(workoutId: string) {
  return `strength-training-draft:${workoutId}`;
}

function readRestTimerSettings() {
  try {
    const rawSettings = window.localStorage.getItem(restTimerSettingsKey);
    if (!rawSettings) return null;

    const settings = JSON.parse(rawSettings) as { enabled?: boolean; seconds?: number };
    const seconds = Number(settings.seconds);
    return {
      enabled: typeof settings.enabled === "boolean" ? settings.enabled : true,
      seconds: restTimerOptions.includes(seconds) ? seconds : 120
    };
  } catch {
    return null;
  }
}

function writeRestTimerSettings(settings: { enabled: boolean; seconds: number }) {
  window.localStorage.setItem(restTimerSettingsKey, JSON.stringify(settings));
}

function validateTrainingLogs({
  completeWorkout,
  exercises,
  setLogs
}: {
  completeWorkout: boolean;
  exercises: WorkoutExerciseRow[];
  setLogs: Record<string, SetLogRow[]>;
}) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const issues: TrainingValidationIssue[] = [];

  for (const [exerciseId, logs] of Object.entries(setLogs)) {
    const exercise = exerciseById.get(exerciseId);
    const exerciseName = exercise?.exercises?.name ?? "动作";
    const isCardio = exercise?.exercises?.slug === "cardio_zone2";

    for (const log of logs) {
      if (!log.completed) continue;

      const actualWeight = log.actual_weight ?? log.target_weight;
      const actualReps = log.actual_reps ?? log.target_reps;

      if (!isCardio && (!Number.isFinite(actualWeight) || actualWeight <= 0)) {
        issues.push({
          exerciseName,
          message: "重量需要大于 0kg。",
          setIndex: log.set_index,
          severity: "error"
        });
      }

      if (!Number.isFinite(actualReps) || actualReps <= 0) {
        issues.push({
          exerciseName,
          message: isCardio ? "有氧分钟数需要大于 0。" : "次数需要大于 0。",
          setIndex: log.set_index,
          severity: "error"
        });
      }

      if (!isCardio && completeWorkout && log.rpe === null) {
        issues.push({
          exerciseName,
          message: "完成训练前建议填写 RPE，后续重量建议会更准确。",
          setIndex: log.set_index,
          severity: "error"
        });
      }

      if (log.rpe !== null && (log.rpe < 1 || log.rpe > 10)) {
        issues.push({
          exerciseName,
          message: "RPE 应在 1 到 10 之间。",
          setIndex: log.set_index,
          severity: "error"
        });
      }

      if (!isCardio && isExtremeWeight(actualWeight, log.target_weight)) {
        issues.push({
          exerciseName,
          message: `重量 ${actualWeight}kg 明显高于计划 ${log.target_weight}kg，请确认是否输入错误。`,
          setIndex: log.set_index,
          severity: "error"
        });
      }

      if (!isCardio && actualReps > Math.max(30, log.target_reps * 4)) {
        issues.push({
          exerciseName,
          message: `次数 ${actualReps} 明显高于计划 ${log.target_reps} 次，请确认是否输入错误。`,
          setIndex: log.set_index,
          severity: "warning"
        });
      }

      if (isCardio && actualReps > 180) {
        issues.push({
          exerciseName,
          message: `有氧 ${actualReps} 分钟偏高，请确认是否输入错误。`,
          setIndex: log.set_index,
          severity: "warning"
        });
      }
    }
  }

  return issues;
}

function isExtremeWeight(actualWeight: number, targetWeight: number) {
  if (!Number.isFinite(actualWeight)) return true;
  if (actualWeight > 450) return true;
  if (targetWeight > 0 && actualWeight > Math.max(targetWeight * 3, targetWeight + 120)) return true;
  return false;
}

function getWeightIncrement(exercise: WorkoutExerciseRow) {
  if (exercise.exercises?.slug === "cardio_zone2") return 1;

  const increment = Number(exercise.exercises?.default_increment);
  return increment > 0 ? increment : 2.5;
}

function getCompletedSetRpe(exercise: WorkoutExerciseRow, currentRpe: number | null) {
  if (exercise.exercises?.slug === "cardio_zone2") return currentRpe;
  return currentRpe ?? 8;
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function formatRestTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${restSeconds}`;
}

function formatRestOption(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分${seconds % 60 === 0 ? "" : `${seconds % 60} 秒`}`;
}

function formatRecommendationType(type: ExerciseCoachRecommendation["type"]) {
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

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
