"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Copy, Download, KeyRound, Loader2, LogOut, RefreshCcw, ShieldAlert, Trash2, UserRound, Wrench } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { clearTrainingDataCaches, readClientCache, writeClientCache } from "@/lib/client-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { loadWorkoutsWithDayTypeFallback } from "@/lib/workout-day-type-compat";

type WorkoutRow = {
  day_type: "training" | "rest";
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
  exercise_name_snapshot?: string | null;
  exercise_provider?: string | null;
  external_exercise_id?: string | null;
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

type AgentTokenRow = {
  created_at: string;
  expires_at: string;
  id: string;
  last_used_at: string | null;
  name: string;
  revoked_at: string | null;
};

export function SettingsPanel() {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "working" | "error">("loading");
  const [message, setMessage] = useState("");
  const [agentTokens, setAgentTokens] = useState<AgentTokenRow[]>([]);
  const [newAgentToken, setNewAgentToken] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [agentStatus, setAgentStatus] = useState<"ready" | "working" | "error">("ready");

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
        setUserId(user.id);
        await loadAgentTokens();
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
        loadWorkoutsWithDayTypeFallback(
          () => supabase.from("workouts").select("id,scheduled_date,name,status,day_type").eq("user_id", user.id).eq("status", "completed").order("scheduled_date", { ascending: true }),
          () => supabase.from("workouts").select("id,scheduled_date,name,status").eq("user_id", user.id).eq("status", "completed").order("scheduled_date", { ascending: true })
        ),
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

  async function loadAgentTokens() {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("agent_access_tokens")
      .select("id,name,created_at,last_used_at,expires_at,revoked_at")
      .order("created_at", { ascending: false });

    if (error) {
      setAgentStatus("error");
      setAgentMessage(
        error.message.includes("schema cache")
          ? "Agent 授权表尚未部署，请先执行最新数据库迁移。"
          : error.message
      );
      return;
    }

    setAgentTokens((data ?? []) as AgentTokenRow[]);
    setAgentStatus("ready");
  }

  async function createAgentToken() {
    if (!userId) return;
    setAgentStatus("working");
    setAgentMessage("");
    setNewAgentToken("");

    try {
      const token = createRawAgentToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 180);
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.from("agent_access_tokens").insert({
        expires_at: expiresAt.toISOString(),
        name: "训练 Agent",
        token_hash: tokenHash,
        user_id: userId
      });

      if (error) throw new Error(error.message);
      setNewAgentToken(token);
      setAgentMessage("令牌已生成，只显示这一次。安装 Skill 后将它配置为 STRENGTH_MANAGER_TOKEN。");
      await loadAgentTokens();
    } catch (error) {
      setAgentStatus("error");
      setAgentMessage(error instanceof Error ? error.message : "Agent 令牌生成失败。");
    }
  }

  async function revokeAgentToken(tokenId: string) {
    setAgentStatus("working");
    setAgentMessage("");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("agent_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("user_id", userId);

    if (error) {
      setAgentStatus("error");
      setAgentMessage(error.message);
      return;
    }

    setAgentMessage("Agent 令牌已撤销。使用该令牌的 Agent 将立即失去访问权限。");
    await loadAgentTokens();
  }

  async function copyAgentToken() {
    if (!newAgentToken) return;
    await navigator.clipboard.writeText(newAgentToken);
    setAgentMessage("令牌已复制。请保存到 Agent 的安全环境变量中。");
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
            <h2 className="font-semibold">账号</h2>
            <p className="text-sm text-muted">{email || "已登录用户"}</p>
          </div>
        </div>
        <div className="space-y-3">
          <Link className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line bg-field px-4 font-semibold text-ink transition active:scale-[0.98]" href="/plan">
            调整计划参数
          </Link>
          <Link className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-field px-4 font-semibold text-ink transition active:scale-[0.98]" href="/exercises">
            <BookOpen size={18} />
            打开动作库
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
            <Download size={20} />
          </span>
          <div>
            <h2 className="font-semibold">数据</h2>
            <p className="text-sm text-muted">导出记录或清理本地缓存。</p>
          </div>
        </div>
        <div className="space-y-3">
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "working"}
            onClick={exportTrainingCsv}
            type="button"
          >
            {status === "working" ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            导出训练记录 CSV
          </button>
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-semibold text-ink transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "working"}
            onClick={clearLocalCache}
            type="button"
          >
            {status === "working" ? <Loader2 className="animate-spin" size={18} /> : <RefreshCcw size={18} />}
            清理本地缓存
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
            <Wrench size={20} />
          </span>
          <div>
            <h2 className="font-semibold">体验</h2>
            <p className="text-sm text-muted">反馈、隐私与退出。</p>
          </div>
        </div>
        <div className="space-y-3">
          <Link
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line bg-field px-4 font-semibold text-ink transition active:scale-[0.98]"
            href="/privacy"
          >
            查看隐私与数据说明
          </Link>
          <Link
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-line bg-field px-4 font-semibold text-ink transition active:scale-[0.98]"
            href="/feedback"
          >
            提交问题反馈
          </Link>
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-semibold text-ink transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "working"}
            onClick={signOut}
            type="button"
          >
            <LogOut size={18} />
            退出登录
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Agent 中文操作授权</h2>
            <p className="text-sm text-muted">每个令牌只访问当前账号的数据，可随时撤销，有效期 180 天。</p>
          </div>
        </div>

        {agentMessage ? (
          <p className={`mb-3 rounded-lg border px-3 py-2 text-sm ${agentStatus === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
            {agentMessage}
          </p>
        ) : null}

        {newAgentToken ? (
          <div className="mb-3 rounded-lg bg-field p-3">
            <p className="mb-2 text-xs font-semibold text-muted">新令牌（关闭页面后无法再次查看）</p>
            <code className="block break-all text-sm text-ink">{newAgentToken}</code>
            <button
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-action bg-white px-3 font-semibold text-action transition active:scale-[0.98]"
              onClick={copyAgentToken}
              type="button"
            >
              <Copy size={17} />
              复制令牌
            </button>
          </div>
        ) : null}

        <div className="mb-3 space-y-2">
          {agentTokens.filter((token) => !token.revoked_at).map((token) => (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-field px-3 py-3" key={token.id}>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{token.name}</p>
                <p className="text-xs text-muted">
                  {token.last_used_at ? `最近使用 ${formatTimestamp(token.last_used_at)}` : "尚未使用"} · 到期 {formatTimestamp(token.expires_at)}
                </p>
              </div>
              <button
                aria-label="撤销 Agent 令牌"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-white text-red-600 transition active:scale-[0.97] disabled:opacity-60"
                disabled={agentStatus === "working"}
                onClick={() => revokeAgentToken(token.id)}
                title="撤销令牌"
                type="button"
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>

        <button
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={agentStatus === "working" || !userId}
          onClick={createAgentToken}
          type="button"
        >
          {agentStatus === "working" ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />}
          生成新的 Agent 令牌
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
    </div>
  );
}

async function loadWorkoutExercises(workoutIds: string[]) {
  if (workoutIds.length === 0) return [];

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await withTimeout(
    supabase
      .from("workout_exercises")
      .select("id,workout_id,order_index,target_sets,target_reps,target_weight,exercise_name_snapshot,exercise_provider,external_exercise_id,exercises(name,slug)")
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
    "day_type",
    "exercise_name",
    "exercise_slug",
    "exercise_provider",
    "external_exercise_id",
    "exercise_order",
    "set_index",
    "target_weight_kg",
    "target_reps",
    "actual_weight_kg",
    "actual_reps",
    "rpe",
    "completed"
  ];

  const rows = [
    ...setLogs.map((log) => {
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
          workout?.day_type ?? "",
          exercise?.exercises?.name ?? exercise?.exercise_name_snapshot ?? "",
          exercise?.exercises?.slug ?? "",
          exercise?.exercise_provider ?? "",
          exercise?.external_exercise_id ?? "",
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
    }),
    ...workouts.filter((workout) => workout.day_type === "rest").map((workout) => {
      const workoutMeta = getWorkoutNameParts(workout.name);

      return {
        exerciseOrder: 0,
        row: [
          workout.scheduled_date,
          workoutMeta.week,
          workoutMeta.day,
          workout.name,
          workout.status,
          workout.day_type,
          "", "", "", "", "", "", "", "", "", ""
        ],
        setIndex: 0,
        workoutDate: workout.scheduled_date
      };
    })
  ]
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

function createRawAgentToken() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `ltp_${encoded}`;
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 10000) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
