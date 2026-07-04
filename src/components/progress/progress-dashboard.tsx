"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BarChart3, CalendarDays, Loader2, TrendingUp } from "lucide-react";
import { estimateOneRepMax } from "@/domain/strength";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type WorkoutRow = {
  id: string;
  scheduled_date: string;
  name: string;
};

type WorkoutExerciseRow = {
  id: string;
  workout_id: string;
  target_sets: number;
  exercises: {
    name: string;
    slug: string;
    is_main_lift: boolean;
  } | null;
};

type SetLogRow = {
  id: string;
  workout_exercise_id: string;
  actual_weight: number | null;
  actual_reps: number | null;
  completed: boolean;
};

type LiftTrend = {
  name: string;
  slug: string;
  bestE1rm: number;
  points: Array<{
    date: string;
    e1rm: number;
  }>;
};

type WeeklyTrend = {
  weekKey: string;
  label: string;
  volume: number;
  completedSets: number;
  plannedSets: number;
};

export function ProgressDashboard() {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseRow[]>([]);
  const [setLogs, setSetLogs] = useState<SetLogRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProgress() {
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
          window.location.href = "/login?next=/progress";
          return;
        }

        const { data: workoutData, error: workoutError } = await withTimeout(
          supabase
            .from("workouts")
            .select("id,scheduled_date,name")
            .eq("user_id", user.id)
            .eq("status", "completed")
            .order("scheduled_date", { ascending: true })
            .limit(60),
          "训练数据读取超时，请刷新页面后重试。"
        );

        if (workoutError) {
          setStatus("error");
          setMessage(workoutError.message);
          return;
        }

        const workoutRows = (workoutData ?? []) as WorkoutRow[];
        setWorkouts(workoutRows);

        const workoutIds = workoutRows.map((workout) => workout.id);
        if (workoutIds.length === 0) {
          setWorkoutExercises([]);
          setSetLogs([]);
          setStatus("ready");
          return;
        }

        const { data: exerciseData, error: exerciseError } = await withTimeout(
          supabase
            .from("workout_exercises")
            .select("id,workout_id,target_sets,exercises(name,slug,is_main_lift)")
            .in("workout_id", workoutIds),
          "动作数据读取超时，请刷新页面后重试。"
        );

        if (exerciseError) {
          setStatus("error");
          setMessage(exerciseError.message);
          return;
        }

        const exerciseRows = (exerciseData ?? []) as unknown as WorkoutExerciseRow[];
        setWorkoutExercises(exerciseRows);

        const workoutExerciseIds = exerciseRows.map((exercise) => exercise.id);
        if (workoutExerciseIds.length === 0) {
          setSetLogs([]);
          setStatus("ready");
          return;
        }

        const { data: logData, error: logError } = await withTimeout(
          supabase
            .from("set_logs")
            .select("id,workout_exercise_id,actual_weight,actual_reps,completed")
            .in("workout_exercise_id", workoutExerciseIds),
          "组记录读取超时，请刷新页面后重试。"
        );

        if (logError) {
          setStatus("error");
          setMessage(logError.message);
          return;
        }

        setSetLogs((logData ?? []) as SetLogRow[]);
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "进展数据读取失败，请刷新页面后重试。");
      }
    }

    loadProgress();
  }, []);

  const progress = useMemo(() => {
    const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
    const exerciseById = new Map(workoutExercises.map((exercise) => [exercise.id, exercise]));
    const completedLogs = setLogs.filter((log) => log.completed);
    const totalVolume = completedLogs.reduce(
      (sum, log) => sum + Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0),
      0
    );
    const plannedSets = workoutExercises.reduce((sum, exercise) => sum + Number(exercise.target_sets ?? 0), 0);
    const completionRate = plannedSets > 0 ? completedLogs.length / plannedSets : 0;
    const weeklyTrends = buildWeeklyTrends({ workoutById, exerciseById, workoutExercises, setLogs });
    const liftTrends = buildLiftTrends({ workoutById, exerciseById, setLogs });

    return {
      completionRate,
      liftTrends,
      totalVolume,
      weeklyTrends
    };
  }, [setLogs, workoutExercises, workouts]);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取进展数据
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
            <h2 className="font-semibold">还没有趋势数据</h2>
            <p className="text-sm text-muted">完成至少 2 次训练后，这里会开始显示趋势。现在先把训练记录沉淀起来。</p>
          </div>
        </div>
        <Link className="inline-flex rounded-lg bg-action px-4 py-2 font-semibold text-white" href="/today">
          去训练
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<Activity size={16} />} label="完成训练" value={`${workouts.length} 次`} />
        <Metric icon={<BarChart3 size={16} />} label="总训练量" value={`${Math.round(progress.totalVolume).toLocaleString()} kg`} />
        <Metric icon={<TrendingUp size={16} />} label="完成率" value={`${Math.round(progress.completionRate * 100)}%`} />
      </section>

      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">每周训练量</h2>
            <p className="mt-1 text-sm text-muted">按完成组计算，帮助观察训练负荷是否稳定推进。</p>
          </div>
        </div>
        <div className="space-y-3">
          {progress.weeklyTrends.map((week) => (
            <BarRow
              key={week.weekKey}
              label={week.label}
              max={Math.max(...progress.weeklyTrends.map((item) => item.volume), 1)}
              note={`${week.completedSets}/${week.plannedSets} 组`}
              value={week.volume}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="font-semibold">主项 e1RM 趋势</h2>
        <p className="mt-1 text-sm text-muted">仅统计 1-10 次的完成组，避免高次数辅助组扭曲估算。</p>
        <div className="mt-4 space-y-3">
          {progress.liftTrends.length > 0 ? (
            progress.liftTrends.map((lift) => <LiftTrendCard key={lift.slug} trend={lift} />)
          ) : (
            <p className="rounded-lg bg-field px-3 py-3 text-sm text-muted">
              还没有主项完成组。完成深蹲、卧推、硬拉或推举后会显示 e1RM。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-field p-4">
      <div className="mb-2 flex items-center gap-2 text-muted">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function BarRow({ label, max, note, value }: { label: string; max: number; note: string; value: number }) {
  const width = max > 0 ? Math.max(5, Math.round((value / max) * 100)) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted">{Math.round(value).toLocaleString()} kg · {note}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-field">
        <div className="h-full rounded-full bg-action" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function LiftTrendCard({ trend }: { trend: LiftTrend }) {
  const first = trend.points[0]?.e1rm ?? trend.bestE1rm;
  const latest = trend.points[trend.points.length - 1]?.e1rm ?? trend.bestE1rm;
  const change = latest - first;
  const max = Math.max(...trend.points.map((point) => point.e1rm), 1);

  return (
    <article className="rounded-lg border border-line p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{trend.name}</h3>
          <p className="text-sm text-muted">
            最佳 e1RM {trend.bestE1rm.toFixed(1)}kg · {change >= 0 ? "+" : ""}{change.toFixed(1)}kg
          </p>
        </div>
        <span className="rounded-full bg-action/10 px-3 py-1 text-xs font-semibold text-action">
          {trend.points.length} 次
        </span>
      </div>
      <div className="grid h-24 grid-flow-col items-end gap-2">
        {trend.points.map((point) => (
          <div className="flex h-full flex-col justify-end gap-1" key={`${trend.slug}-${point.date}-${point.e1rm}`}>
            <div
              className="min-h-2 rounded-t-md bg-action/80"
              title={`${point.date} ${point.e1rm.toFixed(1)}kg`}
              style={{ height: `${Math.max(8, Math.round((point.e1rm / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function buildWeeklyTrends({
  exerciseById,
  setLogs,
  workoutById,
  workoutExercises
}: {
  exerciseById: Map<string, WorkoutExerciseRow>;
  setLogs: SetLogRow[];
  workoutById: Map<string, WorkoutRow>;
  workoutExercises: WorkoutExerciseRow[];
}): WeeklyTrend[] {
  const weeklyMap = new Map<string, WeeklyTrend>();

  for (const exercise of workoutExercises) {
    const workout = workoutById.get(exercise.workout_id);
    if (!workout) continue;

    const weekKey = getWeekKey(workout.scheduled_date);
    const current = weeklyMap.get(weekKey) ?? {
      weekKey,
      label: formatWeekLabel(workout.scheduled_date),
      volume: 0,
      completedSets: 0,
      plannedSets: 0
    };
    current.plannedSets += Number(exercise.target_sets ?? 0);
    weeklyMap.set(weekKey, current);
  }

  for (const log of setLogs) {
    const exercise = exerciseById.get(log.workout_exercise_id);
    if (!exercise) continue;
    const workout = workoutById.get(exercise.workout_id);
    if (!workout) continue;

    const weekKey = getWeekKey(workout.scheduled_date);
    const current = weeklyMap.get(weekKey);
    if (!current || !log.completed) continue;

    current.completedSets += 1;
    current.volume += Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0);
  }

  return Array.from(weeklyMap.values()).sort((a, b) => a.weekKey.localeCompare(b.weekKey)).slice(-8);
}

function buildLiftTrends({
  exerciseById,
  setLogs,
  workoutById
}: {
  exerciseById: Map<string, WorkoutExerciseRow>;
  setLogs: SetLogRow[];
  workoutById: Map<string, WorkoutRow>;
}): LiftTrend[] {
  const trendMap = new Map<string, LiftTrend>();

  for (const log of setLogs) {
    if (!log.completed || !log.actual_weight || !log.actual_reps || log.actual_reps > 10) continue;

    const exercise = exerciseById.get(log.workout_exercise_id);
    if (!exercise?.exercises?.is_main_lift) continue;

    const workout = workoutById.get(exercise.workout_id);
    if (!workout) continue;

    const e1rm = estimateOneRepMax(Number(log.actual_weight), Number(log.actual_reps));
    const slug = exercise.exercises.slug;
    const current = trendMap.get(slug) ?? {
      name: exercise.exercises.name,
      slug,
      bestE1rm: 0,
      points: []
    };
    current.bestE1rm = Math.max(current.bestE1rm, e1rm);
    current.points.push({ date: workout.scheduled_date, e1rm });
    trendMap.set(slug, current);
  }

  return Array.from(trendMap.values())
    .map((trend) => ({
      ...trend,
      points: trend.points
        .sort((a, b) => a.date.localeCompare(b.date))
        .reduce<Array<{ date: string; e1rm: number }>>((points, point) => {
          const last = points[points.length - 1];
          if (last?.date === point.date) {
            last.e1rm = Math.max(last.e1rm, point.e1rm);
            return points;
          }
          return [...points, point];
        }, [])
        .slice(-10)
    }))
    .sort((a, b) => b.bestE1rm - a.bestE1rm);
}

function getWeekKey(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const monday = new Date(parsedDate);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return formatDate(monday);
}

function formatWeekLabel(date: string) {
  const weekStart = getWeekKey(date);
  const parsed = new Date(`${weekStart}T00:00:00`);
  return `${parsed.getMonth() + 1}/${parsed.getDate()} 周`;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 10000) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
