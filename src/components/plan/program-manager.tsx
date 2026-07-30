"use client";

import { DB_TABLE } from "../../lib/supabase/table-names";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brain, CheckCircle2, Dumbbell, Loader2, Moon, Pause, Play, PlusCircle, XCircle } from "lucide-react";
import type { RecommendationType } from "@/domain/fitness-coach";
import { getNextWorkoutState } from "@/domain/next-workout";
import { getScheduleItemPresentation } from "@/domain/rest-day-presentation";
import {
  sessionDurationOptions,
  validatePlanSetup,
  type PlanSetupInput,
  type PlanSetupValidationResult
} from "@/domain/plan-setup";
import { calculateTrainingMax, estimateOneRepMax, roundToNearestPlate } from "@/domain/strength";
import { trackEvent } from "@/lib/analytics";
import {
  clearProgramRegenerationCaches,
  clearTrainingDataCaches,
  readClientCache,
  writeClientCache
} from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { getUserScopedCache } from "@/lib/user-scoped-cache";
import { loadWorkoutsWithDayTypeFallback } from "@/lib/workout-day-type-compat";
import {
  formatPrescription,
  getWorkoutMeta
} from "@/domain/training-format";
import {
  buildFourWeekProgram,
  type ExerciseProfile,
  templateOptions,
  type ProgramTemplateType,
  type ScheduleConfig,
  type LegacyScheduleMode,
  type TemplateType
} from "@/domain/program";
import type { HolidayPolicy, ScheduleRule } from "@/domain/schedule-rule";
import {
  buildResumePreview,
  getRecoveryLoadAdvice,
  type PauseReason,
  type PendingTraining,
  type ResumeRoute
} from "@/domain/schedule-adjustment";
import { buildScheduleReflowPayload, type ReflowScheduleItem } from "@/domain/schedule-reflow-payload";
import { ScheduleRuleFields } from "./schedule-rule-fields";
import { ScheduleAdjustmentDialog } from "./schedule-adjustment-dialog";
import { UnavailableDateManager, type UnavailableDateItem } from "./unavailable-date-manager";
import {
  buildProgramReplacementPayload,
  buildRegenerationPreview,
  type ProgramReplacementPayload
} from "@/domain/program-regeneration";
import { ProgramRegenerationDialog } from "./program-regeneration-dialog";
import { resolveProgramRegenerationOutcome } from "./program-regeneration-outcome";
import {
  buildConfirmationPayload,
  createRegenerationDialogState,
  reduceRegenerationDialog
} from "./program-regeneration-dialog-state";

type ProgramRow = {
  id: string;
  name: string;
  template_type: ProgramTemplateType;
  schedule_mode: LegacyScheduleMode;
  schedule_config: Record<string, unknown>;
  custom_template_name: string | null;
  status: string;
  start_date: string;
  end_date: string;
  schedule_revision?: number;
  holiday_policy?: HolidayPolicy;
};

type WorkoutRow = {
  day_type: "training" | "rest";
  id: string;
  schedule_index: number;
  scheduled_date: string;
  sequence_index: number | null;
  cycle_index?: number | null;
  cycle_position?: number | null;
  name: string;
  status: string;
};

type ScheduleEventRow = {
  id: string;
  event_type: string;
  effective_date: string;
  metadata: Record<string, unknown> | null;
  schedule_revision: number;
  created_at: string;
};

type AdjustmentDialogState = {
  action: "resume" | "extra_rest";
  selectedRoute: ResumeRoute | null;
  injuryAcknowledged: boolean;
  busy: boolean;
  errorMessage: string | null;
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
    sequence_index: number;
    name: string;
  } | null;
};

type ExerciseRow = {
  id: string;
  slug: string;
  name: string;
  default_increment: number;
  is_main_lift?: boolean;
};

type LiftProfileRow = {
  exercise_id: string;
  estimated_1rm: number;
  training_max: number;
};

const weekdayOptions = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" }
];

type PlanCache = {
  program: ProgramRow | null;
  recommendationWeights: Record<string, string>;
  recommendations: RecommendationRow[];
  userId: string;
  workoutExercises: WorkoutExerciseRow[];
  workouts: WorkoutRow[];
};

const planCacheKey = "strength-training-cache:plan";

