"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const categories = [
  { label: "一般反馈", value: "general" },
  { label: "页面错误", value: "bug" },
  { label: "训练计划", value: "training_plan" },
  { label: "数据问题", value: "data" },
  { label: "登录问题", value: "login" }
];

export function FeedbackForm() {
  const [category, setCategory] = useState("general");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "success" | "error">("loading");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function loadSession() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        const user = data.session?.user;

        if (error || !user) {
          window.location.href = "/login?next=/feedback";
          return;
        }

        setEmail(user.email ?? "");
        setUserId(user.id);
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setNotice(error instanceof Error ? error.message : "反馈页读取失败，请刷新页面后重试。");
      }
    }

    loadSession();
  }, []);

  async function submitFeedback(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;

    if (message.trim().length < 5) {
      setStatus("error");
      setNotice("请至少写 5 个字，方便定位问题。");
      return;
    }

    setStatus("saving");
    setNotice("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("feedback_reports").insert({
      category,
      email,
      message: message.trim(),
      page_path: window.location.pathname,
      user_agent: window.navigator.userAgent,
      user_id: userId
    });

    if (error) {
      setStatus("error");
      setNotice(error.message);
      return;
    }

    await trackEvent({
      eventName: "feedback_submitted",
      properties: {
        category
      },
      supabase,
      userId
    });

    setMessage("");
    setStatus("success");
    setNotice("反馈已提交。谢谢，这对内测很有帮助。");
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line p-4 text-muted">
        <Loader2 className="animate-spin" size={18} />
        正在读取反馈表单
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submitFeedback}>
      {notice ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${status === "error" ? "border-red-200 text-red-600" : "border-line text-muted"}`}>
          {notice}
        </p>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">问题类型</span>
        <select
          className="h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
          onChange={(event) => setCategory(event.target.value)}
          value={category}
        >
          {categories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">联系邮箱</span>
        <input
          className="h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">问题描述</span>
        <textarea
          className="min-h-36 w-full rounded-lg border border-line bg-white px-3 py-2 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
          maxLength={2000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="比如：哪一步不符合预期、你输入了什么、页面显示了什么。"
          required
          value={message}
        />
        <span className="mt-1 block text-right text-xs text-muted">{message.length}/2000</span>
      </label>

      <button
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === "saving"}
        type="submit"
      >
        {status === "saving" ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
        提交反馈
      </button>
    </form>
  );
}
