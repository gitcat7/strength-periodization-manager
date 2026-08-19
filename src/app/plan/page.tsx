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

        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted">训练计划</p>
          <Link className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-field text-ink" href="/history">
            <History size={18} />
          </Link>
        </div>

        <ProgramManager />
      </section>
    </main>
  );
}
