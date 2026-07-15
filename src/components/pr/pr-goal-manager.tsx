"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Loader2, Target, Trophy, XCircle } from "lucide-react";
import {
  assessPrGoal,
  buildAttemptPlan,
  getDaysUntilTarget,
  getDefaultTargetDate,
  getPrPhase,
  getPrPhaseAdvice,
  getPrPhaseLabel
} from "@/domain/pr-planner";
import { trackEvent } from "@/lib/analytics";
import { clearTrainingDataCaches, readClientCache, writeClientCache } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ExerciseRow = {
  id: string;
  slug: string;
  name: string;
  default_increment: number;
  is_main_lift: boolean;
};

type LiftProfileRow = {
  exercise_id: string;
  estimated_1rm: number;
};

type PrGoalRow = {
  id: string;
  exercise_id: string;
  current_estimated_1rm: number;
  target_weight: number;
  target_date: string;
  status: "active" | "completed" | "cancelled";
  exercises: {
    name: string;
    slug: string;
    default_increment: number;
  } | null;
};

type PrCache = {
  exerciseId: string;
  exercises: ExerciseRow[];
  goals: PrGoalRow[];
  liftProfiles: LiftProfileRow[];
  targetWeight: string;
  userId: string;
};

const prCacheKey = "strength-training-cache:pr";

