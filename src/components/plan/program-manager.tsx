"use client";

import { DB_TABLE } from "../../lib/supabase/table-names";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, CheckCircle2, Dumbbell, Loader2, Moon, PlusCircle, XCircle } from "lucide-react";
import type { RecommendationType } from "@/domain/fitness-coach";
import { getDefaultPlanPosition, groupPlanOutline } from "@/domain/plan-outline";
import { getNextWorkoutState } from "@/domain/next-workout";
import { getScheduleItemPresentation } from "@/domain/rest-day-presentation";
import {
  validateProfileContext,
  validatePlanSetup,
  type PlanSetupInput,
  type PlanSetupValidationResult
} from "@/domain/plan-setup";
import { calculateTrainingMax, estimateOneRepMax, roundToNearestPlate } from "@/domain/strength";
import { applyRecommendationWeight } from "@/domain/recommendation-application";
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
  getTemplateType,
  normalizeTemplateTypeForGeneration,
  resolveProfileWorkingWeight,
  validateScheduleAndTemplate,
  type ExerciseProfile,
  templateOptions,
  type ProgramTemplateType,
  type ScheduleConfig,
  type ScheduleMode,
  type TemplateType
} from "@/domain/program";
import {
  buildProgramReplacementPayload,
  buildRegenerationPreview,
  type ProgramReplacementPayload
} from "@/domain/program-regeneration";
import { ProgramRegenerationDialog } from "./program-regeneration-dialog";
import { CurrentProgramOverview } from "./current-program-overview";
import { PlanScheduleOutline } from "./plan-schedule-outline";
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
  schedule_mode: ScheduleMode;
  schedule_config: Record<string, unknown>;
  custom_template_name: string | null;
  status: string;
  start_date: string;
  end_date: string;
};

