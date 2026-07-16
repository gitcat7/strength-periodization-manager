"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type CheckState = "checking" | "pass" | "fail" | "info";

type DiagnosticItem = {
  label: string;
  state: CheckState;
  message: string;
};

export function SupabaseDiagnostics() {
  const [checks, setChecks] = useState<DiagnosticItem[]>([
    {
      label: "环境变量",
      state: "checking",
      message: "正在检查 Supabase public env"
    },
    {
      label: "登录状态",
      state: "checking",
      message: "正在读取当前 session"
    },
    {
      label: "数据库读取",
      state: "checking",
      message: "登录后会检查 exercises 基础动作表"
    },
    {
      label: "反馈表",
      state: "checking",
      message: "登录后会检查 feedback_reports 表"
    },
    {
      label: "行为埋点表",
      state: "checking",
      message: "登录后会检查 analytics_events 表"
    }
  ]);

  useEffect(() => {
    let active = true;

    async function runChecks() {
      const nextChecks: DiagnosticItem[] = [];

      try {
        const supabase = createBrowserSupabaseClient();
        nextChecks.push({
          label: "环境变量",
          state: "pass",
          message: "Supabase URL 和 publishable key 已加载"
        });

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          nextChecks.push({
            label: "登录状态",
            state: "fail",
            message: sessionError.message
          });
        } else if (sessionData.session) {
          nextChecks.push({
            label: "登录状态",
            state: "pass",
            message: `已登录：${sessionData.session.user.email ?? sessionData.session.user.id}`
          });

          const { data, error } = await supabase
            .from("exercises")
            .select("slug,name")
            .limit(20);

          if (error) {
            nextChecks.push({
              label: "数据库读取",
              state: "fail",
              message: error.message
            });
          } else {
            nextChecks.push({
              label: "数据库读取",
              state: data.length > 0 ? "pass" : "fail",
              message:
                data.length > 0
                  ? `已读取 ${data.length} 个基础动作`
                  : "未读取到基础动作，请确认 schema.sql 已执行"
            });
          }

          nextChecks.push(
            await checkReadableTable({
              label: "反馈表",
              missingMessage: "feedback_reports 表不可读，请确认 20260704_feedback_reports.sql 已执行",
              selectColumns: "id",
              supabase,
              tableName: "feedback_reports"
            })
          );
          nextChecks.push(
            await checkReadableTable({
              label: "行为埋点表",
              missingMessage: "analytics_events 表不可读，请确认 20260704_analytics_events.sql 已执行",
              selectColumns: "id,event_name",
              supabase,
              tableName: "analytics_events"
            })
          );
        } else {
          nextChecks.push({
            label: "登录状态",
            state: "info",
            message: "当前未登录，请先到 /login 发送邮箱登录链接"
          });
          nextChecks.push({
            label: "数据库读取",
            state: "info",
            message: "exercises 表仅允许已登录用户读取，登录后再刷新本页"
          });
          nextChecks.push({
            label: "反馈表",
            state: "info",
            message: "feedback_reports 表仅允许已登录用户读取，登录后再刷新本页"
          });
          nextChecks.push({
            label: "行为埋点表",
            state: "info",
            message: "analytics_events 表仅允许已登录用户读取，登录后再刷新本页"
          });
        }
      } catch (error) {
        nextChecks.push({
          label: "环境变量",
          state: "fail",
          message: error instanceof Error ? error.message : "Supabase 初始化失败"
        });
        nextChecks.push({
          label: "登录状态",
          state: "fail",
          message: "环境变量失败，无法继续检查"
        });
        nextChecks.push({
          label: "数据库读取",
          state: "fail",
          message: "环境变量失败，无法继续检查"
        });
        nextChecks.push({
          label: "反馈表",
          state: "fail",
          message: "环境变量失败，无法继续检查"
        });
        nextChecks.push({
          label: "行为埋点表",
          state: "fail",
          message: "环境变量失败，无法继续检查"
        });
      }

      if (active) {
        setChecks(nextChecks);
      }
    }

    runChecks();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      {checks.map((check) => (
        <div key={check.label} className="flex gap-3 rounded-xl border border-line p-4">
          <StatusIcon state={check.state} />
          <div>
            <p className="font-semibold">{check.label}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{check.message}</p>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-3 pt-2">
        <Link className="rounded-lg bg-action px-4 py-2 font-semibold text-white" href="/login?next=/diagnostics">
          去登录
        </Link>
        <Link className="rounded-lg border border-line px-4 py-2 font-semibold text-ink" href="/plan">
          创建训练计划
        </Link>
        <Link className="rounded-lg border border-line px-4 py-2 font-semibold text-ink" href="/">
          返回首页
        </Link>
      </div>
    </div>
  );
}

async function checkReadableTable({
  label,
  missingMessage,
  selectColumns,
  supabase,
  tableName
}: {
  label: string;
  missingMessage: string;
  selectColumns: string;
  supabase: ReturnType<typeof createBrowserSupabaseClient>;
  tableName: "analytics_events" | "feedback_reports";
}): Promise<DiagnosticItem> {
  const { error } = await supabase.from(tableName).select(selectColumns).limit(1);

  if (error) {
    return {
      label,
      state: "fail",
      message: error.message || missingMessage
    };
  }

  return {
    label,
    state: "pass",
    message: `${tableName} 表已接入`
  };
}

function StatusIcon({ state }: { state: CheckState }) {
  if (state === "checking") {
    return <Loader2 className="mt-0.5 animate-spin text-muted" size={20} />;
  }

  if (state === "pass") {
    return <CheckCircle2 className="mt-0.5 text-action" size={20} />;
  }

  if (state === "fail") {
    return <CircleAlert className="mt-0.5 text-red-600" size={20} />;
  }

  return <CircleAlert className="mt-0.5 text-amber" size={20} />;
}
