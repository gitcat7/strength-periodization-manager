import Link from "next/link";
import { Dumbbell, History } from "lucide-react";
import { TodayWorkout } from "@/components/today/today-workout";

export default function TodayPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-action text-white">
            <Dumbbell size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">训练执行与记录</p>
            <h1 className="text-2xl font-semibold">今日训练</h1>
          </div>
          <Link className="grid h-10 w-10 place-items-center rounded-full border border-line bg-field text-ink" href="/history">
            <History size={18} />
          </Link>
        </div>
        <TodayWorkout />
      </section>
    </main>
  );
}