type WorkoutRow = {
  day_type: "training" | "rest";
  id: string;
  schedule_index: number;
  scheduled_date: string;
  sequence_index: number | null;
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
  movementRestrictions: [],
  lifts: [],
  accessoryLifts: [],
  nutritionAdherence: "moderate",
  proteinTargetMet: false,
  recoveryStatus: "normal",
  currentBodyWeightKg: "",
  targetBodyWeightKg: "",
  weightChangeLast14DaysKg: "",
  sessionDurationMinutes: 60,
  weekCount: 4,
  trainingDaysPerWeek: 3
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
  const [templateType, setTemplateType] = useState<TemplateType>(getTemplateType(defaultPlanSetup.trainingDaysPerWeek));
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("fixed_weekdays");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 3, 5]);
  const [cadenceTrainDays, setCadenceTrainDays] = useState(1);
  const [cadenceRestDays, setCadenceRestDays] = useState(1);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [useCustomName, setUseCustomName] = useState(false);
  const [mainLifts, setMainLifts] = useState<ExerciseRow[]>([]);
  const [accessoryExercises, setAccessoryExercises] = useState<ExerciseRow[]>([]);
  const [planSetup, setPlanSetup] = useState<PlanSetupInput>(defaultPlanSetup);
  const [planSetupErrors, setPlanSetupErrors] = useState<Record<string, string>>({});
  const [showPlanSetup, setShowPlanSetup] = useState(false);
  const [showProfileContext, setShowProfileContext] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [scheduleExpansionMode, setScheduleExpansionMode] = useState<"default" | "all" | "collapsed">("default");
  const [regenerationDialog, setRegenerationDialog] = useState(createRegenerationDialogState);
  const confirmationInFlight = useRef(false);
  const pendingReplacementPayload = useRef<ProgramReplacementPayload | null>(null);
  const regenerationTriggerRef = useRef<HTMLButtonElement>(null);
  const firstScheduleItemRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void loadCurrentProgram().catch((error: unknown) => {
      setStatus("error");
      setMessage(getPlanLoadErrorMessage(error));
    });
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
  const planOutline = useMemo(() => program ? groupPlanOutline(workouts, program.start_date) : [], [program, workouts]);
  const defaultPosition = useMemo(
    () => getDefaultPlanPosition(planOutline, program?.start_date ?? "", new Date()),
    [planOutline, program?.start_date]
  );

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
        .select("id,name,template_type,schedule_mode,schedule_config,custom_template_name,status,start_date,end_date")
        .eq("user_id", userData.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

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

    const { data: programData, error: programError } = programResult;

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
    setShowPlanSetup(false);
    setScheduleExpansionMode("default");
    setTemplateType(normalizeTemplateTypeForGeneration(programData.template_type as TemplateType));
    setPlanSetup((current) => ({ ...current, weekCount: getProgramWeekCount(programData as Pick<ProgramRow, "start_date" | "end_date">) }));
    const loadedWorkouts = await loadWorkouts(programData.id);
    if (!loadedWorkouts.ok) {
      return false;
    }

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
        .select("experience_level,goal,training_days_per_week,available_weekdays,session_duration_minutes,injury_notes,movement_restrictions,current_body_weight_kg,target_weight_change_kg_per_week,weight_change_last_14_days_kg,nutrition_adherence,protein_target_met,recovery_status")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      supabase
        .from(DB_TABLE.exercises)
        .select("id,slug,name,default_increment,is_main_lift")
        .order("created_at", { ascending: true })
    ]);

    if (mainLiftsResult.error) {
      setMessage("主项动作读取失败，请刷新后重试。");
      return;
    }

    const allExercises = (mainLiftsResult.data ?? []) as ExerciseRow[];
    const loadedMainLifts = allExercises.filter((exercise) => exercise.is_main_lift);
    setMainLifts(loadedMainLifts);
    setAccessoryExercises(allExercises.filter((exercise) => !exercise.is_main_lift && isCalibratableAccessory(exercise.slug)));

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
      .in("exercise_id", allExercises.map((exercise) => exercise.id));

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
    const trainingDaysPerWeek = [3, 4, 7].includes(Number(profile.training_days_per_week))
      ? Number(profile.training_days_per_week)
      : defaultPlanSetup.trainingDaysPerWeek;

    setSelectedWeekdays(availableWeekdays);
    setTemplateType(getTemplateType(trainingDaysPerWeek));
    const savedSessionDuration = Number(profile.session_duration_minutes);
    const sessionDurationMinutes = savedSessionDuration === 30 || savedSessionDuration === 45 || savedSessionDuration === 60 || savedSessionDuration === 90
      ? savedSessionDuration
      : 60;
    setPlanSetup({
      experienceLevel: profile.experience_level as PlanSetupInput["experienceLevel"],
      goal: normalizePlanGoal(profile.goal),
      injuryNotes: profile.injury_notes ?? "",
      movementRestrictions: Array.isArray(profile.movement_restrictions) ? profile.movement_restrictions : [],
      nutritionAdherence: profile.nutrition_adherence === "low" || profile.nutrition_adherence === "high"
        ? profile.nutrition_adherence
        : "moderate",
      proteinTargetMet: Boolean(profile.protein_target_met),
      recoveryStatus: profile.recovery_status === "low" || profile.recovery_status === "high"
        ? profile.recovery_status
        : "normal",
      currentBodyWeightKg: profile.current_body_weight_kg ? String(profile.current_body_weight_kg) : "",
      targetBodyWeightKg: profile.current_body_weight_kg && profile.target_weight_change_kg_per_week
        ? String(Number(profile.current_body_weight_kg) + Number(profile.target_weight_change_kg_per_week) * 4)
        : "",
      weightChangeLast14DaysKg: profile.weight_change_last_14_days_kg ? String(profile.weight_change_last_14_days_kg) : "",
      sessionDurationMinutes,
      lifts: loadedMainLifts.map((exercise) => {
        const estimatedOneRepMax = estimatedByExerciseId.get(exercise.id) ?? 0;
        const workingWeight = inferFiveRepWorkingWeight(estimatedOneRepMax, Number(exercise.default_increment) || 2.5);
        return { exerciseId: exercise.id, weightKg: workingWeight ? String(workingWeight) : "", reps: "5" };
      }),
      accessoryLifts: allExercises.filter((exercise) => !exercise.is_main_lift && isCalibratableAccessory(exercise.slug)).map((exercise) => {
        const estimatedOneRepMax = estimatedByExerciseId.get(exercise.id) ?? 0;
        const workingWeight = inferFiveRepWorkingWeight(estimatedOneRepMax, Number(exercise.default_increment) || 2.5);
        return { exerciseId: exercise.id, weightKg: workingWeight ? String(workingWeight) : "", reps: "10" };
      }),
      weekCount: 4,
      trainingDaysPerWeek
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
        training_days_per_week: parsed.value.trainingDaysPerWeek,
        available_weekdays: selectedWeekdays,
        session_duration_minutes: parsed.value.sessionDurationMinutes,
        injury_notes: parsed.value.injuryNotes || null,
        movement_restrictions: parsed.value.movementRestrictions,
        current_body_weight_kg: parsed.value.currentBodyWeightKg,
        target_weight_change_kg_per_week: parsed.value.targetWeightChangeKgPerWeek,
        weight_change_last_14_days_kg: parsed.value.weightChangeLast14DaysKg,
        nutrition_adherence: parsed.value.nutritionAdherence,
        protein_target_met: parsed.value.proteinTargetMet,
        recovery_status: parsed.value.recoveryStatus,
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

    const incrementById = new Map([...mainLifts, ...accessoryExercises].map((exercise) => [exercise.id, Number(exercise.default_increment) || 2.5]));
    const liftPayload = [...parsed.value.lifts, ...parsed.value.accessoryLifts].map((lift) => {
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

  async function saveProfileContext() {
    if (!userId) return;

    const parsed = validateProfileContext(planSetup);
    if (!parsed.ok) {
      setPlanSetupErrors(parsed.fieldErrors);
      return;
    }

    setStatus("generating");
    setMessage("");
    const { error } = await createBrowserSupabaseClient()
      .from(DB_TABLE.athleteProfiles)
      .update({
        current_body_weight_kg: parsed.value.currentBodyWeightKg,
        target_weight_change_kg_per_week: parsed.value.targetWeightChangeKgPerWeek,
        weight_change_last_14_days_kg: parsed.value.weightChangeLast14DaysKg,
        nutrition_adherence: parsed.value.nutritionAdherence,
        protein_target_met: parsed.value.proteinTargetMet,
        recovery_status: parsed.value.recoveryStatus,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId);

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    clearTrainingDataCaches();
    setPlanSetupErrors({});
    setShowProfileContext(false);
    setMessage("画像数据已保存；下次重建计划时会使用这些体重、饮食与恢复数据。");
    setStatus("ready");
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
      () => supabase.from(DB_TABLE.workouts).select("id,scheduled_date,sequence_index,schedule_index,day_type,name,status").eq("program_id", programId).order("schedule_index", { ascending: true }),
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

    const { data: futureExercises, error: futureExerciseError } = await supabase
      .from(DB_TABLE.workoutExercises)
      .select("id,target_weight,exercises(default_increment)")
      .eq("exercise_id", recommendation.exercise_id)
      .in("workout_id", workoutIds);

    if (futureExerciseError) {
      setStatus("error");
      setMessage(futureExerciseError.message);
      return;
    }

    const updateResults = await Promise.all((futureExercises ?? []).map((exercise) => {
      const relatedExercise = Array.isArray(exercise.exercises) ? exercise.exercises[0] : exercise.exercises;
      const increment = Number(relatedExercise?.default_increment) || 2.5;
      return supabase
        .from(DB_TABLE.workoutExercises)
        .update({ target_weight: applyRecommendationWeight({ currentWeight: Number(exercise.target_weight), previousWeight: recommendation.previous_weight, appliedWeight, increment }) })
        .eq("id", exercise.id);
    }));
    const updateExerciseError = updateResults.find((result) => result.error)?.error;
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

    setMessage(`${recommendation.exercises?.name ?? "动作"} 的后续计划已按原有强度、容量和减量差异同步调整。`);
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

  async function openRegenerationDialog() {
    if (!userId) return;

    if (usesLegacyScheduleSchema) {
      setStatus("error");
      setMessage("数据库升级尚未完成，暂不能重新生成计划。现有训练记录仍可正常使用。");
      return;
    }

    const schedule: ScheduleConfig =
      scheduleMode === "fixed_weekdays"
        ? { mode: "fixed_weekdays", weekdays: selectedWeekdays }
        : scheduleMode === "cadence"
          ? { mode: "cadence", trainDays: cadenceTrainDays, restDays: cadenceRestDays }
          : { mode: "flexible" };
    const scheduleValidation = validateScheduleAndTemplate({ templateType, trainingDaysPerWeek: planSetup.trainingDaysPerWeek, schedule });
    if (!scheduleValidation.ok) {
      setStatus("error");
      setMessage(scheduleValidation.message);
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
      const validatedSetup = validatePlanSetup(planSetup);
      if (!validatedSetup.ok) return;

      const supabase = createBrowserSupabaseClient();
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
            estimatedOneRepMax: Number(lift.estimated_1rm),
            trainingMax: Number(lift.training_max),
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
        experienceLevel: planSetup.experienceLevel || "novice",
        goal: planSetup.goal,
        weekCount: planSetup.weekCount,
        trainingDaysPerWeek: planSetup.trainingDaysPerWeek,
        nutritionAdherence: planSetup.nutritionAdherence,
        proteinTargetMet: planSetup.proteinTargetMet,
        recoveryStatus: planSetup.recoveryStatus,
        currentBodyWeightKg: Number(planSetup.currentBodyWeightKg) || null,
        targetWeightChangeKgPerWeek: validatedSetup.value.targetWeightChangeKgPerWeek,
        weightChangeLast14DaysKg: Number(planSetup.weightChangeLast14DaysKg) || null
        , restrictions: validatedSetup.value.movementRestrictions,
        sessionDurationMinutes: validatedSetup.value.sessionDurationMinutes
      });

      const payload = buildProgramReplacementPayload({
        customTemplateName: useCustomName ? customTemplateName.trim() : null,
        exerciseIdsBySlug: new Map(exerciseRows.map((exercise) => [exercise.slug, exercise.id])),
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
  const nextPlanWorkout = workouts.find((workout) => workout.id === nextPlanWorkoutId) ?? null;
  const nextPlanWorkoutMeta = nextPlanWorkout ? getWorkoutMeta(nextPlanWorkout.name) : null;
  const nextPlanWorkoutState = nextPlanWorkout ? getPlanWorkoutState(nextPlanWorkout, true) : null;
  const currentCycle = planOutline
    .find((week) => week.week === defaultPosition.week)
    ?.cycles.find((cycle) => cycle.index === defaultPosition.cycleIndex);

  return (
    <div className="space-y-5">
      {(!program || showPlanSetup) ? (
        <>
          {program ? (
            <div className="flex justify-end">
              <button
                className="pressable rounded-md border border-line bg-white px-4 py-2 font-semibold text-ink"
                onClick={() => setShowPlanSetup(false)}
                type="button"
              >
                取消调整
              </button>
            </div>
          ) : null}
          <PlanBuilder
            cadenceRestDays={cadenceRestDays}
            cadenceTrainDays={cadenceTrainDays}
            customTemplateName={customTemplateName}
            scheduleMode={scheduleMode}
            selectedWeekdays={selectedWeekdays}
            setCadenceRestDays={setCadenceRestDays}
            setCadenceTrainDays={setCadenceTrainDays}
            setCustomTemplateName={setCustomTemplateName}
            setScheduleMode={setScheduleMode}
            setSelectedWeekdays={setSelectedWeekdays}
            setTemplateType={setTemplateType}
            setUseCustomName={setUseCustomName}
            templateType={templateType}
            useCustomName={useCustomName}
          />
        </>
      ) : null}

      {(!program || showPlanSetup) ? (
        <>
          <PlanSetupForm
            accessoryExercises={accessoryExercises}
            errors={planSetupErrors}
            mainLifts={mainLifts}
            onChange={(value) => {
              if (value.trainingDaysPerWeek !== planSetup.trainingDaysPerWeek) setTemplateType(getTemplateType(value.trainingDaysPerWeek));
              setPlanSetup(value);
            }}
            value={planSetup}
          />
          <PlanGenerationRationale value={planSetup} />
        </>
      ) : null}

      {program && showProfileContext ? (
        <ProfileContextForm
          errors={planSetupErrors}
          isSaving={status === "generating"}
          onChange={setPlanSetup}
          onSave={saveProfileContext}
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
        <CurrentProgramOverview
          currentCycleLabel={currentCycle ? `循环 ${currentCycle.index}` : null}
          currentWeek={defaultPosition.week}
          endDate={program.end_date}
          isBusy={status === "generating"}
          managementOpen={managementOpen}
          name={program.name}
          nextWorkout={nextPlanWorkout && nextPlanWorkoutMeta && nextPlanWorkoutState ? {
            date: nextPlanWorkout.scheduled_date,
            focus: nextPlanWorkoutMeta.focus,
            intent: nextPlanWorkoutMeta.intent,
            name: nextPlanWorkout.name,
            stateLabel: nextPlanWorkoutState.label
          } : null}
          onAdjustPlan={() => {
            setManagementOpen(false);
            setShowPlanSetup(true);
          }}
          onRegenerate={openRegenerationDialog}
          onToggleManagement={() => setManagementOpen((current) => !current)}
          onToggleProfile={() => setShowProfileContext((current) => !current)}
          profileOpen={showProfileContext}
          startDate={program.start_date}
        />
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
        <PlanScheduleOutline
          defaultCycleIndex={defaultPosition.cycleIndex}
          defaultWeek={defaultPosition.week}
          mode={scheduleExpansionMode}
          onModeChange={setScheduleExpansionMode}
          outline={planOutline}
          renderWorkout={(workout, index) => {
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
                    <div className="border-b border-line/70 px-1 py-2 text-sm last:border-b-0" key={exercise.id}>
                      <div className="flex items-center justify-between gap-3">
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
                      <details className="mt-1 text-xs text-muted">
                        <summary className="cursor-pointer">查看处方依据</summary>
                        <p className="mt-1 leading-5">{getPlanExerciseExplanation({
                          exerciseSlug: exercise.exercises?.slug,
                          targetReps: exercise.target_reps,
                          targetSets: exercise.target_sets,
                          targetWeight: Number(exercise.target_weight),
                          isAccessoryCalibrated: accessoryExercises.some((item) => item.slug === exercise.exercises?.slug && Number(planSetup.accessoryLifts?.find((lift) => lift.exerciseId === item.id)?.weightKg) > 0),
                          value: planSetup
                        })}</p>
                      </details>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
            );
          }}
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

export function getProgramWeekCount(program: Pick<ProgramRow, "start_date" | "end_date">) {
  const start = Date.parse(`${program.start_date}T00:00:00Z`);
  const end = Date.parse(`${program.end_date}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 4;
  return Math.min(12, Math.max(1, Math.ceil((end - start + 86_400_000) / 604_800_000)));
}

export function ProfileContextForm({
  errors,
  isSaving,
  onChange,
  onSave,
  value
}: {
  errors: Record<string, string>;
  isSaving: boolean;
  onChange: (value: PlanSetupInput) => void;
  onSave: () => void;
  value: PlanSetupInput;
}) {
  function update(patch: Partial<PlanSetupInput>) {
    onChange({ ...value, ...patch });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-4">
        <p className="page-kicker">训练画像</p>
        <h2 className="text-xl font-bold">更新体重、饮食与恢复</h2>
        <p className="mt-1 text-sm leading-6 text-muted">保存不会修改当前周期、已安排的训练或历史记录；这些数据会用于下一次重建计划。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">当前体重（可选）</span>
          <input
            aria-label="当前体重 kg"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            inputMode="decimal"
            max="300"
            min="30"
            onChange={(event) => update({ currentBodyWeightKg: event.target.value })}
            placeholder="例如 70"
            step="0.1"
            type="number"
            value={value.currentBodyWeightKg ?? ""}
          />
          {errors.currentBodyWeightKg ? <p className="mt-1 text-xs text-red-600">{errors.currentBodyWeightKg}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">目标体重（可选）</span>
          <input
            aria-label="目标体重 kg"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            inputMode="decimal"
            max="300"
            min="30"
            onChange={(event) => update({ targetBodyWeightKg: event.target.value })}
            placeholder="例如 65"
            step="0.1"
            type="number"
            value={value.targetBodyWeightKg ?? ""}
          />
          <p className="mt-1 text-xs text-muted">按 {value.weekCount} 周换算为每周体重变化。</p>
          {errors.targetBodyWeightKg ? <p className="mt-1 text-xs text-red-600">{errors.targetBodyWeightKg}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">近 14 天体重变化（可选）</span>
          <input
            aria-label="近14天体重变化 kg"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            inputMode="decimal"
            max="3"
            min="-3"
            onChange={(event) => update({ weightChangeLast14DaysKg: event.target.value })}
            placeholder="当前体重 - 14 天前体重"
            step="0.1"
            type="number"
            value={value.weightChangeLast14DaysKg ?? ""}
          />
          {errors.weightChangeLast14DaysKg ? <p className="mt-1 text-xs text-red-600">{errors.weightChangeLast14DaysKg}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">饮食执行度</span>
          <select
            aria-label="饮食执行度"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) => update({ nutritionAdherence: event.target.value as PlanSetupInput["nutritionAdherence"] })}
            value={value.nutritionAdherence ?? "moderate"}
          >
            <option value="high">高：大部分时间按计划执行</option>
            <option value="moderate">中：有少量偏离</option>
            <option value="low">低：近期难以稳定执行</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">恢复状态</span>
          <select
            aria-label="恢复状态"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) => update({ recoveryStatus: event.target.value as PlanSetupInput["recoveryStatus"] })}
            value={value.recoveryStatus ?? "normal"}
          >
            <option value="high">良好：睡眠、精力和酸痛都可控</option>
            <option value="normal">一般：可正常训练</option>
            <option value="low">偏低：疲劳、睡眠或酸痛影响训练</option>
          </select>
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          checked={value.proteinTargetMet ?? false}
          className="mt-1 h-4 w-4"
          onChange={(event) => update({ proteinTargetMet: event.target.checked })}
          type="checkbox"
        />
        <span>近期大多数日子达到自己的蛋白质目标</span>
      </label>
      <button
        className="pressable mt-4 inline-flex h-11 items-center justify-center rounded-md bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        onClick={onSave}
        type="button"
      >
        {isSaving ? "保存中…" : "保存画像数据"}
      </button>
    </section>
  );
}

export function PlanSetupForm({
  accessoryExercises,
  errors,
  mainLifts,
  onChange,
  value
}: {
  accessoryExercises?: ExerciseRow[];
  errors: Record<string, string>;
  mainLifts: ExerciseRow[];
  onChange: (value: PlanSetupInput) => void;
  value: PlanSetupInput;
}) {
  function update(patch: Partial<PlanSetupInput>) {
    onChange({ ...value, ...patch });
  }

  function updateLift(exerciseId: string, patch: Partial<{ weightKg: string; reps: string }>, kind: "main" | "accessory" = "main") {
    const source = kind === "main" ? value.lifts : value.accessoryLifts ?? [];
    const lifts = source.find((lift) => lift.exerciseId === exerciseId)
      ? source.map((lift) => lift.exerciseId === exerciseId ? { ...lift, ...patch } : lift)
      : [...source, { exerciseId, weightKg: "", reps: kind === "main" ? "5" : "10", ...patch }];
    update(kind === "main" ? { lifts } : { accessoryLifts: lifts });
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
          <span className="mb-1 block text-sm font-medium">每周训练天数</span>
          <select
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) => update({ trainingDaysPerWeek: Number(event.target.value) })}
            value={value.trainingDaysPerWeek}
          >
            <option value={3}>3 天</option>
            <option value={4}>4 天</option>
            <option value={7}>7 天</option>
          </select>
          {errors.trainingDaysPerWeek ? <p className="mt-1 text-xs text-red-600">{errors.trainingDaysPerWeek}</p> : null}
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
          <span className="mb-1 block text-sm font-medium">单次训练时长</span>
          <select
            aria-label="单次训练时长"
            className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
            onChange={(event) => update({ sessionDurationMinutes: Number(event.target.value) })}
            value={value.sessionDurationMinutes ?? 60}
          >
            <option value={30}>30 分钟：只保留主项与最必要辅助</option>
            <option value={45}>45 分钟：主项优先，精简辅助</option>
            <option value={60}>60 分钟：标准训练量</option>
            <option value={90}>90 分钟：完整训练量</option>
          </select>
          {errors.sessionDurationMinutes ? <p className="mt-1 text-xs text-red-600">{errors.sessionDurationMinutes}</p> : null}
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
            <option value="strength">力量举（Powerlifting）</option>
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
        <span className="mb-1 block text-sm font-medium">伤病或禁忌备注（可选）</span>
        <textarea
          className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          maxLength={500}
          onChange={(event) => update({ injuryNotes: event.target.value })}
          placeholder="例如：右肩不适；此处仅作为备注，不会自动推断医疗结论"
          value={value.injuryNotes}
        />
        <p className="mt-2 text-xs text-muted">备注不会触发医疗判断。需要自动避开的训练动作请在下方选择结构化限制。</p>
      </label>

      <fieldset className="mt-3 rounded-lg border border-line bg-field p-3">
        <legend className="px-1 text-sm font-medium">动作限制（可选）</legend>
        <p className="text-xs leading-5 text-muted">仅按你明确选择的动作类别替换模板；无法安全替代时会阻止生成。</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {[
            ["avoid_overhead_press", "避免过顶推"],
            ["avoid_horizontal_push", "避免水平推"],
            ["avoid_deep_knee_flexion", "避免深屈膝"],
            ["avoid_deadlift_hip_hinge", "避免硬拉/髋铰链"]
          ].map(([restriction, label]) => {
            const checked = value.movementRestrictions?.includes(restriction as NonNullable<PlanSetupInput["movementRestrictions"]>[number]) ?? false;
            return (
              <label className="flex items-center gap-2 text-sm" key={restriction}>
                <input
                  checked={checked}
                  onChange={() => update({
                    movementRestrictions: checked
                      ? (value.movementRestrictions ?? []).filter((item) => item !== restriction)
                      : [...(value.movementRestrictions ?? []), restriction as NonNullable<PlanSetupInput["movementRestrictions"]>[number]]
                  })}
                  type="checkbox"
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 rounded-lg border border-line bg-slate-50 p-3">
        <h3 className="font-semibold">体重、饮食与恢复</h3>
        <p className="mt-1 text-xs leading-5 text-muted">减脂与塑形会根据体重变化率、饮食执行和恢复状态保护训练量；其他目标也会参考恢复状态。数据只用于训练处方，不构成医疗或营养诊断。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">当前体重（可选）</span>
            <input
              aria-label="当前体重 kg"
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              inputMode="decimal"
              min="30"
              max="300"
              onChange={(event) => update({ currentBodyWeightKg: event.target.value })}
              placeholder="例如 75"
              step="0.1"
              type="number"
              value={value.currentBodyWeightKg ?? ""}
            />
            {errors.currentBodyWeightKg ? <p className="mt-1 text-xs text-red-600">{errors.currentBodyWeightKg}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">目标体重（可选）</span>
            <input
              aria-label="目标体重 kg"
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              inputMode="decimal"
              min="30"
              max="300"
              onChange={(event) => update({ targetBodyWeightKg: event.target.value })}
              placeholder="例如 65"
              step="0.1"
              type="number"
              value={value.targetBodyWeightKg ?? ""}
            />
            <p className="mt-1 text-xs text-muted">系统会按 {value.weekCount} 周自动换算每周体重变化。</p>
            {errors.targetBodyWeightKg ? <p className="mt-1 text-xs text-red-600">{errors.targetBodyWeightKg}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">近 14 天体重变化（可选）</span>
            <input
              aria-label="近14天体重变化 kg"
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              inputMode="decimal"
              min="-3"
              max="3"
              onChange={(event) => update({ weightChangeLast14DaysKg: event.target.value })}
              placeholder="当前体重 - 14 天前体重"
              step="0.1"
              type="number"
              value={value.weightChangeLast14DaysKg ?? ""}
            />
            {errors.weightChangeLast14DaysKg ? <p className="mt-1 text-xs text-red-600">{errors.weightChangeLast14DaysKg}</p> : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">饮食执行度</span>
            <select
              aria-label="饮食执行度"
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(event) => update({ nutritionAdherence: event.target.value as PlanSetupInput["nutritionAdherence"] })}
              value={value.nutritionAdherence ?? "moderate"}
            >
              <option value="high">高：大部分时间按计划执行</option>
              <option value="moderate">中：有少量偏离</option>
              <option value="low">低：近期难以稳定执行</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">恢复状态</span>
            <select
              aria-label="恢复状态"
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(event) => update({ recoveryStatus: event.target.value as PlanSetupInput["recoveryStatus"] })}
              value={value.recoveryStatus ?? "normal"}
            >
              <option value="high">良好：睡眠、精力和酸痛都可控</option>
              <option value="normal">一般：可正常训练</option>
              <option value="low">偏低：疲劳、睡眠或酸痛影响训练</option>
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            checked={value.proteinTargetMet ?? false}
            className="mt-1 h-4 w-4"
            onChange={(event) => update({ proteinTargetMet: event.target.checked })}
            type="checkbox"
          />
          <span>近期大多数日子达到自己的蛋白质目标</span>
        </label>
      </div>

      <div className="mt-5">
        <h3 className="font-semibold">主项最近工作组</h3>
        <p className="mt-1 text-sm text-muted">
          {value.experienceLevel === "beginner"
            ? "新手可跳过，首次训练后再补充实际工作组。"
            : "训练满 6 个月需要至少填写一个稳定完成的主项工作组，例如卧推 80kg × 5。"}
        </p>
        <div className="mt-3 space-y-3">
          {mainLifts.map((exercise) => {
            const lift = value.lifts.find((item) => item.exerciseId === exercise.id) ?? {
              exerciseId: exercise.id,
              weightKg: "",
              reps: "5"
            };
            return (
              <div className="grid grid-cols-[minmax(0,1fr)_96px_64px] items-end gap-2" key={exercise.id}>
                <p className="min-w-0 truncate pb-2 font-medium">{exercise.name}</p>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-muted">重量 kg</span>
                  <input
                    aria-label={`${exercise.name}重量 kg`}
                    className="h-10 w-full rounded-md border border-line bg-white px-2 text-right text-sm tabular-nums"
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
      {(accessoryExercises ?? []).length > 0 ? (
        <div className="mt-5">
          <h3 className="font-semibold">辅助动作最近稳定工作组（可选）</h3>
          <p className="mt-1 text-sm text-muted">可跳过。录入后会优先按该动作自己的能力锚点处方；未录入则使用保守估算并标记待校准。</p>
          <div className="mt-3 space-y-3">
            {accessoryExercises?.map((exercise) => {
              const lift = value.accessoryLifts?.find((item) => item.exerciseId === exercise.id) ?? { exerciseId: exercise.id, weightKg: "", reps: "10" };
              return <div className="grid grid-cols-[minmax(0,1fr)_96px_64px] items-end gap-2" key={exercise.id}>
                <p className="min-w-0 truncate pb-2 font-medium">{exercise.name}</p>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">重量 kg</span><input aria-label={`${exercise.name}辅助重量 kg`} className="h-10 w-full rounded-md border border-line bg-white px-2 text-right text-sm tabular-nums" inputMode="decimal" min="0" onChange={(event) => updateLift(exercise.id, { weightKg: event.target.value }, "accessory")} step="0.5" type="number" value={lift.weightKg} /></label>
                <label className="block"><span className="mb-1 block text-[11px] text-muted">次数</span><input aria-label={`${exercise.name}辅助次数`} className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm" inputMode="numeric" min="1" onChange={(event) => updateLift(exercise.id, { reps: event.target.value }, "accessory")} type="number" value={lift.reps} /></label>
              </div>;
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function PlanGenerationRationale({ value }: { value: PlanSetupInput }) {
  const goalLabel = {
    strength: "力量举",
    hypertrophy: "增肌",
    hypertrophy_strength: "力型兼备",
    fat_loss: "减脂",
    body_recomposition: "塑形"
  }[value.goal];
  const experienceLabel = value.experienceLevel === "beginner"
    ? "新手，0-6 个月"
    : value.experienceLevel === "novice"
      ? "初级，6-18 个月"
      : value.experienceLevel === "intermediate"
        ? "中级，18 个月以上"
        : "待选择";
  const recoveryLabel = value.recoveryStatus === "low"
    ? "偏低"
    : value.recoveryStatus === "high"
      ? "良好"
      : "一般";
  const liftCount = value.lifts.filter((lift) => Number(lift.weightKg) > 0 && Number(lift.reps) > 0).length;

  return (
    <section className="rounded-lg border border-line bg-field p-3 text-sm">
      <h3 className="font-semibold">本计划参考</h3>
      <div className="mt-2 grid gap-1 text-muted">
        <p>主要目标：{goalLabel}</p>
        <p>训练经验：{experienceLabel}</p>
        <p>每周训练天数：{value.trainingDaysPerWeek} 天</p>
        <p>主项工作组：{liftCount > 0 ? `已录入 ${liftCount} 项` : value.experienceLevel === "beginner" ? "未录入，将使用技术起始处方" : "待录入"}</p>
        <p>恢复状态：{recoveryLabel}</p>
      </div>
    </section>
  );
}

function PlanBuilder({
  cadenceRestDays,
  cadenceTrainDays,
  customTemplateName,
  scheduleMode,
  selectedWeekdays,
  setCadenceRestDays,
  setCadenceTrainDays,
  setCustomTemplateName,
  setScheduleMode,
  setSelectedWeekdays,
  setTemplateType,
  setUseCustomName,
  templateType,
  useCustomName
}: {
  cadenceRestDays: number;
  cadenceTrainDays: number;
  customTemplateName: string;
  scheduleMode: ScheduleMode;
  selectedWeekdays: number[];
  setCadenceRestDays: (value: number) => void;
  setCadenceTrainDays: (value: number) => void;
  setCustomTemplateName: (value: string) => void;
  setScheduleMode: (value: ScheduleMode) => void;
  setSelectedWeekdays: (value: number[]) => void;
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

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">安排方式</span>
          <select
            className="h-11 w-full rounded-lg border border-line bg-field px-3 text-sm"
            onChange={(event) => setScheduleMode(event.target.value as ScheduleMode)}
            value={scheduleMode}
          >
            <option value="fixed_weekdays">固定星期</option>
            <option value="cadence">练休循环</option>
            <option value="flexible">自由安排</option>
          </select>
        </label>
        {scheduleMode === "cadence" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">训练与休息节奏（练几休几）</span>
            <select
              className="h-11 w-full rounded-lg border border-line bg-field px-3 text-sm"
              onChange={(event) => {
                const [trainDays, restDays] = event.target.value.split("-").map(Number);
                setCadenceTrainDays(trainDays);
                setCadenceRestDays(restDays);
              }}
              value={`${cadenceTrainDays}-${cadenceRestDays}`}
            >
              <option value="1-0">练一休零（连续训练）</option>
              <option value="1-1">练一休一</option>
              <option value="1-2">练一休二</option>
              <option value="3-1">练三休一</option>
              <option value="4-1">练四休一</option>
            </select>
          </label>
        ) : null}
        {scheduleMode === "flexible" ? (
          <p className="rounded-lg bg-field px-3 py-2 text-sm leading-5 text-muted">
            计划按训练序列继续；日期只是建议，可在有空时完成下一节。
          </p>
        ) : null}
      </div>

      {scheduleMode === "fixed_weekdays" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {weekdayOptions.map((weekday) => {
            const active = selectedWeekdays.includes(weekday.value);
            return (
              <button
                className={`rounded-full px-3 py-2 text-sm font-semibold ${active ? "bg-action text-white" : "border border-line bg-field text-ink"}`}
                key={weekday.value}
                onClick={() =>
                  setSelectedWeekdays(
                    active
                      ? selectedWeekdays.filter((value) => value !== weekday.value)
                      : [...selectedWeekdays, weekday.value].sort((a, b) => a - b)
                  )
                }
                type="button"
              >
                {weekday.label}
              </button>
            );
          })}
        </div>
      ) : null}

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
  if (templateType === "four_day_upper_lower") return "历史上下肢四分化计划";
  if (templateType === "five_split") return "五分化训练循环";
  return "训练循环";
}

function normalizePlanGoal(goal: string): PlanSetupInput["goal"] {
  if (goal === "hypertrophy" || goal === "hypertrophy_strength" || goal === "fat_loss" || goal === "body_recomposition" || goal === "strength") {
    return goal;
  }
  return "strength";
}

export function getPlanGenerationErrorMessage(error: unknown) {
  if (error instanceof TypeError && /load failed|failed to fetch/i.test(error.message)) {
    return "网络连接失败，请检查网络后重试。已填写的计划参数仍会保留。";
  }
  if (error instanceof Error && /^当前限制条件下，(?:腿部|当前训练方向)训练没有可安全替代的动作，请调整限制或咨询专业人士后再生成计划。$/.test(error.message)) {
    return error.message;
  }
  return "计划预览生成失败，请检查训练设置后重试。";
}

function getPlanLoadErrorMessage(error: unknown) {
  if (error instanceof TypeError && /load failed|failed to fetch/i.test(error.message)) {
    return "网络连接失败，请检查网络后刷新页面重试。已填写的计划参数不会丢失。";
  }
  return "计划数据读取失败，请刷新页面重试。";
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

function isCalibratableAccessory(slug: string) {
  return !["pull_up", "cardio_zone2"].includes(slug);
}

function inferFiveRepWorkingWeight(estimatedOneRepMax: number, increment: number) {
  if (estimatedOneRepMax <= 0) {
    return 0;
  }

  return Math.round((estimatedOneRepMax / (1 + 5 / 30)) / increment) * increment;
}

export function getPlanExerciseExplanation({
  exerciseSlug,
  targetSets,
  targetReps,
  targetWeight,
  isAccessoryCalibrated = false,
  value
}: {
  exerciseSlug?: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
  isAccessoryCalibrated?: boolean;
  value: PlanSetupInput;
}) {
  const isMainLift = ["bench_press", "back_squat", "deadlift", "overhead_press"].includes(exerciseSlug ?? "");
  const goalLabel = { strength: "目标", hypertrophy: "增肌目标", hypertrophy_strength: "力型兼备目标", fat_loss: "减脂目标", body_recomposition: "塑形目标" }[value.goal];
  const duration = value.sessionDurationMinutes ?? 60;
  if (isMainLift && targetWeight <= 0) {
    return `技术起始：尚未录入稳定主项工作组，本次以动作练习为主；目标 ${targetSets} 组 × ${targetReps} 次。${goalLabel}、${value.experienceLevel === "beginner" ? "新手训练量" : "当前经验"}、恢复状态和 ${duration} 分钟时长已用于安排。`;
  }
  if (isMainLift) {
    return `能力锚点来自你录入的稳定主项工作组，按目标 ${targetSets} 组 × ${targetReps} 次换算处方 ${targetWeight} kg，并按器械增量取整。${goalLabel}、训练经验、恢复状态和 ${duration} 分钟时长会调整组次或训练量。`;
  }
  return targetWeight > 0
    ? isAccessoryCalibrated
      ? `辅助动作已校准：优先采用该动作自己的稳定工作组作为能力锚点；目标 ${targetSets} 组 × ${targetReps} 次，重量 ${targetWeight} kg 按器械增量取整。`
      : `辅助动作当前采用保守估算待校准；目标 ${targetSets} 组 × ${targetReps} 次，重量 ${targetWeight} kg 按器械增量取整。录入该动作自己的稳定工作组后，会优先使用它自己的能力锚点。`
    : `这是自重或技术起始动作；目标 ${targetSets} 组 × ${targetReps} 次，不强制填写重量。`;
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

function getProgramWeekNumber(startDate: string, now: Date) {
  const start = new Date(`${startDate}T00:00:00`);
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000 / 7) + 1);
}

function getDefaultPlanWeek(
  outline: Array<{ week: number; totalTrainingDays: number; completedTrainingDays: number }> ,
  startDate: string,
  now: Date
) {
  const currentWeek = getProgramWeekNumber(startDate, now);
  if (outline.some((item) => item.week === currentWeek)) return currentWeek;
  return outline.find((item) => item.completedTrainingDays < item.totalTrainingDays)?.week ?? outline.at(-1)?.week ?? 1;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
