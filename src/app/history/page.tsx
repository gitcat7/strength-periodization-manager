import Link from "next/link";
import { ChevronLeft, History } from "lucide-react";
import { TrainingHistory } from "@/components/history/training-history";

export default function HistoryPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-3xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Link className="mb-5 inline-flex items-center gap-1 text-sm text-muted" href="/">
          <ChevronLeft size={16} />
          返回首页
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-action text-white">
            <History size={22} />
          </span>
          <div>
            <p className="text-sm text-muted">训练复盘与调整记录</p>
            <h1 className="text-2xl font-semibold">训练历史</h1>
          </div>
        </div>

        <TrainingHistory />
      </section>
    </main>
  );
}