const defaultPlanSetup: PlanSetupInput = {
  experienceLevel: "",
  goal: "strength",
  injuryNotes: "",
  lifts: [],
  weekCount: 4,
  sessionDurationMinutes: 60
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
  const [usesLegacyScheduleSchema, setUsesLegacyScheduleSchema] = useState(false);
  const [message, setMessage] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("push_pull_squat");
  const [scheduleRule, setScheduleRule] = useState<ScheduleRule>({ mode: "fixed_weekdays", weekdays: [1, 3, 5] });
  const [holidayPolicy, setHolidayPolicy] = useState<HolidayPolicy>("train");
  const [holidayDates, setHolidayDates] = useState<Array<{ date: string; name: string }>>([]);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [useCustomName, setUseCustomName] = useState(false);
  const [mainLifts, setMainLifts] = useState<ExerciseRow[]>([]);
  const [planSetup, setPlanSetup] = useState<PlanSetupInput>(defaultPlanSetup);
  const [planSetupErrors, setPlanSetupErrors] = useState<Record<string, string>>({});
  const [showPlanSetup, setShowPlanSetup] = useState(false);
  const [regenerationDialog, setRegenerationDialog] = useState(createRegenerationDialogState);
  const [scheduleAdjustmentSupported, setScheduleAdjustmentSupported] = useState(true);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEventRow[]>([]);
  const [unavailableDates, setUnavailableDates] = useState<UnavailableDateItem[]>([]);
  const [adjustmentDialog, setAdjustmentDialog] = useState<AdjustmentDialogState | null>(null);
  const [showPauseForm, setShowPauseForm] = useState(false);
  const [pauseReason, setPauseReason] = useState<PauseReason>("fatigue");
  const [pauseResumeDate, setPauseResumeDate] = useState("");
  const [scheduleActionBusy, setScheduleActionBusy] = useState(false);
  const confirmationInFlight = useRef(false);
  const pendingReplacementPayload = useRef<ProgramReplacementPayload | null>(null);
  const regenerationTriggerRef = useRef<HTMLButtonElement>(null);
  const firstScheduleItemRef = useRef<HTMLElement>(null);

  useEffect(() => {
    loadCurrentProgram();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadHolidayDates() {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.from(DB_TABLE.calendarDates).select("date,name");
      if (data) setHolidayDates(data as Array<{ date: string; name: string }>);
    }
    void loadHolidayDates();
  }, []);

  const workoutExercisesByWorkoutId = useMemo(() => {
    return workoutExercises.reduce<Record<string, WorkoutExerciseRow[]>>((groups, item) => {
      groups[item.workout_id] = [...(groups[item.workout_id] ?? []), item].sort(
        (a, b) => a.order_index - b.order_index
      );
      return groups;
    }, {});
  }, [workoutExercises]);

  const pauseState = useMemo(() => {
    // Schedule events load newest-first, so the first row decides the pause state.
    const latestEvent = scheduleEvents[0] ?? null;
    if (latestEvent?.event_type !== "pause_started") {
      return { paused: false, event: null as ScheduleEventRow | null, reason: null as PauseReason | null, resumeDate: null as string | null };
    }
    const metadata = latestEvent.metadata ?? {};
    return {
      paused: true,
      event: latestEvent,
      reason: typeof metadata.reason === "string" ? (metadata.reason as PauseReason) : null,
      resumeDate: typeof metadata.resume_date === "string" ? metadata.resume_date : null
    };
  }, [scheduleEvents]);

  const templateLength = useMemo(() => {
    const positions = workouts
      .filter((workout) => workout.day_type === "training")
      .map((workout) => workout.cycle_position)
      .filter((position): position is number => typeof position === "number");
    if (positions.length > 0) return Math.max(...positions) + 1;
    return getTemplateCycleLength(program?.template_type ?? null);
  }, [workouts, program?.template_type]);

  const pendingTrainings = useMemo<PendingTraining[]>(() => {
    return workouts
      .filter((workout) => workout.day_type === "training" && workout.status === "scheduled")
      .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0))
      .map((workout) => ({
        sequenceIndex: workout.sequence_index ?? 0,
        name: workout.name,
        scheduledDate: workout.scheduled_date
      }));
  }, [workouts]);

  async function loadCurrentProgram({
    requireActiveProgram = false,
    showLoading = true
  }: {
    requireActiveProgram?: boolean;
    showLoading?: boolean;
  } = {}): Promise<boolean> {
    if (showLoading) {
      setStatus("loading");
    }
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/login?next=/plan");
      return false;
    }

    setUserId(userData.user.id);
    const cached = getUserScopedCache(readClientCache<PlanCache>(planCacheKey), userData.user.id);
    if (cached) hydratePlanCache(cached);

    await loadPlanSetup(userData.user.id);

    const [recommendationsResult, programResult] = await Promise.all([
      fetchRecommendations(userData.user.id),
      supabase
        .from(DB_TABLE.programs)
        .select("id,name,template_type,schedule_mode,schedule_config,custom_template_name,status,start_date,end_date,schedule_revision,holiday_policy")
        .eq("user_id", userData.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    let resolvedProgramResult = programResult;
    if (programResult.error && /schedule_revision|holiday_policy/i.test(programResult.error.message)) {
      // Pre-migration databases lack the scheduling metadata columns.
      setScheduleAdjustmentSupported(false);
      resolvedProgramResult = await supabase
        .from(DB_TABLE.programs)
        .select("id,name,template_type,schedule_mode,schedule_config,custom_template_name,status,start_date,end_date")
        .eq("user_id", userData.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    } else {
      setScheduleAdjustmentSupported(true);
    }

    if (!recommendationsResult.ok) {
      setStatus("error");
      setMessage(recommendationsResult.message);
      return false;
    }

    setRecommendations(recommendationsResult.rows);
    setRecommendationWeights(
      Object.fromEntries(
        recommendationsResult.rows.map((recommendation) => [
          recommendation.id,
          String(recommendation.suggested_weight)
        ])
      )
    );

    const { data: programData, error: programError } = resolvedProgramResult;

    if (programError) {
      setStatus("error");
      setMessage(programError.message);
      return false;
    }

    if (!programData) {
      const nextRecommendationWeights = Object.fromEntries(
        recommendationsResult.rows.map((recommendation) => [
          recommendation.id,
          String(recommendation.suggested_weight)
        ])
      );
      setProgram(null);
      setWorkouts([]);
      setWorkoutExercises([]);
      setScheduleEvents([]);
      setUnavailableDates([]);
      writePlanCache({
        program: null,
        recommendationWeights: nextRecommendationWeights,
        recommendations: recommendationsResult.rows,
        userId: userData.user.id,
        workoutExercises: [],
        workouts: []
      });
      setStatus("ready");
      return !requireActiveProgram;
    }

    setProgram(programData as ProgramRow);
    const loadedWorkouts = await loadWorkouts(programData.id);
    if (!loadedWorkouts.ok) {
      return false;
    }

    await loadScheduleAdjustmentData(programData.id);

    writePlanCache({
      program: programData as ProgramRow,
      recommendationWeights: Object.fromEntries(
        recommendationsResult.rows.map((recommendation) => [
          recommendation.id,
          String(recommendation.suggested_weight)
        ])
      ),
      recommendations: recommendationsResult.rows,
      userId: userData.user.id,
      workoutExercises: loadedWorkouts.value.workoutExercises,
      workouts: loadedWorkouts.value.workouts
    });
    setStatus("ready");
    return true;
  }

  async function loadPlanSetup(targetUserId: string) {
    const supabase = createBrowserSupabaseClient();
    const [profileResult, mainLiftsResult] = await Promise.all([
      supabase
        .from(DB_TABLE.athleteProfiles)
        .select("experience_level,goal,training_days_per_week,available_weekdays,session_duration_minutes,injury_notes")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      supabase
        .from(DB_TABLE.exercises)
        .select("id,slug,name,default_increment,is_main_lift")
        .eq("is_main_lift", true)
        .order("created_at", { ascending: true })
    ]);

    if (mainLiftsResult.error) {
      setMessage("主项动作读取失败，请刷新后重试。");
      return;
    }

    const loadedMainLifts = (mainLiftsResult.data ?? []) as ExerciseRow[];
    setMainLifts(loadedMainLifts);

    if (profileResult.error) {
      setMessage("计划参数读取失败，请刷新后重试。");
      return;
    }

    if (!profileResult.data) {
      setPlanSetup({
        ...defaultPlanSetup,
        lifts: loadedMainLifts.map((exercise) => ({ exerciseId: exercise.id, weightKg: "", reps: "5" }))
      });
      return;
    }

    const profile = profileResult.data;
    const { data: liftRows, error: liftError } = await supabase
      .from(DB_TABLE.liftProfiles)
      .select("exercise_id,estimated_1rm")
      .eq("user_id", targetUserId)
      .in("exercise_id", loadedMainLifts.map((exercise) => exercise.id));

    if (liftError) {
      setMessage("主项最近工作组读取失败，请刷新后重试。");
      return;
    }

    const estimatedByExerciseId = new Map(
      (liftRows ?? []).map((lift) => [lift.exercise_id, Number(lift.estimated_1rm)])
    );
    const availableWeekdays = Array.isArray(profile.available_weekdays) && profile.available_weekdays.length > 0
      ? profile.available_weekdays
      : [1, 3, 5];
    const sessionDurationMinutes = (sessionDurationOptions as readonly number[]).includes(
      Number(profile.session_duration_minutes)
    )
      ? (Number(profile.session_duration_minutes) as PlanSetupInput["sessionDurationMinutes"])
      : 60;

    setScheduleRule((current) =>
      current.mode === "fixed_weekdays" ? { mode: "fixed_weekdays", weekdays: availableWeekdays } : current
    );
    setPlanSetup({
      experienceLevel: profile.experience_level as PlanSetupInput["experienceLevel"],
      goal: normalizePlanGoal(profile.goal),
      injuryNotes: profile.injury_notes ?? "",
      lifts: loadedMainLifts.map((exercise) => {
        const estimatedOneRepMax = estimatedByExerciseId.get(exercise.id) ?? 0;
        const workingWeight = inferFiveRepWorkingWeight(estimatedOneRepMax, Number(exercise.default_increment) || 2.5);
        return { exerciseId: exercise.id, weightKg: workingWeight ? String(workingWeight) : "", reps: "5" };
      }),
      weekCount: 4,
      sessionDurationMinutes
    });
  }

  async function persistPlanSetup(): Promise<PlanSetupValidationResult["ok"]> {
    if (!userId) return false;

    const parsed = validatePlanSetup(planSetup);
    if (!parsed.ok) {
      setPlanSetupErrors(parsed.fieldErrors);
      setStatus("ready");
      return false;
    }

    setPlanSetupErrors({});
    const supabase = createBrowserSupabaseClient();
    const { error: profileError } = await supabase.from(DB_TABLE.athleteProfiles).upsert(
      {
        user_id: userId,
        experience_level: parsed.value.experienceLevel,
        goal: parsed.value.goal,
        available_weekdays: scheduleRule.mode === "fixed_weekdays" ? scheduleRule.weekdays : [],
        session_duration_minutes: parsed.value.sessionDurationMinutes,
        injury_notes: parsed.value.injuryNotes || null,
        unit: "kg",
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

    if (profileError) {
      setStatus("error");
      setMessage(profileError.message);
      return false;
    }

    const incrementById = new Map(mainLifts.map((exercise) => [exercise.id, Number(exercise.default_increment) || 2.5]));
    const liftPayload = parsed.value.lifts.map((lift) => {
      const estimatedOneRepMax = estimateOneRepMax(lift.workingWeight, lift.reps);
      return {
        user_id: userId,
        exercise_id: lift.exerciseId,
        estimated_1rm: Number(estimatedOneRepMax.toFixed(2)),
        training_max: roundToNearestPlate(
          calculateTrainingMax(estimatedOneRepMax, parsed.value.experienceLevel),
          incrementById.get(lift.exerciseId) ?? 2.5
        ),
        source_type: "working_set"
      };
    });
    const { error: liftError } = await supabase
      .from(DB_TABLE.liftProfiles)
      .upsert(liftPayload, { onConflict: "user_id,exercise_id" });

    if (liftError) {
      setStatus("error");
      setMessage(liftError.message);
      return false;
    }

    clearTrainingDataCaches();
    return true;
  }

  async function loadRecommendations(targetUserId: string) {
    const result = await fetchRecommendations(targetUserId);
    if (!result.ok) {
      setStatus("error");
      setMessage(result.message);
      return;
    }

    setRecommendations(result.rows);
    setRecommendationWeights(
      Object.fromEntries(
        result.rows.map((recommendation) => [recommendation.id, String(recommendation.suggested_weight)])
      )
    );
  }

  async function fetchRecommendations(targetUserId: string): Promise<
    | { ok: true; rows: RecommendationRow[] }
    | { ok: false; message: string }
  > {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from(DB_TABLE.recommendations)
      .select("id,exercise_id,workout_id,recommendation_type,previous_weight,suggested_weight,reason,status,exercises(name,slug),workouts(scheduled_date,sequence_index,name)")
      .eq("user_id", targetUserId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, rows: (data ?? []) as unknown as RecommendationRow[] };
  }

  async function loadWorkouts(programId: string): Promise<
    | { ok: true; value: { workoutExercises: WorkoutExerciseRow[]; workouts: WorkoutRow[] } }
    | { ok: false }
  > {
    const supabase = createBrowserSupabaseClient();
    const { data: workoutData, error: workoutError, usedLegacySchema } = await loadWorkoutsWithDayTypeFallback(
      () => supabase.from(DB_TABLE.workouts).select("id,scheduled_date,sequence_index,schedule_index,day_type,cycle_index,cycle_position,name,status").eq("program_id", programId).order("schedule_index", { ascending: true }),
      () => supabase.from(DB_TABLE.workouts).select("id,scheduled_date,sequence_index,name,status").eq("program_id", programId).order("sequence_index", { ascending: true })
    );

    if (workoutError) {
      setStatus("error");
      setMessage(workoutError.message);
      return { ok: false };
    }

    const workoutRows = ((workoutData ?? []) as WorkoutRow[]).sort((a, b) => a.schedule_index - b.schedule_index);
    if (usedLegacySchema) {
      setUsesLegacyScheduleSchema(true);
      setMessage("数据库升级尚未完成：当前以原有训练计划模式运行，休息日和原子重建将在升级后启用。");
    } else {
      setUsesLegacyScheduleSchema(false);
    }
    const workoutIds = workoutRows.map((workout) => workout.id);
    setWorkouts(workoutRows);

    if (workoutIds.length === 0) {
      setWorkoutExercises([]);
      return { ok: true, value: { workoutExercises: [], workouts: workoutRows } };
    }

    const { data: exerciseData, error: exerciseError } = await supabase
      .from(DB_TABLE.workoutExercises)
      .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug)")
      .in("workout_id", workoutIds)
      .order("order_index", { ascending: true });

    if (exerciseError) {
      setStatus("error");
      setMessage(exerciseError.message);
      return { ok: false };
    }

    const workoutExerciseRows = (exerciseData ?? []) as unknown as WorkoutExerciseRow[];
    setWorkoutExercises(workoutExerciseRows);
    return { ok: true, value: { workoutExercises: workoutExerciseRows, workouts: workoutRows } };
  }

  async function loadScheduleAdjustmentData(programId: string) {
    if (!scheduleAdjustmentSupported) {
      setScheduleEvents([]);
      setUnavailableDates([]);
      return;
    }

    const supabase = createBrowserSupabaseClient();
    const [eventsResult, unavailableResult] = await Promise.all([
      supabase
        .from(DB_TABLE.scheduleEvents)
        .select("id,event_type,effective_date,metadata,schedule_revision,created_at")
        .eq("program_id", programId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from(DB_TABLE.unavailableDates)
        .select("id,date,note")
        .order("date", { ascending: true })
    ]);

    if (eventsResult.error || unavailableResult.error) {
      setScheduleAdjustmentSupported(false);
      setScheduleEvents([]);
      setUnavailableDates([]);
      return;
    }

    setScheduleEvents((eventsResult.data ?? []) as ScheduleEventRow[]);
    setUnavailableDates((unavailableResult.data ?? []) as UnavailableDateItem[]);
  }

  function writePlanCache(cache: PlanCache) {
    writeClientCache<PlanCache>(planCacheKey, cache);
  }

  function hydratePlanCache(cache: PlanCache) {
    setProgram(cache.program);
    setWorkouts(cache.workouts);
    setWorkoutExercises(cache.workoutExercises);
    setRecommendations(cache.recommendations);
    setRecommendationWeights(cache.recommendationWeights);
    setStatus("ready");
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
    let futureWorkoutsQuery = supabase
      .from(DB_TABLE.workouts)
      .select("id")
      .eq("program_id", program.id)
      .neq("status", "completed");

    if (typeof recommendation.workouts?.sequence_index === "number") {
      futureWorkoutsQuery = futureWorkoutsQuery.gt("sequence_index", recommendation.workouts.sequence_index);
    } else {
      futureWorkoutsQuery = futureWorkoutsQuery.gte("scheduled_date", formatDate(new Date()));
    }

    const { data: futureWorkouts, error: futureWorkoutError } = await futureWorkoutsQuery;

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
      .from(DB_TABLE.workoutExercises)
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

    clearTrainingDataCaches();
    const recommendationStatus =
      Number(appliedWeight) === Number(recommendation.suggested_weight) ? "accepted" : "modified";
    const { error: updateRecommendationError } = await supabase
      .from(DB_TABLE.recommendations)
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
      .from(DB_TABLE.recommendations)
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

    clearTrainingDataCaches();
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

  function openAdjustmentDialog(action: "resume" | "extra_rest") {
    setAdjustmentDialog({
      action,
      selectedRoute: null,
      injuryAcknowledged: false,
      busy: false,
      errorMessage: null
    });
  }

  async function confirmScheduleAdjustment() {
    if (!adjustmentDialog || !adjustmentDialog.selectedRoute || !program || !userId) return;

    const revision = program.schedule_revision;
    if (typeof revision !== "number") {
      setAdjustmentDialog({ ...adjustmentDialog, errorMessage: "数据库升级尚未完成，暂不能调整日程。" });
      return;
    }

    const { action } = adjustmentDialog;
    const route = adjustmentDialog.selectedRoute;
    const today = formatDate(new Date());
    const pendingRows = getPendingScheduleRows(workouts);
    const rule = getRuleFromProgram(program);
    const blockedDates = buildBlockedDateMap(program.holiday_policy ?? "train", holidayDates, unavailableDates);
    const fromDate = action === "extra_rest" ? shiftDate(today, 1) : today;

    let rowsToReflow = pendingRows;
    let skippedItems: ReflowScheduleItem[] = [];

    if (route === "start_next_cycle") {
      const firstPending = pendingRows.find(
        (row) => row.day_type === "training" && typeof row.sequence_index === "number"
      );
      if (firstPending && typeof firstPending.sequence_index === "number") {
        const currentCycleIndex = Math.floor(firstPending.sequence_index / templateLength);
        const skippedRows = pendingRows.filter(
          (row) =>
            row.day_type === "training" &&
            typeof row.sequence_index === "number" &&
            Math.floor(row.sequence_index / templateLength) === currentCycleIndex
        );
        skippedItems = skippedRows.map((row) => ({
          workoutId: row.id,
          scheduledDate: row.scheduled_date,
          scheduleIndex: row.schedule_index,
          sequenceIndex: row.sequence_index,
          dayType: "training",
          status: "skipped"
        }));
        const skippedIds = new Set(skippedRows.map((row) => row.id));
        rowsToReflow = pendingRows.filter((row) => !skippedIds.has(row.id));
      }
    }

    const reflowItems = buildReflowScheduleItems({
      rows: rowsToReflow,
      rule,
      programStartDate: program.start_date,
      blockedDates,
      fromDate
    });

    let payload;
    try {
      payload = buildScheduleReflowPayload({
        programId: program.id,
        expectedRevision: revision,
        action,
        effectiveDate: today,
        route: action === "resume" ? route : undefined,
        scheduleItems: [...skippedItems, ...reflowItems]
      });
    } catch (error) {
      setAdjustmentDialog({
        ...adjustmentDialog,
        errorMessage: error instanceof Error ? error.message : "日程调整参数无效。"
      });
      return;
    }

    setAdjustmentDialog({ ...adjustmentDialog, busy: true, errorMessage: null });
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc("reflow_program_schedule", { p_payload: payload });

    if (error) {
      if (/schedule changed/i.test(error.message)) {
        setAdjustmentDialog(null);
        await loadCurrentProgram({ showLoading: false });
        setMessage("日程已在其他设备调整，请刷新后重新确认。");
        return;
      }
      // Network and validation failures keep the dialog state and selections.
      setAdjustmentDialog((current) =>
        current
          ? { ...current, busy: false, errorMessage: "提交失败，请检查网络后重试。当前选择已保留，日程尚未变化。" }
          : current
      );
      return;
    }

    setAdjustmentDialog(null);
    clearTrainingDataCaches();
    await trackEvent({
      eventName: "schedule_adjusted",
      properties: { action, route },
      supabase,
      userId
    });
    await loadCurrentProgram({ showLoading: false });
    setMessage(action === "resume" ? "已恢复训练，日程已更新。" : "已为你多安排一天休息，后续日程已顺延。");
  }

  async function confirmPause() {
    if (!program || !userId) return;

    const revision = program.schedule_revision;
    if (typeof revision !== "number") {
      setStatus("error");
      setMessage("数据库升级尚未完成，暂不能暂停计划。");
      return;
    }

    setScheduleActionBusy(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from(DB_TABLE.scheduleEvents).insert({
      user_id: userId,
      program_id: program.id,
      event_type: "pause_started",
      effective_date: formatDate(new Date()),
      metadata: { reason: pauseReason, resume_date: pauseResumeDate || null },
      schedule_revision: revision
    });
    setScheduleActionBusy(false);

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setShowPauseForm(false);
    setPauseResumeDate("");
    clearTrainingDataCaches();
    await loadCurrentProgram({ showLoading: false });
    setMessage("计划已暂停。恢复时可以选择继续当前循环或从下个循环开始。");
  }

  async function addUnavailableDate(date: string, note: string) {
    if (!userId || !program) return;

    setScheduleActionBusy(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from(DB_TABLE.unavailableDates)
      .insert({ user_id: userId, date, note: note || null });

    if (error) {
      setScheduleActionBusy(false);
      setStatus("error");
      setMessage(error.message);
      return;
    }

    await reflowForUnavailableDates([...unavailableDates, { id: `pending-${date}`, date, note: note || null }]);
  }

  async function removeUnavailableDate(id: string) {
    if (!program) return;

    setScheduleActionBusy(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from(DB_TABLE.unavailableDates).delete().eq("id", id);

    if (error) {
      setScheduleActionBusy(false);
      setStatus("error");
      setMessage(error.message);
      return;
    }

    await reflowForUnavailableDates(unavailableDates.filter((item) => item.id !== id));
  }

  async function reflowForUnavailableDates(nextDates: UnavailableDateItem[]) {
    if (!program) {
      setScheduleActionBusy(false);
      return;
    }

    const revision = program.schedule_revision;
    if (typeof revision !== "number") {
      setScheduleActionBusy(false);
      await loadCurrentProgram({ showLoading: false });
      return;
    }

    const today = formatDate(new Date());
    const pendingRows = getPendingScheduleRows(workouts);
    const rule = getRuleFromProgram(program);
    const blockedDates = buildBlockedDateMap(program.holiday_policy ?? "train", holidayDates, nextDates);
    const firstPendingDate = pendingRows[0]?.scheduled_date ?? today;
    const scheduleItems = buildReflowScheduleItems({
      rows: pendingRows,
      rule,
      programStartDate: program.start_date,
      blockedDates,
      fromDate: firstPendingDate < today ? today : firstPendingDate
    });

    const payload = buildScheduleReflowPayload({
      programId: program.id,
      expectedRevision: revision,
      action: "unavailable_dates",
      effectiveDate: today,
      scheduleItems
    });

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc("reflow_program_schedule", { p_payload: payload });
    setScheduleActionBusy(false);

    if (error) {
      if (/schedule changed/i.test(error.message)) {
        await loadCurrentProgram({ showLoading: false });
        setMessage("日程已在其他设备调整，请刷新后重新确认。");
        return;
      }
      setStatus("error");
      setMessage(error.message);
      return;
    }

    clearTrainingDataCaches();
    await loadCurrentProgram({ showLoading: false });
    setMessage("不可训练日已更新，训练日程已重新安排。");
  }

  async function openRegenerationDialog() {
    if (!userId) return;

    if (usesLegacyScheduleSchema) {
      setStatus("error");
      setMessage("数据库升级尚未完成，暂不能重新生成计划。现有训练记录仍可正常使用。");
      return;
    }

    if (scheduleRule.mode === "fixed_weekdays" && scheduleRule.weekdays.length === 0) {
      setStatus("error");
      setMessage("固定星期模式至少选择一个训练日。");
      return;
    }

    if (useCustomName && !customTemplateName.trim()) {
      setStatus("error");
      setMessage("请为自定义模板填写名称。");
      return;
    }

    setStatus("generating");
    setMessage("");

    try {
      const saved = await persistPlanSetup();
      if (!saved) return;

      const supabase = createBrowserSupabaseClient();
      // Legacy flexible programs stay readable, but regeneration always produces a
      // supported sequence-first rule chosen in the form above.
      const schedule: ScheduleRule = scheduleRule;

      const { data: exercises, error: exercisesError } = await supabase
        .from(DB_TABLE.exercises)
        .select("id,slug,name,default_increment");

      if (exercisesError || !exercises) {
        setStatus("error");
        setMessage(exercisesError?.message ?? "动作数据读取失败。");
        return;
      }

      const { data: liftProfiles, error: liftError } = await supabase
        .from(DB_TABLE.liftProfiles)
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
        schedule,
        exerciseProfiles: [...exerciseProfiles, ...accessoryProfiles],
        weekCount: planSetup.weekCount
      });

      const payload = buildProgramReplacementPayload({
        customTemplateName: useCustomName ? customTemplateName.trim() : null,
        exerciseIdsBySlug: new Map(exerciseRows.map((exercise) => [exercise.slug, exercise.id])),
        holidayPolicy,
        plannedItems: plannedWorkouts,
        programTemplateType: useCustomName ? "custom" : templateType,
        schedule,
        templateType
      });
      pendingReplacementPayload.current = payload;
      setRegenerationDialog(
        reduceRegenerationDialog(createRegenerationDialogState(), {
          type: "open",
          preview: buildRegenerationPreview({
            activeItems: workouts.map((workout) => ({ dayType: workout.day_type, status: workout.status })),
            proposedItems: plannedWorkouts
          }),
          selection: {
            payload,
            scheduleLabel: getScheduleLabel(schedule),
            startDate: payload.start_date,
            templateLabel: getTemplateLabel(templateType, useCustomName ? customTemplateName.trim() : null)
          }
        })
      );
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(getPlanGenerationErrorMessage(error));
    }
  }

  async function confirmProgramRegeneration() {
    if (confirmationInFlight.current) return;

    const nextDialogState = reduceRegenerationDialog(regenerationDialog, { type: "confirm" });
    const confirmationPayload = buildConfirmationPayload(nextDialogState);
    const replacementPayload = pendingReplacementPayload.current;
    if (!confirmationPayload || !replacementPayload || !userId) return;

    confirmationInFlight.current = true;
    setRegenerationDialog(nextDialogState);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.rpc("replace_active_program", {
      p_payload: replacementPayload
    });

    if (error) {
      confirmationInFlight.current = false;
      setRegenerationDialog((current) =>
        reduceRegenerationDialog(current, {
          type: "requestFailed",
          message: "生成新计划失败，请稍后重试。当前计划未发生变化。"
        })
      );
      return;
    }

    pendingReplacementPayload.current = null;
    clearProgramRegenerationCaches();
    await trackEvent({
      eventName: "program_regenerated",
      properties: {
        schedule_mode: replacementPayload.schedule_mode,
        schedule_items: replacementPayload.schedule_items.length,
        template_type: replacementPayload.template_type
      },
      supabase,
      userId
    });
    setRegenerationDialog((current) => reduceRegenerationDialog(current, { type: "replacementCommitted" }));
    const reloaded = await loadCurrentProgram({ requireActiveProgram: true, showLoading: false });
    confirmationInFlight.current = false;
    const outcome = resolveProgramRegenerationOutcome({
      freshProgramLoaded: reloaded,
      replacementSucceeded: true
    });

    if (outcome.type === "reloadFailed") {
      setProgram(outcome.staleData.program);
      setWorkouts(outcome.staleData.workouts);
      setWorkoutExercises(outcome.staleData.workoutExercises);
      setRecommendations(outcome.staleData.recommendations);
      setRecommendationWeights(outcome.staleData.recommendationWeights);
      setStatus("error");
      setMessage(outcome.message);
      setRegenerationDialog((current) =>
        reduceRegenerationDialog(current, {
          type: outcome.dialogAction,
          message: outcome.dialogMessage
        })
      );
      return;
    }

    if (outcome.clearPendingPayload) pendingReplacementPayload.current = null;
    setRegenerationDialog((current) => reduceRegenerationDialog(current, { type: outcome.dialogAction }));
    setMessage(outcome.message);
    if (outcome.focusScheduleRow) requestAnimationFrame(() => firstScheduleItemRef.current?.focus());
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取当前训练计划
      </div>
    );
  }

  const nextPlanWorkoutId =
    workouts.find((workout) => workout.day_type === "training" && workout.status !== "completed")?.id ?? null;

  const todayDate = formatDate(new Date());
  const daysInterrupted = pauseState.event
    ? Math.max(0, daysBetweenDates(pauseState.event.effective_date, todayDate))
    : 0;
  const recoveryAdvice = pauseState.paused ? getRecoveryLoadAdvice(daysInterrupted) : null;
  const adjustmentControlsAvailable =
    Boolean(program) && scheduleAdjustmentSupported && !usesLegacyScheduleSchema;
  const hasPendingScheduleRows = getPendingScheduleRows(workouts).length > 0;

  return (
    <div className="space-y-5">
      <PlanBuilder
        customTemplateName={customTemplateName}
        holidayPolicy={holidayPolicy}
        holidays={holidayDates}
        onHolidayPolicyChange={setHolidayPolicy}
        onRuleChange={setScheduleRule}
        rule={scheduleRule}
        setCustomTemplateName={setCustomTemplateName}
        setTemplateType={setTemplateType}
        setUseCustomName={setUseCustomName}
        templateType={templateType}
        useCustomName={useCustomName}
      />

      {(!program || showPlanSetup) ? (
        <PlanSetupForm
          errors={planSetupErrors}
          mainLifts={mainLifts}
          onChange={setPlanSetup}
          value={planSetup}
        />
      ) : null}

      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${status === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
          {message}
        </p>
      ) : null}

      {!program ? (
        <section className="action-surface p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
              <PlusCircle size={20} />
            </span>
            <div>
              <h2 className="font-semibold">创建第一个计划</h2>
              <p className="text-sm text-muted">填写计划参数、选择训练结构和安排方式后，即可生成 1–12 周计划。</p>
            </div>
          </div>
          <button
            className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-md bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "generating"}
            onClick={openRegenerationDialog}
            ref={regenerationTriggerRef}
            type="button"
          >
            {status === "generating" ? <Loader2 className="animate-spin" size={18} /> : <PlusCircle size={18} />}
            生成 {planSetup.weekCount} 周训练计划
          </button>
        </section>
      ) : (
        <section className="action-surface p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
              <CheckCircle2 size={20} />
            </span>
            <div>
              <p className="page-kicker">当前周期</p>
              <h2 className="font-bold">{program.name}</h2>
              <p className="text-sm text-muted">
                {program.start_date} 至 {program.end_date}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="pressable inline-flex rounded-md bg-action px-4 py-2 font-semibold text-white" href="/today">
              查看今日训练
            </Link>
            <button
              className="pressable inline-flex rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status === "generating"}
              onClick={() => {
                if (!showPlanSetup) {
                  setShowPlanSetup(true);
                  return;
                }
                openRegenerationDialog();
              }}
              ref={regenerationTriggerRef}
              type="button"
            >
              {showPlanSetup ? "预览并重新生成计划" : "调整周期并重新生成"}
            </button>
            <button
              className="pressable inline-flex rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink"
              onClick={() => setShowPlanSetup((current) => !current)}
              type="button"
            >
              {showPlanSetup ? "收起计划参数" : "调整计划参数"}
            </button>
          </div>
        </section>
      )}

      {adjustmentControlsAvailable ? (
        <section className="rounded-xl border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
              {pauseState.paused ? <Play size={20} /> : <Pause size={20} />}
            </span>
            <div>
              <h2 className="font-semibold">日程调整</h2>
              <p className="text-sm text-muted">暂停、恢复或多休一天，训练顺序会自动保持。</p>
            </div>
          </div>

          {pauseState.paused ? (
            <div className="rounded-lg border border-[#c75c1a]/30 bg-[#c75c1a]/5 p-3">
              <p className="font-semibold text-[#c75c1a]">计划已暂停</p>
              <p className="mt-1 text-sm text-muted">
                {pauseState.resumeDate ? `预计 ${pauseState.resumeDate} 恢复。` : "尚未设置恢复日期。"}
                {recoveryAdvice ? ` ${recoveryAdvice.message}` : ""}
              </p>
              <button
                className="pressable mt-3 inline-flex items-center gap-2 rounded-md bg-action px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={scheduleActionBusy || !hasPendingScheduleRows}
                onClick={() => openAdjustmentDialog("resume")}
                type="button"
              >
                <Play size={16} />
                恢复训练
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                className="pressable inline-flex rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                disabled={scheduleActionBusy || !hasPendingScheduleRows}
                onClick={() => openAdjustmentDialog("extra_rest")}
                type="button"
              >
                今天多休一天
              </button>
              <button
                className="pressable inline-flex rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink"
                onClick={() => setShowPauseForm((current) => !current)}
                type="button"
              >
                {showPauseForm ? "收起暂停设置" : "暂停计划"}
              </button>
            </div>
          )}

          {showPauseForm && !pauseState.paused ? (
            <div className="mt-3 grid gap-3 rounded-lg bg-field p-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">暂停原因</span>
                <select
                  aria-label="暂停原因"
                  className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
                  onChange={(event) => setPauseReason(event.target.value as PauseReason)}
                  value={pauseReason}
                >
                  <option value="fatigue">疲劳累积，需要休整</option>
                  <option value="time_conflict">工作/学习时间冲突</option>
                  <option value="minor_discomfort">轻微不适</option>
                  <option value="injury">受伤</option>
                  <option value="personal">个人事务</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">预计恢复日期（可选）</span>
                <input
                  aria-label="预计恢复日期（可选）"
                  className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
                  onChange={(event) => setPauseResumeDate(event.target.value)}
                  type="date"
                  value={pauseResumeDate}
                />
              </label>
              <div className="flex gap-3 sm:col-span-2">
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={scheduleActionBusy}
                  onClick={confirmPause}
                  type="button"
                >
                  {scheduleActionBusy ? <Loader2 className="animate-spin" size={16} /> : null}
                  确认暂停
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink"
                  onClick={() => setShowPauseForm(false)}
                  type="button"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {adjustmentControlsAvailable ? (
        <UnavailableDateManager
          busy={scheduleActionBusy}
          dates={unavailableDates}
          onAdd={addUnavailableDate}
          onRemove={removeUnavailableDate}
        />
      ) : null}

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
          {workouts.map((workout, index) => {
            const isRestDay = workout.day_type === "rest";
            const presentation = getScheduleItemPresentation({ dayType: workout.day_type, status: workout.status });
            const workoutMeta = isRestDay ? null : getWorkoutMeta(workout.name);
            const workoutState = getPlanWorkoutState(workout, workout.id === nextPlanWorkoutId);
            const isRecovery = workout.name.includes("恢复") || workout.name.includes("休息") || workout.name.includes("有氧");

            return (
            <article
              className={`rounded-lg border border-l-4 p-4 ${
                workoutState.isNext
                  ? "border-action border-l-action bg-action/5"
                  : workout.status === "completed"
                    ? "border-line border-l-action bg-field"
                    : isRecovery
                      ? "border-[#4a7a9a]/20 border-l-[#4a7a9a] bg-[#4a7a9a]/5"
                      : "border-line border-l-[#c75c1a] bg-white"
              }`}
              key={workout.id}
              ref={index === 0 ? firstScheduleItemRef : undefined}
              tabIndex={index === 0 ? -1 : undefined}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    workoutState.isNext
                      ? "bg-action text-white"
                      : workout.status === "completed"
                        ? "bg-field text-muted"
                        : isRecovery
                          ? "bg-[#4a7a9a]/10 text-[#4a7a9a]"
                          : "bg-action/10 text-action"
                  }`}>
                    {isRecovery ? <Moon size={18} /> : <Dumbbell size={18} />}
                  </span>
                  <div>
                    <p className="text-sm text-muted">
                      <span className="inline-flex items-center gap-1">
                        {isRestDay ? <Moon size={14} /> : <Dumbbell size={14} />}
                        {isRestDay ? `恢复安排 · ${workout.scheduled_date}` : `第 ${(workout.sequence_index ?? 0) + 1} 节 · 建议 ${workout.scheduled_date}`}
                      </span>
                    </p>
                    <h3 className="font-bold">{isRestDay ? presentation.title : workout.name}</h3>
                    {workoutMeta ? <p className="mt-1 text-sm text-muted">{workoutMeta.focus}</p> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      workoutState.isNext ? "bg-action text-white" : isRecovery ? "bg-[#4a7a9a]/10 text-[#4a7a9a]" : "bg-action/10 text-action"
                    }`}
                  >
                    {workoutState.label}
                  </span>
                  {workoutMeta ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted">
                      {workoutMeta.intent}
                    </span>
                  ) : null}
                </div>
              </div>
              {!isRestDay ? (
                <div className="space-y-2">
                  {(workoutExercisesByWorkoutId[workout.id] ?? []).map((exercise) => (
                    <div className="flex items-center justify-between border-b border-line/70 px-1 py-2 text-sm last:border-b-0" key={exercise.id}>
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
              ) : null}
            </article>
            );
          })}
        </section>
      ) : null}
      {adjustmentDialog ? (
        <ScheduleAdjustmentDialog
          busy={adjustmentDialog.busy}
          errorMessage={adjustmentDialog.errorMessage}
          injuryAcknowledged={adjustmentDialog.injuryAcknowledged}
          onCancel={() => {
            if (!adjustmentDialog.busy) setAdjustmentDialog(null);
          }}
          onConfirm={confirmScheduleAdjustment}
          onInjuryAcknowledgedChange={(acknowledged) =>
            setAdjustmentDialog((current) => (current ? { ...current, injuryAcknowledged: acknowledged } : current))
          }
          onSelectRoute={(route) =>
            setAdjustmentDialog((current) => (current ? { ...current, selectedRoute: route } : current))
          }
          preview={buildResumePreview({
            route: adjustmentDialog.selectedRoute ?? "continue_current_cycle",
            pendingTraining: pendingTrainings,
            templateLength,
            resumedOn: adjustmentDialog.action === "extra_rest" ? shiftDate(todayDate, 1) : todayDate
          })}
          recoveryAdvice={adjustmentDialog.action === "resume" ? getRecoveryLoadAdvice(daysInterrupted) : null}
          requireInjuryAcknowledgement={adjustmentDialog.action === "resume" && pauseState.reason === "injury"}
          selectedRoute={adjustmentDialog.selectedRoute}
        />
      ) : null}
      {regenerationDialog.open ? (
        <ProgramRegenerationDialog
          onClose={() => {
            if (
              regenerationDialog.phase === "submitting" ||
              regenerationDialog.phase === "replacementCommitted" ||
              regenerationDialog.phase === "reloadFailed"
            ) {
              return;
            }
            pendingReplacementPayload.current = null;
            setRegenerationDialog((current) => reduceRegenerationDialog(current, { type: "close" }));
          }}
          onConfirm={confirmProgramRegeneration}
          onReload={() => window.location.reload()}
          returnFocusRef={regenerationTriggerRef}
          state={regenerationDialog}
        />
      ) : null}
    </div>
  );
}

export function PlanSetupForm({
  errors,
  mainLifts,
  onChange,
  value
}: {
  errors: Record<string, string>;
  mainLifts: ExerciseRow[];
  onChange: (value: PlanSetupInput) => void;
  value: PlanSetupInput;
}) {
  function update(patch: Partial<PlanSetupInput>) {
    onChange({ ...value, ...patch });
  }

  function updateLift(exerciseId: string, patch: Partial<{ weightKg: string; reps: string }>) {
    const existingLift = value.lifts.find((lift) => lift.exerciseId === exerciseId);
    const lifts = existingLift
      ? value.lifts.map((lift) => lift.exerciseId === exerciseId ? { ...lift, ...patch } : lift)
      : [...value.lifts, { exerciseId, weightKg: "", reps: "5", ...patch }];
    update({ lifts });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-4">
        <p className="page-kicker">计划参数</p>
        <h2 className="text-xl font-bold">训练安排与主项最近工作组</h2>
        <p className="mt-1 text-sm leading-6 text-muted">只在创建或重建周期计划时需要填写；单次训练不受影响。</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">单次训练时长</span>
          <select
            aria-label="单次训练时长"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) =>
              update({ sessionDurationMinutes: Number(event.target.value) as PlanSetupInput["sessionDurationMinutes"] })
            }
            value={value.sessionDurationMinutes}
          >
            {sessionDurationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>{minutes} 分钟</option>
            ))}
          </select>
          {errors.sessionDurationMinutes ? <p className="mt-1 text-xs text-red-600">{errors.sessionDurationMinutes}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">计划周期</span>
          <select
            aria-label="计划周期"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) => update({ weekCount: Number(event.target.value) })}
            value={value.weekCount}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((weeks) => (
              <option key={weeks} value={weeks}>{weeks} 周</option>
            ))}
          </select>
          {errors.weekCount ? <p className="mt-1 text-xs text-red-600">{errors.weekCount}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">主要目标</span>
          <select
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) => update({ goal: event.target.value as PlanSetupInput["goal"] })}
            value={value.goal}
          >
            <option value="hypertrophy">增肌（Hypertrophy）</option>
            <option value="hypertrophy_strength">力型兼备（Hypertrophy + Strength）</option>
            <option value="fat_loss">减脂（Fat Loss）</option>
            <option value="body_recomposition">塑形（Body Recomposition）</option>
            <option value="strength">力量（Strength）</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">训练经验</span>
          <select
            aria-required="true"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) => update({ experienceLevel: event.target.value as PlanSetupInput["experienceLevel"] })}
            value={value.experienceLevel}
          >
            <option disabled value="">请选择训练经验</option>
            <option value="beginner">新手，0-6 个月</option>
            <option value="novice">初级，6-18 个月</option>
            <option value="intermediate">中级，18 个月以上</option>
          </select>
          {errors.experienceLevel ? <p className="mt-1 text-xs text-red-600">{errors.experienceLevel}</p> : null}
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium">伤病或禁忌动作（可选）</span>
        <textarea
          className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          maxLength={500}
          onChange={(event) => update({ injuryNotes: event.target.value })}
          placeholder="例如：右肩不适，暂时不做过顶推"
          value={value.injuryNotes}
        />
      </label>

      <div className="mt-5">
        <h3 className="font-semibold">主项最近工作组</h3>
        <p className="mt-1 text-sm text-muted">至少填写一个稳定完成的工作组，例如卧推 80kg × 5。</p>
        <div className="mt-3 space-y-3">
          {mainLifts.map((exercise) => {
            const lift = value.lifts.find((item) => item.exerciseId === exercise.id) ?? {
              exerciseId: exercise.id,
              weightKg: "",
              reps: "5"
            };
            return (
              <div className="grid grid-cols-[minmax(0,1fr)_84px_72px] items-end gap-2" key={exercise.id}>
                <p className="min-w-0 truncate pb-2 font-medium">{exercise.name}</p>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-muted">重量 kg</span>
                  <input
                    aria-label={`${exercise.name}重量 kg`}
                    className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => updateLift(exercise.id, { weightKg: event.target.value })}
                    step="0.5"
                    type="number"
                    value={lift.weightKg}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-muted">次数</span>
                  <input
                    aria-label={`${exercise.name}次数`}
                    className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm"
                    inputMode="numeric"
                    min="1"
                    onChange={(event) => updateLift(exercise.id, { reps: event.target.value })}
                    type="number"
                    value={lift.reps}
                  />
                </label>
              </div>
            );
          })}
        </div>
        {errors.lifts ? <p className="mt-2 text-xs text-red-600">{errors.lifts}</p> : null}
      </div>
    </section>
  );
}