export function PrGoalManager() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [liftProfiles, setLiftProfiles] = useState<LiftProfileRow[]>([]);
  const [goals, setGoals] = useState<PrGoalRow[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [targetDate, setTargetDate] = useState(getDefaultTargetDate());
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const cached = readClientCache<PrCache>(prCacheKey);
    if (cached) {
      setUserId(cached.userId);
      setExercises(cached.exercises);
      setLiftProfiles(cached.liftProfiles);
      setGoals(cached.goals);
      setExerciseId(cached.exerciseId);
      setTargetWeight(cached.targetWeight);
      setStatus("ready");
    }

    loadPrData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedExercise = useMemo(
    () => exercises.find((exercise) => exercise.id === exerciseId) ?? null,
    [exerciseId, exercises]
  );

  const selectedLiftProfile = useMemo(
    () => liftProfiles.find((profile) => profile.exercise_id === exerciseId) ?? null,
    [exerciseId, liftProfiles]
  );

  async function loadPrData() {
    setStatus("loading");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      "登录状态读取超时，请重新登录。"
    );

    if (sessionError || !sessionData.session?.user) {
      router.replace("/login?next=/pr");
      return;
    }

    const currentUserId = sessionData.session.user.id;
    setUserId(currentUserId);

    const [exerciseResult, liftResult, goalResult] = await Promise.all([
      supabase
        .from("exercises")
        .select("id,slug,name,default_increment,is_main_lift")
        .eq("is_main_lift", true)
        .order("name", { ascending: true }),
      supabase
        .from("lift_profiles")
        .select("exercise_id,estimated_1rm")
        .eq("user_id", currentUserId),
      supabase
        .from("pr_goals")
        .select("id,exercise_id,current_estimated_1rm,target_weight,target_date,status,exercises(name,slug,default_increment)")
        .eq("user_id", currentUserId)
        .eq("status", "active")
        .order("target_date", { ascending: true })
    ]);

    const { data: exerciseData, error: exerciseError } = exerciseResult;

    if (exerciseError) {
      setStatus("error");
      setMessage(exerciseError.message);
      return;
    }

    const { data: liftData, error: liftError } = liftResult;

    if (liftError) {
      setStatus("error");
      setMessage(liftError.message);
      return;
    }

    const { data: goalData, error: goalError } = goalResult;

    if (goalError) {
      setStatus("error");
      setMessage(goalError.message);
      return;
    }

    const exerciseRows = (exerciseData ?? []) as ExerciseRow[];
    const liftRows = (liftData ?? []) as LiftProfileRow[];
    setExercises(exerciseRows);
    setLiftProfiles(liftRows);
    setGoals((goalData ?? []) as unknown as PrGoalRow[]);

    const firstLift = liftRows.find((lift) => exerciseRows.some((exercise) => exercise.id === lift.exercise_id));
    const defaultExerciseId = firstLift?.exercise_id ?? exerciseRows[0]?.id ?? "";
    setExerciseId(defaultExerciseId);

    if (firstLift) {
      setTargetWeight(String(roundDisplayWeight(Number(firstLift.estimated_1rm) * 1.05)));
    }

    writeClientCache<PrCache>(prCacheKey, {
      exerciseId: defaultExerciseId,
      exercises: exerciseRows,
      goals: (goalData ?? []) as unknown as PrGoalRow[],
      liftProfiles: liftRows,
      targetWeight: firstLift ? String(roundDisplayWeight(Number(firstLift.estimated_1rm) * 1.05)) : targetWeight,
      userId: currentUserId
    });
    setStatus("ready");
  }

  async function saveGoal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !selectedExercise) return;

    const estimatedOneRm = Number(selectedLiftProfile?.estimated_1rm ?? 0);
    const parsedTargetWeight = Number(targetWeight);

    if (!estimatedOneRm) {
      setStatus("error");
      setMessage("请先在训练画像中录入该动作的最近工作组。");
      return;
    }

    if (!parsedTargetWeight || parsedTargetWeight <= 0) {
      setStatus("error");
      setMessage("请输入有效的 PR 目标重量。");
      return;
    }

    setStatus("saving");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { error: archiveError } = await supabase
      .from("pr_goals")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("exercise_id", selectedExercise.id)
      .eq("status", "active");

    if (archiveError) {
      setStatus("error");
      setMessage(archiveError.message);
      return;
    }

    const { error: insertError } = await supabase.from("pr_goals").insert({
      user_id: userId,
      exercise_id: selectedExercise.id,
      current_estimated_1rm: estimatedOneRm,
      target_weight: parsedTargetWeight,
      target_date: targetDate,
      status: "active"
    });

    if (insertError) {
      setStatus("error");
      setMessage(insertError.message);
      return;
    }

    clearTrainingDataCaches();
    await trackEvent({
      eventName: "pr_goal_created",
      properties: {
        exercise_slug: selectedExercise.slug,
        target_date: targetDate,
        target_weight: parsedTargetWeight
      },
      supabase,
      userId
    });

    setMessage("PR 目标已创建。");
    await loadPrData();
  }

  async function updateSingleGoalStatus(goalId: string, nextStatus: "completed" | "cancelled") {
    const goal = goals.find((item) => item.id === goalId);

    setStatus("saving");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("pr_goals")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", goalId);

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    clearTrainingDataCaches();
    await trackEvent({
      eventName: nextStatus === "completed" ? "pr_goal_completed" : "pr_goal_cancelled",
      properties: {
        exercise_slug: goal?.exercises?.slug,
        target_date: goal?.target_date,
        target_weight: goal?.target_weight
      },
      supabase,
      userId
    });

    setGoals((currentGoals) => currentGoals.filter((item) => item.id !== goalId));
    setMessage(nextStatus === "completed" ? "已标记 PR 完成。" : "已取消当前 PR 目标。");
    setStatus("ready");
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取 PR 目标
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${status === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
          {message}
        </p>
      ) : null}

      {goals.length > 0 ? (
        <section className="space-y-4">
          {goals.map((goal) => {
            const activeGoalPlan = buildGoalPlan(goal);
            const assessment = assessPrGoal({
              currentEstimatedOneRm: Number(goal.current_estimated_1rm),
              daysUntilTarget: activeGoalPlan.daysUntilTarget,
              targetWeight: Number(goal.target_weight)
            });

            return (
              <article className="space-y-4 rounded-xl border border-line bg-white p-4" key={goal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#c75c1a]/10 text-[#c75c1a]">
                      <Target size={20} />
                    </span>
                    <div>
                      <p className="text-sm text-muted">当前 PR 目标</p>
                      <h2 className="mt-0.5 text-2xl font-semibold">
                        {goal.exercises?.name ?? "主项"} {Number(goal.target_weight)}kg
                      </h2>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#c75c1a]/10 px-3 py-1 text-sm font-semibold text-[#c75c1a]">
                    {activeGoalPlan.daysUntilTarget >= 0 ? `${activeGoalPlan.daysUntilTarget} 天` : "已过期"}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="当前估算 1RM" value={`${Number(goal.current_estimated_1rm).toFixed(1)}kg`} />
                  <Metric label="目标日期" value={goal.target_date} />
                  <Metric label="当前阶段" value={getPrPhaseLabel(activeGoalPlan.phase)} />
                </div>

                <div className={`rounded-lg border px-4 py-3 ${getAssessmentClassName(assessment.level)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{assessment.label}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold">
                      当前 1RM 的 {Math.round(assessment.ratio * 100)}%
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6">{assessment.message}</p>
                </div>

                <div className="rounded-lg bg-field p-4">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <CalendarDays size={18} className="text-action" />
                    阶段建议
                  </div>
                  <p className="text-sm leading-6 text-muted">{getPrPhaseAdvice(activeGoalPlan.phase)}</p>
                </div>

                <div>
                  <h3 className="mb-3 font-semibold">测试日三把建议</h3>
                  <div className="space-y-2">
                    {activeGoalPlan.attempts.map((attempt) => (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-3" key={attempt.label}>
                        <div>
                          <p className="font-semibold">{attempt.label}</p>
                          <p className="text-sm text-muted">{attempt.note}</p>
                        </div>
                        <p className="text-lg font-semibold text-action">{attempt.weight}kg</p>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm leading-6 text-muted">
                  PR 测试前请充分热身，优先选择有保护或安全杆的环境。任何疼痛、动作变形或速度明显崩掉，都应该停止加重。
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#c75c1a] px-4 font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={status === "saving"}
                    onClick={() => updateSingleGoalStatus(goal.id, "completed")}
                    type="button"
                  >
                    <CheckCircle2 size={18} />
                    标记完成
                  </button>
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 font-semibold text-ink transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={status === "saving"}
                    onClick={() => updateSingleGoalStatus(goal.id, "cancelled")}
                    type="button"
                  >
                    <XCircle size={18} />
                    取消目标
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      <form className="space-y-4 rounded-xl border border-line bg-white p-4" onSubmit={saveGoal}>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#c75c1a]/10 text-[#c75c1a]">
            <Target size={20} />
          </span>
          <div>
            <h2 className="font-semibold">{goals.length > 0 ? "添加或更新 PR 目标" : "创建 PR 目标"}</h2>
            <p className="text-sm text-muted">同一动作只保留一个 active 目标，不同动作可以同时存在。</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">动作</span>
          <select
            className="h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
            value={exerciseId}
            onChange={(event) => setExerciseId(event.target.value)}
            required
          >
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">目标重量 kg</span>
            <input
              className="h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
              min="1"
              step="0.5"
              type="number"
              value={targetWeight}
              onChange={(event) => setTargetWeight(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">目标日期</span>
            <input
              className="h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              required
            />
          </label>
        </div>

        {selectedLiftProfile ? (
          <p className="text-sm text-muted">
            当前估算 1RM：{Number(selectedLiftProfile.estimated_1rm).toFixed(1)}kg。建议目标设置在当前估算 1RM 的 102%-108%。
          </p>
        ) : (
          <p className="text-sm text-red-600">该动作还没有训练画像数据，请先回到画像页录入最近工作组。</p>
        )}

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === "saving" || !selectedLiftProfile}
          type="submit"
        >
          {status === "saving" ? <Loader2 className="animate-spin" size={18} /> : <Trophy size={18} />}
          保存 PR 目标
        </button>
      </form>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-field p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function buildGoalPlan(goal: PrGoalRow) {
  const daysUntilTarget = getDaysUntilTarget(goal.target_date);
  const phase = getPrPhase(daysUntilTarget);
  const increment = Number(goal.exercises?.default_increment) || 2.5;

  return {
    daysUntilTarget,
    phase,
    attempts: buildAttemptPlan(
      Number(goal.current_estimated_1rm),
      Number(goal.target_weight),
      increment
    )
  };
}

function getAssessmentClassName(level: "conservative" | "reasonable" | "aggressive" | "overdue") {
  if (level === "reasonable") return "border-action/20 bg-action/5 text-ink";
  if (level === "conservative") return "border-line bg-field text-ink";
  if (level === "overdue") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber/30 bg-amber/10 text-amber-900";
}

function roundDisplayWeight(weight: number) {
  return Math.round(weight * 2) / 2;
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 10000) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
