"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Brain,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Loader2,
  Settings,
  Trophy
} from "lucide-react";
import { getDaysUntilTarget } from "@/domain/pr-planner";
import { getNextWorkoutState } from "@/domain/next-workout";
import { selectNextProgramWorkout } from "@/domain/next-program-workout";
import { formatPrescription, getWorkoutMeta } from "@/domain/training-format";
import { filterTrainingMetricWorkouts } from "@/domain/training-metric-workouts";
import { selectRecentTraining } from "@/domain/recent-training";
import { readClientCache, writeClientCache } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { loadWorkoutsWithDayTypeFallback } from "@/lib/workout-day-type-compat";

type WorkoutRow = {
  day_type: "training" | "rest";
  id: string;
  program_id: string | null;
  scheduled_date: string;
  sequence_index: number;
  name: string;
  status: string;
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
  workout_exercise_id: string;
  actual_weight: number | null;
  actual_reps: number | null;
  completed: boolean;
};

type RecommendationRow = {
  id: string;
  recommendation_type: string;
  previous_weight: number;
  suggested_weight: number;
  reason: string;
  exercises: {
    name: string;
  } | null;
};

type PrGoalRow = {
  id: string;
  target_weight: number;
  target_date: string;
  exercises: {
    name: string;
  } | null;
};

type HomeDashboardCache = {
  completedExercises: WorkoutExerciseRow[];
  completedWorkouts: WorkoutRow[];
  email: string;
  nextWorkout: WorkoutRow | null;
  nextWorkoutExercises: WorkoutExerciseRow[];
  prGoals: PrGoalRow[];
  recommendations: RecommendationRow[];
  setLogs: SetLogRow[];
};

const homeDashboardCacheKey = "strength-training-cache:home";

