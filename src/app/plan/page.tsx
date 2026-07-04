import Link from "next/link";
import { ChevronLeft, History } from "lucide-react";
import { ProgramManager } from "@/components/plan/program-manager";

export default function PlanPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-3xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Link className="mb-5 inline-flex items-center gap-1 text-sm text-muted" href="/">
          <ChevronLeft size={16} />
          返回首页
        </Link>

        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">第 2 步</p>
            <h1 className="text-2xl font-semibold">生成训练计划</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              基于你的训练画像、可训练日和主项训练最大值，生成 4 周力量训练计划。
            </p>
          </div>
          <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-field text-ink" href="/history">
            <History size={18} />
          </Link>
        </div>

        <ProgramManager />
      </section>
    </main>
  );
}
