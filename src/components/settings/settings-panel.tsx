"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, LogOut, RefreshCcw, ShieldAlert, UserRound } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { clearTrainingDataCaches, readClientCache, writeClientCache } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

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

type SetLogRow = {
  id: string;
  workout_exercise_id: string;
  set_index: number;
  target_weight: number;
  target_reps: number;
  actual_weight: number | null;
  actual_reps: number | null;
  rpe: number | null;
  completed: boolean;
};

const settingsCacheKey = "strength-training-cache:settings";

type SettingsCache = {
  email: string;
};

export function SettingsPanel() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "working" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSession() {
      if (!readClientCache<SettingsCache>(settingsCacheKey)) {
        setStatus("loading");
      }
      setMessage("");

      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          "登录状态读取超时，请刷新页面后重试。"
        );
        const user = data.session?.user;

        if (error || !user) {
          window.location.href = "/login?next=/settings";
          return;
        }

        setEmail(user.email ?? "");
        writeClientCache<SettingsCache>(settingsCacheKey, {
          email: user.email ?? ""
        });
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "设置读取失败，请刷新页面后重试。");
      }
    }

    const cached = readClientCache<SettingsCache>(settingsCacheKey);
    if (cached) {
      setEmail(cached.email);
      setStatus("ready");
    }

    loadSession();
  }, []);

  async function exportTrainingCsv() {
    setStatus("working");
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData, error: sessionError } = await withTimeout(
        supabase.auth.getSession(),
        "登录状态读取超时，请重新登录后导出。"
      );
      const user = sessionData.session?.user;

      if (sessionError || !user) {
        window.location.href = "/login?next=/settings";
        return;
      }

      const { data: workoutData, error: workoutError } = await withTimeout(
        supabase
          .from("workouts")
          .select("id,scheduled_date,name,status")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .order("scheduled_date", { ascending: true }),
        "训练数据读取超时，请稍后重试。"
      );

      if (workoutError) {
        setStatus("error");
        setMessage(workoutError.message);
        return;
      }

      const workouts = (workoutData ?? []) as WorkoutRow[];
      if (workouts.length === 0) {
        setStatus("ready");
        setMessage("还没有已完成训练可导出。完成一次训练后再试。");
        return;
      }

      const workoutIds = workouts.map((workout) => workout.id);
      const workoutExercises = await loadWorkoutExercises(workoutIds);
      const setLogs = await loadSetLogs(workoutExercises.map((exercise) => exercise.id));
      const csv = buildTrainingCsv({ setLogs, workoutExercises, workouts });
      downloadCsv(csv, `strength-training-log-${formatDate(new Date())}.csv`);
      await trackEvent({
        eventName: "csv_exported",
        properties: {
          rows: setLogs.length,
          workouts: workouts.length
        },
        supabase,
        userId: user.id
      });

      setMessage("CSV 已生成并开始下载。");
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "CSV 导出失败，请稍后重试。");
    }
  }

  async function signOut() {
    setStatus("working");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    window.location.href = "/login";
  }

  async function clearLocalCache() {
    setStatus("working");
    setMessage("");

    try {
      clearTrainingDataCaches();
      if ("caches" in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(
          cacheKeys
            .filter((key) => key.startsWith("strength-periodization"))
            .map((key) => window.caches.delete(key))
        );
      }
      writeClientCache<SettingsCache>(settingsCacheKey, { email });
      setMessage("本地缓存已清理。页面会重新从服务器读取最新数据。");
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "本地缓存清理失败，请刷新页面后重试。");
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取设置
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

      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
            <UserRound size={20} />
          </span>
          <div>
            <h2 className="font-semibold">账号与训练画像</h2>
            <p className="text-sm text-muted">{email || "已登录用户"}</p>
          </div>
        </div>
        <Link className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line bg-field px-4 font-semibold text-ink" href="/onboarding">
          修改训练画像
        </Link>
      </section>

      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
            <Download size={20} />
          </span>
          <div>
            <h2 className="font-semibold">数据导出</h2>
            <p className="text-sm text-muted">导出已完成训练的动作和每组记录，CSV 可用 Excel 打开。</p>
          </div>
        </div>
        <button
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === "working"}
          onClick={exportTrainingCsv}
          type="button"
        >
          {status === "working" ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
          导出训练记录 CSV
        </button>
      </section>

      <section className="rounded-xl border border-amber/30 bg-amber/10 p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <ShieldAlert size={18} className="text-amber" />
          免责声明
        </div>
        <p className="text-sm leading-6 text-muted">
          本产品用于训练记录和计划管理，不构成医疗、康复或个性化诊断建议。如果你有伤病、疼痛或特殊健康状况，请咨询医生、物理治疗师或专业教练。进行大重量和 PR 测试前，请充分热身并保留安全余量。
        </p>
      </section>

      <Link
        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-4 font-semibold text-ink"
        href="/privacy"
      >
        查看隐私与数据说明
      </Link>

      <Link
        className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line bg-white px-4 font-semibold text-ink"
        href="/feedback"
      >
        提交问题反馈
      </Link>

      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "working"}
        onClick={clearLocalCache}
        type="button"
      >
        {status === "working" ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
        清理本地缓存
      </button>

      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "working"}
        onClick={signOut}
        type="button"
      >
        <LogOut size={18} />
        退出登录
      </button>
    </div>
  );
}

