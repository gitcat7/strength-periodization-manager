"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { getLoginNext } from "@/lib/supabase/auth-redirect";

type LoginStage = "email" | "code";
type Status = "idle" | "loading" | "sent" | "error";

export function EmailLoginForm() {
  const [stage, setStage] = useState<LoginStage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((remaining) => Math.max(remaining - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendOtp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail)) {
      setStatus("error");
      setMessage("请输入有效邮箱地址。");
      return;
    }

    setStatus("loading");
    setMessage("");
    const { error } = await createBrowserSupabaseClient().auth.signInWithOtp({ email: normalizedEmail });
    if (error) {
      setStatus("error");
      setMessage(formatSendError(error.message));
      return;
    }

    setEmail(normalizedEmail);
    setCode("");
    setStage("code");
    setCooldown(60);
    setStatus("sent");
    setMessage("验证码已发送，请查收邮箱。");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{8}$/.test(code)) {
      setStatus("error");
      setMessage("请输入 8 位数字验证码。");
      return;
    }

    setStatus("loading");
    setMessage("");
    const { error } = await createBrowserSupabaseClient().auth.verifyOtp({
      email,
      token: code,
      type: "email"
    });
    if (error) {
      setStatus("error");
      setMessage(formatVerifyError(error.message));
      return;
    }

    window.location.href = getLoginNext(new URLSearchParams(window.location.search));
  }

  function changeEmail() {
    setStage("email");
    setCode("");
    setCooldown(0);
    setStatus("idle");
    setMessage("");
  }

  if (stage === "code") {
    return (
      <div className="space-y-5">
        <div className="rounded-lg bg-field px-4 py-3 text-sm text-muted">
          验证码已发送至 <span className="font-medium text-ink">{maskEmail(email)}</span>
        </div>
        <form className="space-y-4" onSubmit={verifyCode}>
          <label className="block" htmlFor="login-code">
            <span className="mb-2 block text-sm font-medium text-muted">验证码</span>
            <input
              id="login-code"
              className="h-12 w-full rounded-lg border border-line bg-white px-3 text-center text-xl tracking-[0.35em] outline-none ring-action/20 transition focus:border-action focus:ring-4"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              pattern="[0-9]{8}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              autoFocus
              aria-describedby={message ? "login-code-message" : undefined}
            />
          </label>

          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white transition hover:bg-action/90 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={status === "loading" || code.length !== 8}
          >
            <Mail size={18} />
            {status === "loading" ? "登录中" : "登录"}
          </button>
        </form>

        {message ? (
          <p id="login-code-message" className={`text-sm ${status === "error" ? "text-red-600" : "text-action"}`}>
            {message}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 text-sm">
          <button className="text-muted underline-offset-4 hover:underline" type="button" onClick={changeEmail}>
            修改邮箱
          </button>
          <button
            className="text-action underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted"
            type="button"
            disabled={status === "loading" || cooldown > 0}
            onClick={() => void sendOtp()}
          >
            {cooldown > 0 ? `${cooldown} 秒后可重新发送验证码` : "重新发送验证码"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void sendOtp(event)}>
      <label className="block" htmlFor="login-email">
        <span className="mb-2 block text-sm font-medium text-muted">邮箱</span>
        <input
          id="login-email"
          className="h-12 w-full rounded-lg border border-line bg-white px-3 text-base outline-none ring-action/20 transition focus:border-action focus:ring-4"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </label>

      <button
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white transition hover:bg-action/90 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={status === "loading"}
      >
        <Mail size={18} />
        {status === "loading" ? "发送中" : "获取验证码"}
      </button>

      {message ? <p className={`text-sm ${status === "error" ? "text-red-600" : "text-action"}`}>{message}</p> : null}
    </form>
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const prefix = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${prefix}${"*".repeat(Math.max(local.length - prefix.length, 1))}@${domain}`;
}

function formatSendError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "邮件发送太频繁，请稍后再试。";
  }
  if (normalized.includes("invalid") && normalized.includes("email")) {
    return "请输入有效邮箱地址。";
  }
  return "验证码发送失败，请稍后重试。";
}

function formatVerifyError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "验证尝试过多，请稍后再试。";
  }
  if (normalized.includes("expired") || normalized.includes("invalid") || normalized.includes("otp") || message.includes("验证码")) {
    return "验证码错误或已过期，请重新输入。";
  }
  return "登录失败，请检查网络后重试。";
}
