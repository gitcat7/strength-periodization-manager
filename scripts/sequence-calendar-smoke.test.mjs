import { expect, test } from "vitest";
import { buildFourWeekProgram } from "@/domain/program";
import { buildSequenceCalendar } from "@/domain/sequence-calendar";

// Authenticated sequence-calendar scheduling smoke.
//
// Required environment:
//   BASE_URL                         — deployed app, e.g. https://your-app.vercel.app
//   NEXT_PUBLIC_SUPABASE_URL         — same value the app uses
//   NEXT_PUBLIC_SUPABASE_ANON_KEY    — same value the app uses
//   QA_SMOKE_EMAIL / QA_SMOKE_PASSWORD — dedicated QA account with normal user rights
//
// Without BASE_URL the whole file skips so `pnpm test` stays offline-friendly.

const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const qaEmail = process.env.QA_SMOKE_EMAIL;
const qaPassword = process.env.QA_SMOKE_PASSWORD;

const runSmoke = baseUrl ? test : test.skip;

runSmoke("sequence calendar scheduling authenticated smoke", async () => {
  expect(
    supabaseUrl && anonKey && qaEmail && qaPassword,
    "认证冒烟需要 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY、QA_SMOKE_EMAIL、QA_SMOKE_PASSWORD"
  ).toBeTruthy();

  // The deployed app stays reachable for the plan and today surfaces.
  for (const path of ["/api/health", "/plan", "/today"]) {
    const response = await fetch(`${baseUrl}${path}`);
    expect(response.status, `${path} 应返回 200`).toBe(200);
  }

  // Schedule previews: cadence alternates training and rest.
  const cadencePreview = buildFourWeekProgram({
    templateType: "one_split",
    schedule: { mode: "cadence", trainDays: 1, restDays: 1 },
    exerciseProfiles: [],
    startDate: new Date("2026-09-07T00:00:00"),
    weekCount: 1
  });
  expect(cadencePreview.map((item) => item.dayType)).toEqual(["training", "rest", "training", "rest", "training", "rest", "training"]);

  // Weekend-rest preset never schedules on Saturday or Sunday.
  const weekdayPreview = buildFourWeekProgram({
    templateType: "one_split",
    schedule: { mode: "fixed_weekdays", weekdays: [1, 2, 3, 4, 5] },
    exerciseProfiles: [],
    startDate: new Date("2026-09-07T00:00:00"),
    weekCount: 2
  });
  for (const item of weekdayPreview) {
    if (item.dayType !== "training") continue;
    const weekday = new Date(`${item.scheduledDate}T00:00:00`).getDay();
    expect(weekday === 0 || weekday === 6, `${item.scheduledDate} 不应排在周末`).toBe(false);
  }

  // Holiday shift: a blocked statutory holiday hosts rest instead of training.
  const holidayCalendar = buildSequenceCalendar({
    startDate: "2026-09-24",
    // Ask for the next training day after the blocked date as well, otherwise
    // the calendar intentionally stops on 2026-09-24 before visiting 09-25.
    targetTrainingCount: 2,
    rule: { mode: "cadence", trainDays: 5, restDays: 1 },
    constraints: [{ date: "2026-09-25", kind: "holiday", allowsTraining: false, label: "中秋节" }]
  });
  const holidayItem = holidayCalendar.find((item) => item.scheduledDate === "2026-09-25");
  expect(holidayItem?.dayType).toBe("rest");
  expect(holidayItem?.blockedReasons).toContain("中秋节");

  // Authenticated API flow against the QA account.
  const session = await signIn();
  const headers = {
    apikey: anonKey,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
    prefer: "return=representation"
  };

  const exercises = await rest("cfg_exercises?select=id,slug&is_main_lift=eq.true&limit=2", { headers });
  expect(exercises.length, "QA 数据库应至少有两个主项动作").toBeGreaterThanOrEqual(2);

  const programId = await createCadenceProgram(headers, exercises);
  let revision = 1;

  try {
    // Personal unavailable date blocks 2026-09-09 (a planned training day).
    await rest("usr_unavailable_dates", {
      headers,
      method: "POST",
      body: { user_id: session.user.id, date: "2026-09-09", note: "冒烟测试出差日" }
    });

    const unavailableReflow = await rpc("reflow_program_schedule", headers, {
      program_id: programId,
      action: "unavailable_dates",
      expected_revision: revision,
      effective_date: "2026-09-07",
      schedule_items: [
        { workout_id: workoutIds.seq0, scheduled_date: "2026-09-07", schedule_index: 0, sequence_index: 0, day_type: "training", status: "scheduled" },
        { workout_id: workoutIds.rest1, scheduled_date: "2026-09-08", schedule_index: 1, sequence_index: null, day_type: "rest", status: "scheduled" },
        { workout_id: workoutIds.rest3, scheduled_date: "2026-09-09", schedule_index: 2, sequence_index: null, day_type: "rest", status: "scheduled" },
        { workout_id: workoutIds.seq1, scheduled_date: "2026-09-10", schedule_index: 3, sequence_index: 1, day_type: "training", status: "scheduled" },
        { workout_id: workoutIds.rest5, scheduled_date: "2026-09-11", schedule_index: 4, sequence_index: null, day_type: "rest", status: "scheduled" },
        { workout_id: workoutIds.seq2, scheduled_date: "2026-09-12", schedule_index: 5, sequence_index: 2, day_type: "training", status: "scheduled" },
        { workout_id: workoutIds.rest7, scheduled_date: "2026-09-13", schedule_index: 6, sequence_index: null, day_type: "rest", status: "scheduled" },
        { workout_id: workoutIds.seq3, scheduled_date: "2026-09-14", schedule_index: 7, sequence_index: 3, day_type: "training", status: "scheduled" }
      ]
    });    expect(unavailableReflow.status, JSON.stringify(unavailableReflow.body)).toBe(200);
    revision = unavailableReflow.body.schedule_revision;

    const afterUnavailable = await rest(
      `plan_workouts?select=scheduled_date,day_type,status&program_id=eq.${programId}&day_type=eq.training&status=eq.scheduled&scheduled_date=eq.2026-09-09`,
      { headers }
    );
    expect(afterUnavailable, "不可训练日不应再排训练").toEqual([]);

    // Pause: the latest pause_started event defines the paused state.
    await rest("ops_schedule_events", {
      headers,
      method: "POST",
      body: {
        user_id: session.user.id,
        program_id: programId,
        event_type: "pause_started",
        effective_date: "2026-09-14",
        metadata: { reason: "fatigue", resume_date: "2026-09-15" },
        schedule_revision: revision
      }
    });
    const latestEvents = await rest(
      `ops_schedule_events?select=event_type,metadata&program_id=eq.${programId}&order=created_at.desc&limit=1`,
      { headers }
    );
    expect(latestEvents[0]?.event_type).toBe("pause_started");

    // No route preselection: resume without an explicit route is rejected.
    const noRoute = await rpc("reflow_program_schedule", headers, {
      program_id: programId,
      action: "resume",
      expected_revision: revision,
      effective_date: "2026-09-15",
      schedule_items: []
    });
    expect(noRoute.status).toBe(400);
    expect(JSON.stringify(noRoute.body)).toContain("Resume requires an explicit route");

    // Stale revision is rejected before any row changes.
    const stale = await rpc("reflow_program_schedule", headers, {
      program_id: programId,
      action: "resume",
      expected_revision: revision - 1,
      resume_route: "continue_current_cycle",
      effective_date: "2026-09-15",
      schedule_items: []
    });
    expect(stale.status).toBe(400);
    expect(JSON.stringify(stale.body)).toContain("Schedule changed; refresh before confirming");

    // Resume from the next cycle: exactly one row is skipped as recovery_strategy.
    const resume = await rpc("reflow_program_schedule", headers, {
      program_id: programId,
      action: "resume",
      expected_revision: revision,
      resume_route: "start_next_cycle",
      effective_date: "2026-09-15",
      schedule_items: [
        { workout_id: workoutIds.seq0, scheduled_date: "2026-09-07", schedule_index: 0, sequence_index: 0, day_type: "training", status: "skipped" },
        { workout_id: workoutIds.rest1, scheduled_date: "2026-09-15", schedule_index: 1, sequence_index: null, day_type: "rest", status: "scheduled" },
        { workout_id: workoutIds.seq1, scheduled_date: "2026-09-16", schedule_index: 2, sequence_index: 1, day_type: "training", status: "scheduled" },
        { workout_id: workoutIds.rest3, scheduled_date: "2026-09-17", schedule_index: 3, sequence_index: null, day_type: "rest", status: "scheduled" },
        { workout_id: workoutIds.seq2, scheduled_date: "2026-09-18", schedule_index: 4, sequence_index: 2, day_type: "training", status: "scheduled" },
        { workout_id: workoutIds.rest5, scheduled_date: "2026-09-19", schedule_index: 5, sequence_index: null, day_type: "rest", status: "scheduled" },
        { workout_id: workoutIds.seq3, scheduled_date: "2026-09-20", schedule_index: 6, sequence_index: 3, day_type: "training", status: "scheduled" },
        { workout_id: workoutIds.rest7, scheduled_date: "2026-09-21", schedule_index: 7, sequence_index: null, day_type: "rest", status: "scheduled" }
      ]
    });
    expect(resume.status, JSON.stringify(resume.body)).toBe(200);
    expect(resume.body.skipped_count).toBe(1);

    const skippedRows = await rest(
      `plan_workouts?select=id,status,skip_reason&program_id=eq.${programId}&status=eq.skipped`,
      { headers }
    );
    expect(skippedRows).toHaveLength(1);
    expect(skippedRows[0]?.skip_reason).toBe("recovery_strategy");

    const resumeEvents = await rest(
      `ops_schedule_events?select=event_type,metadata&program_id=eq.${programId}&event_type=eq.resume_confirmed&order=created_at.desc&limit=1`,
      { headers }
    );
    expect(resumeEvents[0]?.metadata?.resume_route).toBe("start_next_cycle");
  } finally {
    // Cleanup: removing the program cascades workouts and schedule events.
    await rest(`usr_unavailable_dates?user_id=eq.${session.user.id}`, { headers, method: "DELETE" });
    await rest(`plan_programs?id=eq.${programId}`, { headers, method: "DELETE" });
  }

  async function signIn() {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email: qaEmail, password: qaPassword })
    });
    const body = await response.json();
    expect(response.status, `QA 登录失败：${JSON.stringify(body)}`).toBe(200);
    return body;
  }

  async function rest(path, { method = "GET", body } = {}) {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    if (method === "GET") {
      expect(response.status, `GET ${path} 失败：${text}`).toBe(200);
      return parsed;
    }
    expect([200, 201, 204], `${method} ${path} 失败：${text}`).toContain(response.status);
    return parsed;
  }

  async function rpc(name, rpcHeaders, payload) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: rpcHeaders,
      body: JSON.stringify({ p_payload: payload })
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  async function createCadenceProgram(programHeaders, exerciseRows) {
    const prescription = exerciseRows.map((exercise, index) => ({
      exercise_id: exercise.id,
      order_index: index + 1,
      target_sets: 3,
      target_reps: 5,
      target_weight: 60
    }));
    const trainingItem = (sequenceIndex, scheduledDate, scheduleIndex) => ({
      cycle_index: sequenceIndex,
      cycle_position: 0,
      day_type: "training",
      exercises: prescription,
      name: `冒烟训练 ${sequenceIndex + 1}`,
      schedule_index: scheduleIndex,
      scheduled_date: scheduledDate,
      sequence_index: sequenceIndex
    });
    const restItem = (scheduledDate, scheduleIndex) => ({
      cycle_index: null,
      cycle_position: null,
      day_type: "rest",
      exercises: [],
      name: "休息/恢复日",
      schedule_index: scheduleIndex,
      scheduled_date: scheduledDate,
      sequence_index: null
    });

    const result = await rpc("replace_active_program", programHeaders, {
      custom_template_name: null,
      end_date: "2026-09-14",
      holiday_policy: "train",
      name: "排程冒烟测试计划",
      schedule_config: { train_days: 1, rest_days: 1 },
      schedule_items: [
        trainingItem(0, "2026-09-07", 0),
        restItem("2026-09-08", 1),
        trainingItem(1, "2026-09-09", 2),
        restItem("2026-09-10", 3),
        trainingItem(2, "2026-09-11", 4),
        restItem("2026-09-12", 5),
        trainingItem(3, "2026-09-13", 6),
        restItem("2026-09-14", 7)
      ],
      schedule_mode: "cadence",
      start_date: "2026-09-07",
      template_type: "one_split",
      timezone: "Asia/Shanghai"
    });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const created = Array.isArray(result.body) ? result.body[0] : result.body;
    const newProgramId = created?.program_id;
    expect(newProgramId).toBeTruthy();

    const rows = await rest(
      `plan_workouts?select=id,sequence_index,schedule_index,day_type&program_id=eq.${newProgramId}&order=schedule_index.asc`,
      { headers }
    );
    expect(rows).toHaveLength(8);
    const bySequence = new Map(rows.map((row) => [`${row.day_type}-${row.sequence_index ?? row.schedule_index}`, row.id]));
    workoutIds = {
      seq0: bySequence.get("training-0"),
      seq1: bySequence.get("training-1"),
      seq2: bySequence.get("training-2"),
      seq3: bySequence.get("training-3"),
      rest1: bySequence.get("rest-1"),
      rest3: bySequence.get("rest-3"),
      rest5: bySequence.get("rest-5"),
      rest7: bySequence.get("rest-7")
    };
    for (const [key, value] of Object.entries(workoutIds)) {
      expect(value, `缺少日程行 ${key}`).toBeTruthy();
    }
    return newProgramId;
  }
}, 60_000);

let workoutIds = {};
