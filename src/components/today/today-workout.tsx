"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, CalendarDays, CheckCircle2, Dumbbell, Loader2, Save } from "lucide-react";
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

const todayCacheKey = "strength-training-cache:today";

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

  function fillByPlan() {
    setSaveStatus("idle");
    setSetLogs((current) => {
      const nextLogs = Object.fromEntries(
        Object.entries(current).map(([workoutExerciseId, logs]) => [
          workoutExerciseId,
          logs.map((log) => ({
            ...log,
            actual_weight: log.target_weight,
            actual_reps: log.target_reps,
            completed: true
          }))
        ])
      );
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
                  <p className="font-semibold text-action">
                    {formatPrescription({
                      slug: exercise.exercises?.slug,
                      targetSets: exercise.target_sets,
                      targetReps: exercise.target_reps,
                      targetWeight: Number(exercise.target_weight)
                    })}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted">{getExerciseNote(exercise.exercises?.slug, index)}</p>
                <div className="mt-4 space-y-2">
                  {(setLogs[exercise.id] ?? []).map((log) => (
                    <div
                      className="grid grid-cols-[2.5rem_1fr_1fr_1fr_2.25rem] items-center gap-2 rounded-lg bg-field px-2 py-2 text-sm"
                      key={`${exercise.id}-${log.set_index}`}
                    >
                      <span className="font-semibold">{log.set_index}</span>
                      <NumberInput
                        label="重量"
                        min={0}
                        step={exercise.exercises?.slug === "cardio_zone2" ? 1 : 0.5}
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
                          onChange={(event) =>
                            updateSetLog(exercise.id, log.set_index, {
                              actual_weight: log.actual_weight ?? log.target_weight,
                              actual_reps: log.actual_reps ?? log.target_reps,
                              completed: event.target.checked
                            })
                          }
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
