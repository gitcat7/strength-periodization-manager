import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgentRequest } from "@/lib/agent-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { loadWorkoutsWithDayTypeFallback } from "@/lib/workout-day-type-compat";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  action: z.enum([
    "today",
    "plan",
    "history",
    "progress",
    "pr_goals",
    "record_set",
    "complete_workout"
  ]),
  actual_reps: z.number().int().min(0).max(1000).optional(),
  actual_weight: z.number().min(0).max(2000).optional(),
  completed: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  rpe: z.number().min(1).max(10).optional(),
  set_index: z.number().int().min(1).max(100).optional(),
  workout_exercise_id: z.string().uuid().optional(),
  workout_id: z.string().uuid().optional()
}).strict();

export async function POST(request: Request) {
  try {
    const identity = await authenticateAgentRequest(request);
    if (!identity) {
      return jsonError("令牌无效、已撤销或已过期。", 401, "unauthorized");
    }

    const payload = requestSchema.safeParse(await request.json());
    if (!payload.success) {
      return jsonError("请求参数不完整或格式不正确。", 400, "invalid_request", payload.error.flatten());
    }

    const result = await runAction(identity.userId, payload.data);
    return NextResponse.json(
      { data: result, ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent API 请求失败。";
    const notFound = message.startsWith("找不到") || message.startsWith("不属于");
    const invalidRequest = message.startsWith("记录训练组需要") || message.startsWith("完成训练需要") || message.startsWith("组序号");
    const status = notFound ? 404 : invalidRequest ? 400 : 500;
    return jsonError(message, status, notFound ? "not_found" : invalidRequest ? "invalid_request" : "server_error");
  }
}

type AgentRequest = z.infer<typeof requestSchema>;

async function runAction(userId: string, request: AgentRequest) {
  switch (request.action) {
    case "today":
      return loadToday(userId, request.date);
    case "plan":
      return loadPlan(userId);
    case "history":
      return loadHistory(userId, request.limit ?? 10);
    case "progress":
      return loadProgress(userId);
    case "pr_goals":
      return loadPrGoals(userId);
    case "record_set":
      return recordSet(userId, request);
    case "complete_workout":
      return completeWorkout(userId, request.workout_id);
  }
}

async function loadToday(userId: string, requestedDate?: string) {
  const supabase = createAdminSupabaseClient();
  const date = requestedDate ?? formatDate(new Date());
  const { data: program, error: programError } = await supabase
    .from("programs")
    .select("id,name,start_date,end_date")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (programError) throw new Error(programError.message);
  if (!program) return { message: "当前没有进行中的训练计划。", program: null, workout: null };

  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .select("id,scheduled_date,sequence_index,name,status,completed_at")
    .eq("user_id", userId)
    .eq("program_id", program.id)
    .neq("status", "completed")
    .in("status", ["scheduled", "draft"])
    .order("sequence_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workoutError) throw new Error(workoutError.message);
  if (!workout) return { message: "当前计划没有待完成训练。", program, workout: null };

  return {
    message: workout.scheduled_date === date ? "这是今天的训练。" : "返回训练序列中的下一次待完成训练。",
    program,
    workout: await loadWorkoutDetail(userId, workout)
  };
}

async function loadPlan(userId: string) {
  const supabase = createAdminSupabaseClient();
  const { data: program, error: programError } = await supabase
    .from("programs")
    .select("id,name,template_type,status,start_date,end_date")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (programError) throw new Error(programError.message);
  if (!program) return { message: "当前没有进行中的训练计划。", program: null, workouts: [] };

  const { data: workouts, error: workoutsError } = await loadWorkoutsWithDayTypeFallback(
    () => supabase.from("workouts").select("id,scheduled_date,sequence_index,schedule_index,day_type,name,status,completed_at").eq("user_id", userId).eq("program_id", program.id).order("schedule_index", { ascending: true }),
    () => supabase.from("workouts").select("id,scheduled_date,sequence_index,name,status,completed_at").eq("user_id", userId).eq("program_id", program.id).order("sequence_index", { ascending: true })
  );

  if (workoutsError) throw new Error(workoutsError.message);

  return {
    program,
    workouts: await Promise.all((workouts ?? []).map((workout: { completed_at: string | null; id: string; name: string; scheduled_date: string; sequence_index?: number; status: string }) => loadWorkoutDetail(userId, workout)))
  };
}

async function loadHistory(userId: string, limit: number) {
  const supabase = createAdminSupabaseClient();
  const { data: workouts, error } = await loadWorkoutsWithDayTypeFallback(
    () => supabase.from("workouts").select("id,scheduled_date,name,status,completed_at,day_type").eq("user_id", userId).eq("status", "completed").eq("day_type", "training").order("scheduled_date", { ascending: false }).limit(limit),
    () => supabase.from("workouts").select("id,scheduled_date,name,status,completed_at").eq("user_id", userId).eq("status", "completed").order("scheduled_date", { ascending: false }).limit(limit)
  );

  if (error) throw new Error(error.message);
  return {
    count: workouts?.length ?? 0,
    workouts: await Promise.all((workouts ?? []).map((workout: { completed_at: string | null; id: string; name: string; scheduled_date: string; sequence_index?: number; status: string }) => loadWorkoutDetail(userId, workout)))
  };
}

async function loadProgress(userId: string) {
  const history = await loadHistory(userId, 20);
  let completedSets = 0;
  let totalVolume = 0;
  let rpeTotal = 0;
  let rpeCount = 0;

  for (const workout of history.workouts) {
    for (const exercise of workout.exercises) {
      for (const set of exercise.set_logs) {
        if (!set.completed) continue;
        completedSets += 1;
        totalVolume += Number(set.actual_weight ?? 0) * Number(set.actual_reps ?? 0);
        if (set.rpe != null) {
          rpeTotal += Number(set.rpe);
          rpeCount += 1;
        }
      }
    }
  }

  return {
    average_rpe: rpeCount > 0 ? round(rpeTotal / rpeCount, 1) : null,
    completed_sets: completedSets,
    completed_workouts: history.count,
    recent_workouts: history.workouts,
    total_volume_kg: round(totalVolume, 1)
  };
}

async function loadPrGoals(userId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("pr_goals")
    .select("id,current_estimated_1rm,target_weight,target_date,status,created_at,exercises(name,slug)")
    .eq("user_id", userId)
    .order("target_date", { ascending: true });

  if (error) throw new Error(error.message);
  return { goals: data ?? [] };
}

async function recordSet(userId: string, request: AgentRequest) {
  if (!request.workout_exercise_id || !request.set_index) {
    throw new Error("记录训练组需要 workout_exercise_id 和 set_index。");
  }
  if (request.actual_weight == null || request.actual_reps == null || request.rpe == null) {
    throw new Error("记录训练组需要实际重量、次数和 RPE。");
  }

  const supabase = createAdminSupabaseClient();
  const { data: exercise, error: exerciseError } = await supabase
    .from("workout_exercises")
    .select("id,workout_id,target_sets,target_reps,target_weight")
    .eq("id", request.workout_exercise_id)
    .maybeSingle();

  if (exerciseError) throw new Error(exerciseError.message);
  if (!exercise) throw new Error("找不到指定训练动作。");
  await assertWorkoutOwnership(userId, exercise.workout_id);
  if (request.set_index > exercise.target_sets) throw new Error("组序号超过该动作的计划组数。");

  const { data, error } = await supabase
    .from("set_logs")
    .upsert(
      {
        actual_reps: request.actual_reps,
        actual_weight: request.actual_weight,
        completed: request.completed ?? true,
        rpe: request.rpe,
        set_index: request.set_index,
        target_reps: exercise.target_reps,
        target_weight: exercise.target_weight,
        updated_at: new Date().toISOString(),
        workout_exercise_id: exercise.id
      },
      { onConflict: "workout_exercise_id,set_index" }
    )
    .select("id,workout_exercise_id,set_index,actual_weight,actual_reps,rpe,completed,updated_at")
    .single();

  if (error) throw new Error(error.message);
  return { message: "训练组已记录。", set: data };
}

async function completeWorkout(userId: string, workoutId?: string) {
  if (!workoutId) throw new Error("完成训练需要 workout_id。");
  await assertWorkoutOwnership(userId, workoutId);

  const supabase = createAdminSupabaseClient();
  const primary = () => supabase.from("workouts").update({ completed_at: new Date().toISOString(), status: "completed", updated_at: new Date().toISOString() }).eq("id", workoutId).eq("user_id", userId).eq("day_type", "training").select("id,name,scheduled_date,status,completed_at,day_type").single();
  const legacy = () => supabase.from("workouts").update({ completed_at: new Date().toISOString(), status: "completed", updated_at: new Date().toISOString() }).eq("id", workoutId).eq("user_id", userId).select("id,name,scheduled_date,status,completed_at").single();
  const { data, error } = await loadWorkoutsWithDayTypeFallback(primary, legacy);

  if (error) throw new Error(error.message);
  return { message: "训练已完成。", workout: data };
}

async function loadWorkoutDetail(
  userId: string,
  workout: { completed_at: string | null; id: string; name: string; scheduled_date: string; sequence_index?: number; status: string }
) {
  await assertWorkoutOwnership(userId, workout.id);
  const supabase = createAdminSupabaseClient();
  const { data: exercises, error: exerciseError } = await supabase
    .from("workout_exercises")
    .select("id,exercise_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug)")
    .eq("workout_id", workout.id)
    .order("order_index", { ascending: true });

  if (exerciseError) throw new Error(exerciseError.message);
  const exerciseIds = (exercises ?? []).map((exercise) => exercise.id);
  const { data: setLogs, error: logsError } = exerciseIds.length
    ? await supabase
        .from("set_logs")
        .select("id,workout_exercise_id,set_index,target_weight,target_reps,actual_weight,actual_reps,rpe,completed")
        .in("workout_exercise_id", exerciseIds)
        .order("set_index", { ascending: true })
    : { data: [], error: null };

  if (logsError) throw new Error(logsError.message);
  return {
    ...workout,
    exercises: (exercises ?? []).map((exercise) => ({
      ...exercise,
      set_logs: (setLogs ?? []).filter((set) => set.workout_exercise_id === exercise.id)
    }))
  };
}

async function assertWorkoutOwnership(userId: string, workoutId: string) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("不属于当前用户的训练，操作已拒绝。");
}

function jsonError(message: string, status: number, code: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, details, message }, ok: false },
    { headers: { "Cache-Control": "no-store" }, status }
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric"
  }).format(date);
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
