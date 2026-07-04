import Link from "next/link";
import { ChevronLeft, LineChart } from "lucide-react";
import { ProgressDashboard } from "@/components/progress/progress-dashboard";

export default function ProgressPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-3xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Link className="mb-5 inline-flex items-center gap-1 text-sm text-muted" href="/">
          <ChevronLeft size={16} />
          返回首页
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-action text-white">
            <LineChart size={22} />
          </span>
          <div>
            <p className="text-sm text-muted">训练量、完成率与主项趋势</p>
            <h1 className="text-2xl font-semibold">进展分析</h1>
          </div>
        </div>

        <ProgressDashboard />
      </section>
    </main>
  );
}