function PlanBuilder({
  customTemplateName,
  holidayPolicy,
  holidays,
  onHolidayPolicyChange,
  onRuleChange,
  rule,
  setCustomTemplateName,
  setTemplateType,
  setUseCustomName,
  templateType,
  useCustomName
}: {
  customTemplateName: string;
  holidayPolicy: HolidayPolicy;
  holidays: Array<{ date: string; name: string }>;
  onHolidayPolicyChange: (policy: HolidayPolicy) => void;
  onRuleChange: (rule: ScheduleRule) => void;
  rule: ScheduleRule;
  setCustomTemplateName: (value: string) => void;
  setTemplateType: (value: TemplateType) => void;
  setUseCustomName: (value: boolean) => void;
  templateType: TemplateType;
  useCustomName: boolean;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-4">
        <p className="page-kicker">计划设置</p>
        <h2 className="text-xl font-bold">先选训练结构，再选安排方式</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {templateOptions.map((option) => (
          <button
            className={`rounded-xl border p-3 text-left transition ${templateType === option.value ? "border-action bg-action/5" : "border-line bg-field"}`}
            key={option.value}
            onClick={() => setTemplateType(option.value)}
            type="button"
          >
            <p className="font-semibold">{option.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{option.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <ScheduleRuleFields
          holidayPolicy={holidayPolicy}
          holidays={holidays}
          onChange={onRuleChange}
          onHolidayPolicyChange={onHolidayPolicyChange}
          value={rule}
        />
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-lg bg-field p-3 text-sm">
        <input
          checked={useCustomName}
          className="mt-1 h-4 w-4"
          onChange={(event) => setUseCustomName(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block font-semibold">保存为自定义模板</span>
          <span className="text-muted">使用当前选中的训练结构作为起点，并为这套循环命名。</span>
        </span>
      </label>
      {useCustomName ? (
        <label className="mt-3 block max-w-md">
          <span className="mb-1 block text-sm font-medium">自定义模板名称</span>
          <input
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            maxLength={40}
            onChange={(event) => setCustomTemplateName(event.target.value)}
            placeholder="例如：练一休一增肌循环"
            value={customTemplateName}
          />
        </label>
      ) : null}
    </section>
  );
}

function getProgramName(templateType: TemplateType) {
  if (templateType === "push_pull_squat") {
    return "推/拉/蹲 A-B 周期";
  }
  if (templateType === "one_split") return "一分化全身循环";
  if (templateType === "three_split" || templateType === "three_day_full_body") return "三分化训练循环";
  if (templateType === "five_split" || templateType === "four_day_upper_lower") return "五分化训练循环";
  return "训练循环";
}

function normalizePlanGoal(goal: string): PlanSetupInput["goal"] {
  if (goal === "hypertrophy" || goal === "hypertrophy_strength" || goal === "fat_loss" || goal === "body_recomposition" || goal === "strength") {
    return goal;
  }
  return "strength";
}

function getPlanGenerationErrorMessage(error: unknown) {
  if (error instanceof TypeError && /load failed|failed to fetch/i.test(error.message)) {
    return "网络连接失败，请检查网络后重试。已填写的计划参数仍会保留。";
  }
  return "计划预览生成失败，请检查训练设置后重试。";
}

function getScheduleConfig(schedule: ScheduleConfig) {
  if (schedule.mode === "fixed_weekdays") return { weekdays: schedule.weekdays };
  if (schedule.mode === "cadence") return { train_days: schedule.trainDays ?? 1, rest_days: schedule.restDays };
  return {};
}

function getTemplateLabel(templateType: TemplateType, customTemplateName: string | null) {
  return customTemplateName || templateOptions.find((option) => option.value === templateType)?.label || "训练模板";
}

function getScheduleLabel(schedule: ScheduleConfig) {
  if (schedule.mode === "cadence") return `练 ${schedule.trainDays ?? 1} 天，休 ${schedule.restDays} 天`;
  if (schedule.mode === "flexible") return "按训练顺序安排";
  return `固定 ${schedule.weekdays.map((weekday) => weekdayOptions.find((option) => option.value === weekday)?.label).filter(Boolean).join("、")}`;
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

function getPlanWorkoutState(workout: WorkoutRow, isNextWorkout: boolean) {
  if (workout.day_type === "rest") {
    return {
      isNext: false,
      label: workout.status === "completed" ? "已完成休息" : "恢复日"
    };
  }

  if (workout.status === "completed") {
    return {
      isNext: false,
      label: "已完成"
    };
  }

  const nextState = getNextWorkoutState(workout.scheduled_date);
  return {
    isNext: isNextWorkout,
    label: isNextWorkout
      ? nextState.kind === "overdue"
        ? `待继续 · 已顺延 ${nextState.overdueDays} 天`
        : nextState.kind === "today"
          ? "下一节训练"
          : `${nextState.daysUntil} 天后建议训练`
      : `第 ${(workout.sequence_index ?? 0) + 1} 节`
  };
}

function getPendingScheduleRows(workouts: WorkoutRow[]) {
  return workouts
    .filter((workout) => workout.status === "scheduled")
    .sort((a, b) => a.schedule_index - b.schedule_index);
}

function getRuleFromProgram(program: ProgramRow): ScheduleRule | null {
  const config = program.schedule_config ?? {};
  if (program.schedule_mode === "fixed_weekdays" && Array.isArray(config.weekdays)) {
    return { mode: "fixed_weekdays", weekdays: config.weekdays as number[] };
  }
  if (program.schedule_mode === "cadence" && typeof config.train_days === "number") {
    return {
      mode: "cadence",
      trainDays: config.train_days as number,
      restDays: typeof config.rest_days === "number" ? (config.rest_days as number) : 1
    };
  }
  return null;
}

function buildBlockedDateMap(
  holidayPolicy: HolidayPolicy,
  holidays: Array<{ date: string; name: string }>,
  unavailableDates: UnavailableDateItem[]
): Map<string, string> {
  const blocked = new Map<string, string>();
  if (holidayPolicy === "rest_and_shift") {
    for (const holiday of holidays) {
      blocked.set(holiday.date, holiday.name);
    }
  }
  for (const item of unavailableDates) {
    blocked.set(item.date, item.note || "不可训练日");
  }
  return blocked;
}

// Re-dates pending rows day by day, keeping row count and schedule_index untouched
// so the atomic RPC can apply the result without inserting or deleting rows.
function buildReflowScheduleItems(input: {
  rows: WorkoutRow[];
  rule: ScheduleRule | null;
  programStartDate: string;
  blockedDates: ReadonlyMap<string, string>;
  fromDate: string;
}): ReflowScheduleItem[] {
  const { rows, rule, blockedDates, fromDate } = input;
  if (rows.length === 0) return [];

  if (!rule) {
    // Legacy schedules without a stored rule keep their relative spacing.
    const delta = Math.max(0, daysBetweenDates(rows[0].scheduled_date, fromDate));
    return rows.map((row) => toReflowItem(row, shiftDate(row.scheduled_date, delta)));
  }

  const trainingQueue = rows.filter((row) => row.day_type === "training");
  const restQueue = rows.filter((row) => row.day_type === "rest");
  const assignments: ReflowScheduleItem[] = [];

  let phase = getCadencePhaseOffset(rule, input.programStartDate, fromDate, blockedDates);
  const cursor = parseLocalDate(fromDate);
  let guard = 0;

  while ((trainingQueue.length > 0 || restQueue.length > 0) && guard < 3660) {
    guard += 1;
    const dateStr = formatDate(cursor);

    if (blockedDates.has(dateStr)) {
      const restRow = restQueue.shift();
      // Blocked days host a rest row when one remains and never consume a phase.
      if (restRow) assignments.push(toReflowItem(restRow, dateStr));
    } else {
      const isTrainingDay = isRuleTrainingDay(rule, cursor, phase);
      const row = isTrainingDay
        ? trainingQueue.shift() ?? restQueue.shift()
        : restQueue.shift() ?? trainingQueue.shift();
      if (row) assignments.push(toReflowItem(row, dateStr));
      phase += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  for (const leftover of [...trainingQueue, ...restQueue]) {
    assignments.push(toReflowItem(leftover, leftover.scheduled_date));
  }

  return assignments.sort((a, b) => a.scheduleIndex - b.scheduleIndex);
}

function getCadencePhaseOffset(
  rule: ScheduleRule,
  startDate: string,
  targetDate: string,
  blockedDates: ReadonlyMap<string, string>
): number {
  if (rule.mode !== "cadence") return 0;

  let count = 0;
  const cursor = parseLocalDate(startDate);
  const target = parseLocalDate(targetDate);
  let guard = 0;
  while (cursor.getTime() < target.getTime() && guard < 3660) {
    guard += 1;
    if (!blockedDates.has(formatDate(cursor))) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function isRuleTrainingDay(rule: ScheduleRule, date: Date, phase: number): boolean {
  if (rule.mode === "cadence") {
    const cycleLength = rule.trainDays + rule.restDays;
    return phase % cycleLength < rule.trainDays;
  }
  return rule.weekdays.includes(date.getDay());
}

function toReflowItem(row: WorkoutRow, scheduledDate: string): ReflowScheduleItem {
  return {
    workoutId: row.id,
    scheduledDate,
    scheduleIndex: row.schedule_index,
    sequenceIndex: row.sequence_index,
    dayType: row.day_type,
    status: "scheduled"
  };
}

function getTemplateCycleLength(templateType: ProgramTemplateType | null) {
  if (templateType === "one_split") return 1;
  if (templateType === "three_split" || templateType === "three_day_full_body") return 3;
  if (templateType === "five_split") return 5;
  if (templateType === "four_day_upper_lower") return 4;
  return 6;
}

function daysBetweenDates(fromDate: string, toDate: string) {
  const from = parseLocalDate(fromDate).getTime();
  const to = parseLocalDate(toDate).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function shiftDate(date: string, days: number) {
  const shifted = parseLocalDate(date);
  shifted.setDate(shifted.getDate() + days);
  return formatDate(shifted);
}

function parseLocalDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