export function HomeDashboard() {
  const [email, setEmail] = useState("");
  const [nextWorkout, setNextWorkout] = useState<WorkoutRow | null>(null);
  const [nextWorkoutExercises, setNextWorkoutExercises] = useState<WorkoutExerciseRow[]>([]);
  const [completedWorkouts, setCompletedWorkouts] = useState<WorkoutRow[]>([]);
  const [completedExercises, setCompletedExercises] = useState<WorkoutExerciseRow[]>([]);
  const [setLogs, setSetLogs] = useState<SetLogRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [prGoals, setPrGoals] = useState<PrGoalRow[]>([]);
  const [status, setStatus] = useState<"loading" | "guest" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const cached = readClientCache<HomeDashboardCache>(homeDashboardCacheKey);
    if (cached) {
      setEmail(cached.email);
      // The active program may have changed since this cache was written.
      setNextWorkout(null);
      setNextWorkoutExercises([]);
      setCompletedWorkouts(cached.completedWorkouts);
      setCompletedExercises(cached.completedExercises);
      setSetLogs(cached.setLogs);
      setRecommendations(cached.recommendations);
      setPrGoals(cached.prGoals);
      setStatus("ready");
    }

    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const trainingWorkouts = filterTrainingMetricWorkouts(completedWorkouts);
    const trainingWorkoutIds = new Set(trainingWorkouts.map((workout) => workout.id));
    const trainingExerciseIds = new Set(
      completedExercises
        .filter((exercise) => trainingWorkoutIds.has(exercise.workout_id))
        .map((exercise) => exercise.id)
    );
    const completedLogs = setLogs.filter((log) => log.completed && trainingExerciseIds.has(log.workout_exercise_id));
    const volume = completedLogs.reduce(
      (sum, log) => sum + Number(log.actual_weight ?? 0) * Number(log.actual_reps ?? 0),
      0
    );
    const nearestPr = [...prGoals].sort(
      (a, b) => getDaysUntilTarget(a.target_date) - getDaysUntilTarget(b.target_date)
    )[0];

    return {
      completedSets: completedLogs.length,
      nearestPr,
      volume,
      workouts: trainingWorkouts.length
    };
  }, [completedExercises, completedWorkouts, prGoals, setLogs]);

  const recentTraining = useMemo(
    () => selectRecentTraining(completedWorkouts, completedExercises, setLogs),
    [completedExercises, completedWorkouts, setLogs]
  );

  async function loadDashboard() {
    if (!readClientCache<HomeDashboardCache>(homeDashboardCacheKey)) {
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
        setStatus("guest");
        return;
      }

      setEmail(user.email ?? "");

      const { data: activeProgram, error: activeProgramError } = await withTimeout(
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
      if (activeProgramError) {
        setStatus("error");
        setMessage(activeProgramError.message);
        return;
      }

      const [nextWorkoutResult, completedResult] = await Promise.all([
        withTimeout(
          activeProgram
            ? loadWorkoutsWithDayTypeFallback(
                () => supabase.from("workouts").select("id,program_id,scheduled_date,sequence_index,name,status,day_type").eq("program_id", activeProgram.id).eq("day_type", "training").in("status", ["scheduled", "draft"]).order("sequence_index", { ascending: true }).limit(1).maybeSingle(),
                () => supabase.from("workouts").select("id,program_id,scheduled_date,sequence_index,name,status").eq("program_id", activeProgram.id).in("status", ["scheduled", "draft"]).order("sequence_index", { ascending: true }).limit(1).maybeSingle()
              )
            : Promise.resolve({ data: null, error: null, usedLegacySchema: false }),
          "训练计划读取超时，请刷新页面后重试。"
        ),
        withTimeout(
          loadWorkoutsWithDayTypeFallback(
            () => supabase.from("workouts").select("id,program_id,scheduled_date,name,status,day_type").eq("user_id", user.id).eq("status", "completed").eq("day_type", "training").order("scheduled_date", { ascending: false }).limit(12),
            () => supabase.from("workouts").select("id,program_id,scheduled_date,name,status").eq("user_id", user.id).eq("status", "completed").order("scheduled_date", { ascending: false }).limit(12)
          ),
          "训练历史读取超时，请刷新页面后重试。"
        )
      ]);

      const { data: nextWorkoutData, error: nextWorkoutError } = nextWorkoutResult;

      if (nextWorkoutError) {
        setStatus("error");
        setMessage(nextWorkoutError.message);
        return;
      }

      const nextWorkoutRow = activeProgram
        ? selectNextProgramWorkout(nextWorkoutData ? [nextWorkoutData as WorkoutRow] : [], activeProgram.id)
        : null;
      setNextWorkout(nextWorkoutRow);

      const { data: completedData, error: completedError } = completedResult;
      if (completedError) {
        setStatus("error");
        setMessage(completedError.message);
        return;
      }

      const completedRows = (completedData ?? []) as WorkoutRow[];
      setCompletedWorkouts(completedRows);

      const followUpLoads = [
        loadCompletedTrainingDetails(completedRows),
        loadRecommendations(user.id),
        loadPrGoals(user.id)
      ] as const;

      const [completedDetails, recommendationRows, prGoalRows, nextWorkoutExerciseRows] = await Promise.all([
        ...followUpLoads,
        nextWorkoutRow ? loadNextWorkoutExercises(nextWorkoutRow.id) : Promise.resolve([])
      ]);

      writeClientCache<HomeDashboardCache>(homeDashboardCacheKey, {
        completedExercises: completedDetails.completedExercises,
        completedWorkouts: completedRows,
        email: user.email ?? "",
        nextWorkout: nextWorkoutRow,
        nextWorkoutExercises: nextWorkoutExerciseRows,
        prGoals: prGoalRows,
        recommendations: recommendationRows,
        setLogs: completedDetails.setLogs
      });
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "首页数据读取失败，请刷新页面后重试。");
    }
  }

  async function loadNextWorkoutExercises(workoutId: string) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await withTimeout(
      supabase
        .from("workout_exercises")
        .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug)")
        .eq("workout_id", workoutId)
        .order("order_index", { ascending: true }),
      "训练动作读取超时，请刷新页面后重试。"
    );

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as WorkoutExerciseRow[];
    setNextWorkoutExercises(rows);
    return rows;
  }

  async function loadCompletedTrainingDetails(workouts: WorkoutRow[]) {
    if (workouts.length === 0) {
      setCompletedExercises([]);
      setSetLogs([]);
      return { completedExercises: [], setLogs: [] };
    }

    const supabase = createBrowserSupabaseClient();
    const workoutIds = workouts.map((workout) => workout.id);
    const { data: exerciseData, error: exerciseError } = await withTimeout(
      supabase
        .from("workout_exercises")
        .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug)")
        .in("workout_id", workoutIds),
      "历史动作读取超时，请刷新页面后重试。"
    );

    if (exerciseError) throw new Error(exerciseError.message);

    const exerciseRows = (exerciseData ?? []) as unknown as WorkoutExerciseRow[];
    setCompletedExercises(exerciseRows);

    const exerciseIds = exerciseRows.map((exercise) => exercise.id);
    if (exerciseIds.length === 0) {
      setSetLogs([]);
      return { completedExercises: exerciseRows, setLogs: [] };
    }

    const { data: logData, error: logError } = await withTimeout(
      supabase
        .from("set_logs")
        .select("workout_exercise_id,actual_weight,actual_reps,completed")
        .in("workout_exercise_id", exerciseIds),
      "历史组记录读取超时，请刷新页面后重试。"
    );

    if (logError) throw new Error(logError.message);

    const rows = (logData ?? []) as SetLogRow[];
    setSetLogs(rows);
    return { completedExercises: exerciseRows, setLogs: rows };
  }

  async function loadRecommendations(userId: string) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await withTimeout(
      supabase
        .from("recommendations")
        .select("id,recommendation_type,previous_weight,suggested_weight,reason,exercises(name)")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(3),
      "建议读取超时，请刷新页面后重试。"
    );

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as RecommendationRow[];
    setRecommendations(rows);
    return rows;
  }

  async function loadPrGoals(userId: string) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await withTimeout(
      supabase
        .from("pr_goals")
        .select("id,target_weight,target_date,exercises(name)")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("target_date", { ascending: true })
        .limit(4),
      "PR 目标读取超时，请刷新页面后重试。"
    );

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as PrGoalRow[];
    setPrGoals(rows);
    return rows;
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen px-4 py-6">
        <section className="mx-auto max-w-3xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-muted">
            <Loader2 className="animate-spin" size={18} />
            正在读取工作台
          </div>
        </section>
      </main>
    );
  }

  if (status === "guest") {
    return (
      <main className="min-h-screen px-4 py-6">
        <section className="mx-auto max-w-3xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">力训周期管家</p>
              <h1 className="text-2xl font-semibold">开始你的力量周期</h1>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-action text-white">
              <Dumbbell size={22} />
            </span>
          </div>
          <p className="text-sm leading-6 text-muted">
            登录后可生成训练计划、记录每组重量、接收调重建议，并安排 PR 测试。
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Link className="inline-flex h-11 items-center justify-center rounded-lg bg-action px-4 font-semibold text-white" href="/login?next=/">
              登录
            </Link>
            <Link className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-field px-4 font-semibold text-ink" href="/plan">
              创建训练计划
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="min-h-screen px-4 py-6">
        <section className="mx-auto max-w-3xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
          <p className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600">{message}</p>
        </section>
      </main>
    );
  }

  const nextWorkoutMeta = nextWorkout ? getWorkoutMeta(nextWorkout.name) : null;
  const nextWorkoutState = nextWorkout ? getNextWorkoutState(nextWorkout.scheduled_date) : null;

  return (
    <main className="app-shell min-h-screen px-4 py-6">
      <section className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start justify-between gap-3 px-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="page-kicker">{email}</p>
              <h1 className="mt-1 text-2xl font-bold">训练工作台</h1>
            </div>
          </div>
          <Link aria-label="打开设置" className="pressable grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink" href="/settings" title="设置">
            <Settings size={18} />
          </Link>
        </header>

        <section className="grid divide-x divide-line overflow-hidden rounded-lg border border-line bg-white sm:grid-cols-3">
          <Metric icon={<CheckCircle2 size={16} />} label="近 12 次训练" value={`${summary.workouts} 次`} />
          <Metric icon={<Activity size={16} />} label="训练量" value={`${Math.round(summary.volume).toLocaleString()} kg`} />
          <Metric icon={<Trophy size={16} />} label="PR 目标" value={`${prGoals.length} 个`} />
        </section>

        {recentTraining ? (
          <Link className="block rounded-lg border border-line bg-white p-4 transition hover:border-action/50 focus:outline-none focus:ring-2 focus:ring-action/40" href={`/history?workout=${recentTraining.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="page-kicker">最近一次训练</p>
                <h2 className="mt-1 font-semibold">{recentTraining.trainingType}</h2>
                <p className="mt-1 text-sm text-muted">{recentTraining.scheduledDate}</p>
              </div>
              <ArrowRight className="mt-1 shrink-0 text-action" size={18} />
            </div>
            <p className="mt-3 text-sm text-muted">{recentTraining.completedSets} 组 · {Math.round(recentTraining.volume).toLocaleString()} kg</p>
          </Link>
        ) : null}

        <section className={`action-surface p-4 ${nextWorkoutMeta?.intent === "强度" ? "tone-intensity" : ""}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${nextWorkoutMeta?.intent === "强度" ? "bg-[#c75c1a]" : "bg-action"}`}>
                <Dumbbell size={20} />
              </span>
              <div>
                <p className="page-kicker">{nextWorkout ? "下一次训练" : "当前状态"}</p>
                <h2 className="text-xl font-bold">{nextWorkout ? nextWorkout.name : "暂无训练计划"}</h2>
              </div>
            </div>
            <Link className="pressable inline-flex items-center gap-1 rounded-md bg-action px-3 py-2 text-sm font-semibold text-white" href={nextWorkout ? "/today" : "/single-workout"}>
              {nextWorkout ? "继续今日计划" : "快速记录自由训练"}
              <ArrowRight size={16} />
            </Link>
          </div>
          {nextWorkout ? (
            <>
              <div className="mb-3 border-y border-action/15 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-ink shadow-sm">
                    <CalendarDays size={14} />
                    {formatWorkoutState(nextWorkoutState)}
                  </span>
                  <span className={`rounded-full bg-white px-2 py-1 font-semibold shadow-sm ${nextWorkoutMeta?.intent === "强度" ? "text-[#c75c1a]" : "text-action"}`}>
                    {nextWorkoutMeta?.label} · {nextWorkoutMeta?.intent}
                  </span>
                  <span className="text-muted">{nextWorkout.scheduled_date}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{nextWorkoutMeta?.focus}</p>
              </div>
              <div className="space-y-2">
                {nextWorkoutExercises.slice(0, 5).map((exercise) => (
                  <div className="flex items-center justify-between border-b border-line/70 px-1 py-2 text-sm last:border-b-0" key={exercise.id}>
                    <span className="font-medium">{exercise.exercises?.name ?? "动作"}</span>
                    <span className="text-action">
                      {formatPrescription({
                        slug: exercise.exercises?.slug,
                        targetSets: exercise.target_sets,
                        targetReps: exercise.target_reps,
                        targetWeight: Number(exercise.target_weight)
                      })}
                    </span>
                  </div>
                ))}
              </div>
              <Link className="pressable mt-4 inline-flex rounded-md border border-action px-3 py-2 text-sm font-semibold text-action" href="/single-workout">
                快速记录自由训练
              </Link>
            </>
          ) : (
            <div className="border-t border-line pt-4">
              <p className="text-sm text-muted">可以先记录一场训练；单次记录会进入历史和进展，但不会生成或修改周期计划。</p>
              <Link className="pressable mt-3 inline-flex rounded-md border border-action px-3 py-2 text-sm font-semibold text-action" href="/plan">
                创建周期计划
              </Link>
            </div>
          )}
        </section>

        <div className="flex items-center justify-between px-1">
          <h2 className="section-heading">训练管理</h2>
          <Link className="pressable inline-flex items-center gap-1 text-sm font-semibold text-action" href="/exercises">
            <BookOpen size={16} />
            动作库
          </Link>
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            actionHref="/plan"
            actionText="查看计划"
            icon={<Brain size={18} />}
            title="待处理建议"
          >
            {recommendations.length > 0 ? (
              <div className="space-y-3">
                {recommendations.map((recommendation) => (
                  <div className="rounded-lg bg-field px-3 py-2 text-sm" key={recommendation.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{recommendation.exercises?.name ?? "动作"}</span>
                      <span className="text-action">
                        {recommendation.previous_weight}kg → {recommendation.suggested_weight}kg
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-muted">{recommendation.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted">暂无待处理建议。完成训练后，Coach 会在这里提示是否加重、保持或降载。</p>
            )}
          </Panel>

          <Panel
            actionHref="/pr"
            actionText="管理 PR"
            icon={<Trophy size={18} />}
            title="PR 倒计时"
          >
            {summary.nearestPr ? (
              <div className="rounded-lg bg-field p-3">
                <p className="font-semibold">
                  {summary.nearestPr.exercises?.name ?? "主项"} {Number(summary.nearestPr.target_weight)}kg
                </p>
                <p className="mt-1 text-sm text-muted">
                  {summary.nearestPr.target_date} · 距离 {getDaysUntilTarget(summary.nearestPr.target_date)} 天
                </p>
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted">还没有 PR 目标。建议在训练稳定 3-4 周后设置一个保守目标。</p>
            )}
          </Panel>
        </section>
      </section>
    </main>
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
    <div className="bg-white px-3 py-4">
      <div className="mb-2 flex items-center gap-2 text-muted">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function Panel({
  actionHref,
  actionText,
  children,
  icon,
  title
}: {
  actionHref: string;
  actionText: string;
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-action/10 text-action">{icon}</span>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <Link className="text-sm font-semibold text-action" href={actionHref}>
          {actionText}
        </Link>
      </div>
      {children}
    </section>
  );
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWorkoutState(state: ReturnType<typeof getNextWorkoutState> | null) {
  if (!state) return "待安排";
  if (state.kind === "today") return "今天训练";
  if (state.kind === "overdue") return `待继续 · 已顺延 ${state.overdueDays} 天`;
  if (state.daysUntil === 1) return "明天训练";
  return `${state.daysUntil} 天后`;
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 10000) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
