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
            <p className="text-sm text-muted">训练计划</p>
            <h1 className="text-2xl font-semibold">生成训练计划</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              填写本次计划需要的训练安排与主项最近工作组，即可生成 1–12 周周期。
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
