"use client";

import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-xl rounded-[20px] border border-line bg-white p-5 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
          <CircleAlert size={24} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold">页面出了点问题</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          可以先刷新重试。如果多次出现，请把当前页面和操作步骤记录下来，方便定位。
        </p>
        <p className="mt-3 rounded-lg bg-field px-3 py-2 text-left text-xs text-muted">
          {error.message || error.digest || "未知错误"}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white"
            onClick={reset}
            type="button"
          >
            <RotateCcw size={18} />
            重新加载
          </button>
          <Link className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-field px-4 font-semibold text-ink" href="/">
            回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
