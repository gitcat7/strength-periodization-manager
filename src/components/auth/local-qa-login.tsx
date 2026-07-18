"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getLoginNext } from "@/lib/supabase/magic-link";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type QaSessionResponse = {
  access_token: string;
  refresh_token: string;
};

export function LocalQaLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const next = getLoginNext(new URLSearchParams(searchParams.toString()));

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;

    async function signIn() {
      try {
        const response = await fetch("/api/dev/qa-session", { cache: "no-store", method: "POST" });
        if (!response.ok) throw new Error("QA session unavailable");
        const session = (await response.json()) as QaSessionResponse;
        if (!session.access_token || !session.refresh_token) throw new Error("QA session response invalid");

        const { error } = await createBrowserSupabaseClient().auth.setSession(session);
        if (error) throw error;
        if (active) router.replace(next);
      } catch {
        if (active) setStatus("error");
      }
    }

    void signIn();
    return () => {
      active = false;
    };
  }, [next, router]);

  if (status === "error") {
    return (
      <div className="space-y-5 text-center">
        <CircleAlert className="mx-auto text-red-600" size={44} />
        <div>
          <h1 className="text-2xl font-semibold">本地 QA 登录不可用</h1>
          <p className="mt-2 text-sm leading-6 text-muted">请检查本机开发配置后重试，或使用普通登录。</p>
        </div>
        <Link className="inline-flex rounded-lg bg-action px-4 py-2 font-semibold text-white" href={`/login?next=${encodeURIComponent(next)}`}>
          前往登录
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <Loader2 className="mx-auto animate-spin text-action" size={36} />
      <div>
        <h1 className="text-2xl font-semibold">正在建立本地 QA 会话</h1>
        <p className="mt-2 text-sm leading-6 text-muted">仅用于此电脑的开发验证。</p>
      </div>
    </div>
  );
}
