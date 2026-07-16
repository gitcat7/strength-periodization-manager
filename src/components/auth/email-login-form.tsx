"use client";

import { useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  completeMagicLinkSignIn,
  getLoginNext,
  getSafeNextFromMagicLink,
  getSupabaseVerifyLinkFromPastedUrl
} from "@/lib/supabase/magic-link";

type Status = "idle" | "loading" | "sent" | "error";

export function EmailLoginForm() {
  const [email, setEmail] = useState("");
  const [magicLink, setMagicLink] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [linkStatus, setLinkStatus] = useState<Status>("idle");
  const [linkMessage, setLinkMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const supabase = createBrowserSupabaseClient();
    const origin = window.location.origin;
    const next = getLoginNext(new URLSearchParams(window.location.search));
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`
      }
    });

    if (error) {
      setStatus("error");
      setMessage(formatOtpError(error.message));
      return;
    }

    setStatus("sent");
    setMessage("登录链接已发送，请查看邮箱。");
  }

  async function handleMagicLinkLogin() {
    setLinkStatus("loading");
    setLinkMessage("");

    const pastedLink = magicLink.trim();
    const next = getSafeNextFromMagicLink(
      pastedLink,
      getLoginNext(new URLSearchParams(window.location.search))
    );

    try {
      const verifyLink = getSupabaseVerifyLinkFromPastedUrl(pastedLink);
      if (verifyLink) {
        setLinkStatus("sent");
        setLinkMessage("正在当前浏览器打开验证链接。");
        window.location.href = verifyLink;
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error } = await completeMagicLinkSignIn({
        next,
        supabase,
        url: pastedLink
      });

      if (error) {
        setLinkStatus("error");
        setLinkMessage(error.message);
        return;
      }

      setLinkStatus("sent");
      setLinkMessage("登录成功，正在进入系统。");
      window.location.href = next;
    } catch (error) {
      setLinkStatus("error");
      setLinkMessage(error instanceof Error ? error.message : "登录链接解析失败，请复制完整邮件链接。");
    }
  }

  return (
    <div className="space-y-5">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">邮箱</span>
          <input
            className="h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white transition hover:bg-action/90 disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={status === "loading"}
        >
          <Mail size={18} />
          {status === "loading" ? "发送中" : "发送登录链接"}
        </button>

        {message ? (
          <p className={`text-sm ${status === "error" ? "text-red-600" : "text-action"}`}>
            {message}
          </p>
        ) : null}
      </form>

      <div className="rounded-xl border border-line bg-field p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={18} className="text-action" />
          <h2 className="font-semibold">粘贴邮件链接登录</h2>
        </div>
        <p className="mb-3 text-sm leading-6 text-muted">
          如果邮件链接打开到了外部浏览器，复制完整链接或 Gmail 跳转链接，粘贴到这里即可在当前内置浏览器完成登录。
        </p>
        <textarea
          className="min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-action/20 transition focus:border-action focus:ring-4"
          value={magicLink}
          onChange={(event) => setMagicLink(event.target.value)}
          placeholder="粘贴 Confirm email address 的完整链接"
        />
        <button
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-action bg-white px-4 font-semibold text-action transition hover:bg-action/5 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={linkStatus === "loading" || magicLink.trim().length === 0}
          onClick={handleMagicLinkLogin}
        >
          <KeyRound size={17} />
          {linkStatus === "loading" ? "登录中" : "用粘贴链接登录"}
        </button>
        {linkMessage ? (
          <p className={`mt-3 text-sm ${linkStatus === "error" ? "text-red-600" : "text-action"}`}>
            {linkMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatOtpError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("rate limit")) {
    return "邮件发送太频繁，Supabase 暂时限流。先不要重复发送；如果邮箱里已有最近一次登录邮件，复制完整链接粘贴到下面登录。没有可用邮件的话，等一会儿再试。";
  }

  return message;
}
