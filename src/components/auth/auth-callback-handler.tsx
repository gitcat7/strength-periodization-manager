"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { completeMagicLinkSignIn, getLoginNext } from "@/lib/supabase/magic-link";

export function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("正在完成登录...");

  useEffect(() => {
    let active = true;

    async function completeAuth() {
      try {
        const supabase = createBrowserSupabaseClient();
        const next = getLoginNext(searchParams);
        const authErrorMessage = getAuthErrorMessage(window.location.hash);
        if (authErrorMessage) {
          if (!active) return;
          setStatus("error");
          setMessage(authErrorMessage);
          return;
        }

        const hasAuthPayload = searchParams.has("code") || window.location.hash.includes("access_token");

        if (!hasAuthPayload) {
          const { data } = await withTimeout(
            supabase.auth.getSession(),
            "登录状态读取超时，请回到登录页重新发送链接。"
          );
          if (data.session) {
            router.replace(next);
            return;
          }

          if (!active) return;
          setStatus("error");
          setMessage("回调地址里没有登录 code。请回到登录页重新发送链接。");
          return;
        }

        const { error } = await withTimeout(
          completeMagicLinkSignIn({
            next,
            supabase,
            url: window.location.href
          }),
          "登录链接处理超时，请回到登录页重新发送链接。"
        );
        if (error) {
          if (!active) return;
          setStatus("error");
          setMessage(error.message);
          return;
        }

        if (!active) return;
        setStatus("success");
        setMessage("登录成功，正在跳转...");
        router.replace(next);
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "登录回调失败，请重新发送登录链接。");
      }
    }

    completeAuth();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-field">
        {status === "loading" ? <Loader2 className="animate-spin text-muted" /> : null}
        {status === "success" ? <CheckCircle2 className="text-action" /> : null}
        {status === "error" ? <CircleAlert className="text-red-600" /> : null}
      </span>
      <div>
        <h1 className="text-2xl font-semibold">登录回调</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
      </div>
      {status === "error" ? (
        <Link
          className="inline-flex rounded-lg bg-action px-4 py-2 font-semibold text-white"
          href={`/login?next=${encodeURIComponent(getLoginNext(searchParams))}`}
        >
          重新登录
        </Link>
      ) : null}
    </div>
  );
}

function getAuthErrorMessage(hash: string) {
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  const errorCode = hashParams.get("error_code");
  const errorDescription = hashParams.get("error_description");

  if (errorCode === "otp_expired") {
    return "这封邮件登录链接已过期或已经使用过。请回到登录页重新发送一封新的登录邮件。";
  }

  if (errorDescription) {
    return decodeURIComponent(errorDescription.replace(/\+/g, " "));
  }

  return null;
}

function withTimeout<T>(promise: PromiseLike<T>, message: string, timeoutMs = 10000) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}
