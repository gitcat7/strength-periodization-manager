"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, CheckCircle2, Loader2, PlusCircle, XCircle } from "lucide-react";
import type { RecommendationType } from "@/domain/fitness-coach";
import { trackEvent } from "@/lib/analytics";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  formatPrescription,
  getWorkoutMeta,
  pushPullSquatSchedule
} from "@/domain/training-format";
import {
  buildFourWeekProgram,
  getTemplateType,
  type ExerciseProfile,
  type PlannedWorkout,
  type TemplateType
} from "@/domain/program";

type ProgramRow = {
  id: string;
  name: string;
  template_type: TemplateType;
  status: string;
  start_date: string;
  end_date: string;
};

type WorkoutRow = {
  id: string;
  scheduled_date: string;
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

type RecommendationRow = {
  id: string;
  exercise_id: string;
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
  workouts: {
    scheduled_date: string;
    name: string;
  } | null;
};

type ExerciseRow = {
  id: string;
  slug: string;
  name: string;
  default_increment: number;
};

type LiftProfileRow = {
  exercise_id: string;
  estimated_1rm: number;
  training_max: number;
};

type AthleteProfileRow = {
  training_days_per_week: number;
  available_weekdays: number[];
};

export function ProgramManager() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [program, setProgram] = useState<ProgramRow | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationRow[]>([]);
  const [recommendationWeights, setRecommendationWeights] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "generating" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadCurrentProgram();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const workoutExercisesByWorkoutId = useMemo(() => {
    return workoutExercises.reduce<Record<string, WorkoutExerciseRow[]>>((groups, item) => {
      groups[item.workout_id] = [...(groups[item.workout_id] ?? []), item].sort(
        (a, b) => a.order_index - b.order_index
      );
      return groups;
    }, {});
  }, [workoutExercises]);

  async function loadCurrentProgram() {
    setStatus("loading");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/login?next=/plan");
      return;
    }

    setUserId(userData.user.id);
    await loadRecommendations(userData.user.id);

    const { data: programData, error: programError } = await supabase
      .from("programs")
      .select("id,name,template_type,status,start_date,end_date")
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (programError) {
      setStatus("error");
      setMessage(programError.message);
      return;
    }

    if (!programData) {
      setProgram(null);
      setWorkouts([]);
      setWorkoutExercises([]);
      setStatus("ready");
      return;
    }

    setProgram(programData as ProgramRow);
    await loadWorkouts(programData.id);
    setStatus("ready");
  }

  async function loadRecommendations(targetUserId: string) {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("recommendations")
      .select("id,exercise_id,workout_id,recommendation_type,previous_weight,suggested_weight,reason,status,exercises(name,slug),workouts(scheduled_date,name)")
      .eq("user_id", targetUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    const rows = (data ?? []) as unknown as RecommendationRow[];
    setRecommendations(rows);
    setRecommendationWeights(
      Object.fromEntries(rows.map((recommendation) => [recommendation.id, String(recommendation.suggested_weight)]))
    );
  }

  async function loadWorkouts(programId: string) {
    const supabase = createBrowserSupabaseClient();
    const { data: workoutData, error: workoutError } = await supabase
      .from("workouts")
      .select("id,scheduled_date,name,status")
      .eq("program_id", programId)
      .order("scheduled_date", { ascending: true });

    if (workoutError) {
      setStatus("error");
      setMessage(workoutError.message);
      return;
    }

    const workoutIds = (workoutData ?? []).map((workout) => workout.id);
    setWorkouts((workoutData ?? []) as WorkoutRow[]);

    if (workoutIds.length === 0) {
      setWorkoutExercises([]);
      return;
    }

    const { data: exerciseData, error: exerciseError } = await supabase
      .from("workout_exercises")
      .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug)")
      .in("workout_id", workoutIds)
      .order("order_index", { ascending: true });

    if (exerciseError) {
      setStatus("error");
      setMessage(exerciseError.message);
      return;
    }

    setWorkoutExercises((exerciseData ?? []) as unknown as WorkoutExerciseRow[]);
  }

  async function acceptRecommendation(recommendation: RecommendationRow) {
    if (!program || !userId) return;

    const appliedWeight = Number(recommendationWeights[recommendation.id] ?? recommendation.suggested_weight);
    if (!appliedWeight || appliedWeight <= 0) {
      setStatus("error");
      setMessage("请输入有效的建议重量。");
      return;
    }

    setStatus("generating");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const sourceDate = recommendation.workouts?.scheduled_date ?? formatDate(new Date());
    const { data: futureWorkouts, error: futureWorkoutError } = await supabase
      .from("workouts")
      .select("id")
      .eq("program_id", program.id)
      .gt("scheduled_date", sourceDate)
      .neq("status", "completed");

    if (futureWorkoutError) {
      setStatus("error");
      setMessage(futureWorkoutError.message);
      return;
    }

    const workoutIds = (futureWorkouts ?? []).map((workout) => workout.id);
    if (workoutIds.length === 0) {
      setStatus("ready");
      setMessage("当前周期没有可应用的后续训练日。");
      return;
    }

    const { error: updateExerciseError } = await supabase
      .from("workout_exercises")
      .update({
        target_weight: appliedWeight
      })
      .eq("exercise_id", recommendation.exercise_id)
      .in("workout_id", workoutIds);

    if (updateExerciseError) {
      setStatus("error");
      setMessage(updateExerciseError.message);
      return;
    }

    const recommendationStatus =
      Number(appliedWeight) === Number(recommendation.suggested_weight) ? "accepted" : "modified";
    const { error: updateRecommendationError } = await supabase
      .from("recommendations")
      .update({
        status: recommendationStatus,
        suggested_weight: appliedWeight,
        updated_at: new Date().toISOString()
      })
      .eq("id", recommendation.id);

    if (updateRecommendationError) {
      setStatus("error");
      setMessage(updateRecommendationError.message);
      return;
    }

    await trackEvent({
      eventName: recommendationStatus === "accepted" ? "recommendation_accepted" : "recommendation_modified",
      properties: {
        exercise_slug: recommendation.exercises?.slug,
        previous_weight: recommendation.previous_weight,
        suggested_weight: recommendation.suggested_weight,
        applied_weight: appliedWeight
      },
      supabase,
      userId
    });

    setMessage(`${recommendation.exercises?.name ?? "动作"} 的后续计划已更新为 ${appliedWeight}kg。`);
    await loadRecommendations(userId);
    await loadWorkouts(program.id);
    setStatus("ready");
  }

  async function rejectRecommendation(recommendationId: string) {
    if (!userId) return;

    setStatus("generating");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("recommendations")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString()
      })
      .eq("id", recommendationId);

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    await trackEvent({
      eventName: "recommendation_rejected",
      properties: {
        recommendation_id: recommendationId
      },
      supabase,
      userId
    });

    setMessage("已忽略该建议。");
    await loadRecommendations(userId);
    setStatus("ready");
  }

  async function generateProgram() {
    if (!userId) return;

    setStatus("generating");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from("athlete_profiles")
      .select("training_days_per_week,available_weekdays")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      setStatus("error");
      setMessage(profileError?.message ?? "请先创建训练画像。");
      return;
    }

    const athleteProfile = profile as AthleteProfileRow;
    const templateType = getTemplateType(athleteProfile.training_days_per_week);

    const { data: exercises, error: exercisesError } = await supabase
      .from("exercises")
      .select("id,slug,name,default_increment");

    if (exercisesError || !exercises) {
      setStatus("error");
      setMessage(exercisesError?.message ?? "动作数据读取失败。");
      return;
    }

    const { data: liftProfiles, error: liftError } = await supabase
      .from("lift_profiles")
      .select("exercise_id,estimated_1rm,training_max")
      .eq("user_id", userId);

    if (liftError || !liftProfiles) {
      setStatus("error");
      setMessage(liftError?.message ?? "主项水平读取失败。");
      return;
    }

    const exerciseRows = exercises as ExerciseRow[];
    const exerciseById = new Map(exerciseRows.map((exercise) => [exercise.id, exercise]));
    const liftRows = liftProfiles as LiftProfileRow[];
    const exerciseProfiles: ExerciseProfile[] = liftRows
      .map((lift) => {
        const exercise = exerciseById.get(lift.exercise_id);
        if (!exercise) return null;

        return {
          id: exercise.id,
          slug: exercise.slug,
          workingWeight: inferFiveRepWorkingWeight(
            Number(lift.estimated_1rm),
            Number(exercise.default_increment) || 2.5
          ),
          increment: Number(exercise.default_increment) || 2.5
        };
      })
      .filter(Boolean) as ExerciseProfile[];

    const accessoryProfiles: ExerciseProfile[] = deriveAccessoryProfiles(exerciseRows, exerciseProfiles);
    const plannedWorkouts = buildFourWeekProgram({
      templateType,
      availableWeekdays: athleteProfile.available_weekdays,
      exerciseProfiles: [...exerciseProfiles, ...accessoryProfiles]
    });

    const { error: archiveError } = await supabase
      .from("programs")
      .update({
        status: "archived",
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("status", "active");

    if (archiveError) {
      setStatus("error");
      setMessage(archiveError.message);
      return;
    }

    const createdProgram = await createProgramWithWorkouts({
      userId,
      templateType,
      plannedWorkouts,
      exerciseRows
    });

    if (!createdProgram.ok) {
      setStatus("error");
      setMessage(createdProgram.message);
      return;
    }

    await trackEvent({
      eventName: "program_generated",
      properties: {
        template_type: templateType,
        workouts: plannedWorkouts.length
      },
      supabase,
      userId
    });

    setMessage("训练计划已生成。");
    await loadCurrentProgram();
  }

  async function createProgramWithWorkouts({
    userId,
    templateType,
    plannedWorkouts,
    exerciseRows
  }: {
    userId: string;
    templateType: TemplateType;
    plannedWorkouts: PlannedWorkout[];
    exerciseRows: ExerciseRow[];
  }) {
    const supabase = createBrowserSupabaseClient();
    const exerciseBySlug = new Map(exerciseRows.map((exercise) => [exercise.slug, exercise]));
    const startDate = plannedWorkouts[0]?.scheduledDate;
    const endDate = plannedWorkouts[plannedWorkouts.length - 1]?.scheduledDate;

    if (!startDate || !endDate) {
      return { ok: false, message: "没有可生成的训练日。" };
    }

    const { data: programData, error: programError } = await supabase
      .from("programs")
      .insert({
        user_id: userId,
        name: getProgramName(templateType),
        template_type: templateType,
        status: "active",
        start_date: startDate,
        end_date: endDate
      })
      .select("id,name,template_type,status,start_date,end_date")
      .single();

    if (programError || !programData) {
      return { ok: false, message: programError?.message ?? "计划创建失败。" };
    }

    for (const plannedWorkout of plannedWorkouts) {
      const { data: workoutData, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          program_id: programData.id,
          user_id: userId,
          scheduled_date: plannedWorkout.scheduledDate,
          name: plannedWorkout.name,
          status: "scheduled"
        })
        .select("id")
        .single();

      if (workoutError || !workoutData) {
        return { ok: false, message: workoutError?.message ?? "训练日创建失败。" };
      }

      const workoutExercisePayload = plannedWorkout.exercises.flatMap((exercise, index) => {
          const exerciseRow = exerciseBySlug.get(exercise.exerciseSlug);
          if (!exerciseRow) return [];

          return [{
            workout_id: workoutData.id,
            exercise_id: exerciseRow.id,
            order_index: index + 1,
            target_sets: exercise.targetSets,
            target_reps: exercise.targetReps,
            target_weight: exercise.targetWeight
          }];
        });

      const { error: workoutExerciseError } = await supabase
        .from("workout_exercises")
        .insert(workoutExercisePayload);

      if (workoutExerciseError) {
        return { ok: false, message: workoutExerciseError.message };
      }
    }

    return { ok: true, message: "ok" };
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取当前训练计划
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-7">
        {pushPullSquatSchedule.map((day) => (
          <article className="rounded-xl border border-line bg-white p-4" key={day.key}>
            <p className="text-xs text-muted">{day.intent}</p>
            <h2 className="mt-1 text-xl font-semibold">{day.label}</h2>
            <p className="mt-3 text-xs leading-5 text-muted">{day.focus}</p>
          </article>
        ))}
      </section>

      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${status === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
          {message}
        </p>
      ) : null}

      {!program ? (
        <section className="rounded-xl border border-line p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
              <PlusCircle size={20} />
            </span>
            <div>
              <h2 className="font-semibold">还没有当前训练计划</h2>
              <p className="text-sm text-muted">基于推/拉/蹲 + A/B 格式生成 4 周训练计划。</p>
            </div>
          </div>
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "generating"}
            onClick={generateProgram}
            type="button"
          >
            {status === "generating" ? <Loader2 className="animate-spin" size={18} /> : <PlusCircle size={18} />}
            生成 4 周训练计划
          </button>
          <Link className="mt-3 inline-flex text-sm font-semibold text-action" href="/onboarding">
            返回修改训练画像
          </Link>
        </section>
      ) : (
        <section className="rounded-xl border border-line p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
              <CheckCircle2 size={20} />
            </span>
            <div>
              <h2 className="font-semibold">{program.name}</h2>
              <p className="text-sm text-muted">
                {program.start_date} 至 {program.end_date}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-flex rounded-lg bg-action px-4 py-2 font-semibold text-white" href="/today">
              查看今日训练
            </Link>
            <button
              className="inline-flex rounded-lg border border-line px-4 py-2 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status === "generating"}
              onClick={generateProgram}
              type="button"
            >
              重新生成计划
            </button>
          </div>
        </section>
      )}

      {recommendations.length > 0 ? (
        <section className="rounded-xl border border-line bg-white p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
              <Brain size={20} />
            </span>
            <div>
              <h2 className="font-semibold">Fitness Coach 建议</h2>
              <p className="text-sm text-muted">训练完成后生成，可一键应用到当前周期后续训练日。</p>
            </div>
          </div>
          <div className="space-y-3">
            {recommendations.map((recommendation) => (
              <article className="rounded-lg bg-field p-3" key={recommendation.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{recommendation.exercises?.name ?? "动作"}</h3>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-action">
                        {formatRecommendationType(recommendation.recommendation_type)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {recommendation.previous_weight}kg → {recommendation.suggested_weight}kg
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">{recommendation.reason}</p>
                    <label className="mt-3 block max-w-40">
                      <span className="mb-1 block text-xs text-muted">应用重量 kg</span>
                      <input
                        className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none ring-action/20 transition focus:border-action focus:ring-4"
                        min="0"
                        onChange={(event) =>
                          setRecommendationWeights((current) => ({
                            ...current,
                            [recommendation.id]: event.target.value
                          }))
                        }
                        step="0.5"
                        type="number"
                        value={recommendationWeights[recommendation.id] ?? String(recommendation.suggested_weight)}
                      />
                    </label>
                    {recommendation.workouts ? (
                      <p className="mt-2 text-xs text-muted">
                        来源：{recommendation.workouts.scheduled_date} · {recommendation.workouts.name}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-48">
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-action px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={status === "generating"}
                      onClick={() => acceptRecommendation(recommendation)}
                      type="button"
                    >
                      <CheckCircle2 size={16} />
                      应用
                    </button>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={status === "generating"}
                      onClick={() => rejectRecommendation(recommendation.id)}
                      type="button"
                    >
                      <XCircle size={16} />
                      忽略
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {workouts.length > 0 ? (
        <section className="space-y-3">
          {workouts.map((workout) => (
            <article className="rounded-xl border border-line bg-white p-4" key={workout.id}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">{workout.scheduled_date}</p>
                  <h3 className="font-semibold">{workout.name}</h3>
                  <p className="mt-1 text-sm text-muted">{getWorkoutMeta(workout.name).focus}</p>
                </div>
                <span className="rounded-full bg-action/10 px-3 py-1 text-xs font-semibold text-action">
                  {getWorkoutMeta(workout.name).intent}
                </span>
              </div>
              <div className="space-y-2">
                {(workoutExercisesByWorkoutId[workout.id] ?? []).map((exercise) => (
                  <div className="flex items-center justify-between rounded-lg bg-field px-3 py-2 text-sm" key={exercise.id}>
                    <span>{exercise.exercises?.name ?? "动作"}</span>
                    <span className="font-semibold">
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
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function getProgramName(templateType: TemplateType) {
  if (templateType === "push_pull_squat") {
    return "推/拉/蹲 A-B 周期";
  }

  if (templateType === "four_day_upper_lower") {
    return "4 天推/拉/蹲过渡计划";
  }

  return "3 天推/拉/蹲基础计划";
}

function deriveAccessoryProfiles(exercises: ExerciseRow[], mainProfiles: ExerciseProfile[]) {
  const profileBySlug = new Map(mainProfiles.map((profile) => [profile.slug, profile]));
  const squat = profileBySlug.get("back_squat");
  const deadlift = profileBySlug.get("deadlift");
  const bench = profileBySlug.get("bench_press");
  const press = profileBySlug.get("overhead_press");
  const row = profileBySlug.get("barbell_row");

  const estimates: Record<string, number> = {
    barbell_row: (bench?.workingWeight ?? press?.workingWeight ?? 40) * 0.95,
    pull_up: 0,
    lat_pulldown: (row?.workingWeight ?? bench?.workingWeight ?? 60) * 0.8,
    romanian_deadlift: (deadlift?.workingWeight ?? squat?.workingWeight ?? 80) * 0.78,
    leg_press: (squat?.workingWeight ?? 80) * 1.3,
    leg_curl: (squat?.workingWeight ?? 80) * 0.45,
    incline_dumbbell_press: (bench?.workingWeight ?? 60) * 0.38,
    lateral_raise: 8,
    triceps_pushdown: (bench?.workingWeight ?? 60) * 0.28,
    seated_cable_row: (row?.workingWeight ?? bench?.workingWeight ?? 60) * 0.75,
    face_pull: 12,
    dumbbell_curl: 12,
    standing_calf_raise: (squat?.workingWeight ?? 80) * 0.55,
    cardio_zone2: 0
  };

  return exercises
    .filter((exercise) => estimates[exercise.slug] !== undefined && !profileBySlug.has(exercise.slug))
    .map((exercise) => ({
      id: exercise.id,
      slug: exercise.slug,
      workingWeight: estimates[exercise.slug],
      increment: Number(exercise.default_increment) || 2.5
    }));
}

function inferFiveRepWorkingWeight(estimatedOneRepMax: number, increment: number) {
  if (estimatedOneRepMax <= 0) {
    return 0;
  }

  return Math.round((estimatedOneRepMax / (1 + 5 / 30)) / increment) * increment;
}

function formatRecommendationType(type: RecommendationType) {
  if (type === "increase") return "加重";
  if (type === "decrease") return "降重";
  if (type === "deload") return "减量恢复";
  return "保持";
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