async function loadWorkoutExercises(workoutIds: string[]) {
  if (workoutIds.length === 0) return [];

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await withTimeout(
    supabase
      .from("workout_exercises")
      .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercises(name,slug)")
      .in("workout_id", workoutIds)
      .order("order_index", { ascending: true }),
    "训练动作读取超时，请稍后重试。"
  );

  if (error) throw new Error(error.message);

  return (data ?? []) as unknown as WorkoutExerciseRow[];
}

async function loadSetLogs(workoutExerciseIds: string[]) {
  if (workoutExerciseIds.length === 0) return [];

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await withTimeout(
    supabase
      .from("set_logs")
      .select("id,workout_exercise_id,set_index,target_weight,target_reps,actual_weight,actual_reps,rpe,completed")
      .in("workout_exercise_id", workoutExerciseIds)
      .order("set_index", { ascending: true }),
    "组记录读取超时，请稍后重试。"
  );

  if (error) throw new Error(error.message);

  return (data ?? []) as SetLogRow[];
}

function buildTrainingCsv({
  setLogs,
  workoutExercises,
  workouts
}: {
  setLogs: SetLogRow[];
  workoutExercises: WorkoutExerciseRow[];
  workouts: WorkoutRow[];
}) {
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const exerciseById = new Map(workoutExercises.map((exercise) => [exercise.id, exercise]));
  const header = [
    "workout_date",
    "workout_week",
    "workout_day",
    "workout_name",
    "workout_status",
    "exercise_name",
    "exercise_slug",
    "exercise_order",
    "set_index",
    "target_weight_kg",
    "target_reps",
    "actual_weight_kg",
    "actual_reps",
    "rpe",
    "completed"
  ];

  const rows = setLogs
    .map((log) => {
      const exercise = exerciseById.get(log.workout_exercise_id);
      const workout = exercise ? workoutById.get(exercise.workout_id) : null;
      const workoutMeta = getWorkoutNameParts(workout?.name ?? "");

      return {
        exerciseOrder: Number(exercise?.order_index ?? 0),
        row: [
          workout?.scheduled_date ?? "",
          workoutMeta.week,
          workoutMeta.day,
          workout?.name ?? "",
          workout?.status ?? "",
          exercise?.exercises?.name ?? "",
          exercise?.exercises?.slug ?? "",
          exercise?.order_index ?? "",
          log.set_index,
          log.target_weight,
          log.target_reps,
          log.actual_weight ?? "",
          log.actual_reps ?? "",
          log.rpe ?? "",
          log.completed ? "true" : "false"
        ],
        setIndex: Number(log.set_index),
        workoutDate: workout?.scheduled_date ?? ""
      };
    })
    .sort((a, b) => {
      const dateOrder = a.workoutDate.localeCompare(b.workoutDate);
      if (dateOrder !== 0) return dateOrder;

      const exerciseOrder = a.exerciseOrder - b.exerciseOrder;
      if (exerciseOrder !== 0) return exerciseOrder;

      return a.setIndex - b.setIndex;
    })
    .map((item) => item.row);

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function getWorkoutNameParts(name: string) {
  const match = name.match(/^第\s*(\d+)\s*周\s*·\s*(.+)$/);

  return {
    day: match?.[2] ?? name,
    week: match?.[1] ? `第 ${match[1]} 周` : ""
  };
}

function escapeCsvCell(value: string | number | boolean) {
  const cell = String(value);
  if (!/[",\n\r]/.test(cell)) return cell;

  return `"${cell.replace(/"/g, '""')}"`;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
