import Link from "next/link";
import { BookOpen, ChevronLeft } from "lucide-react";
import { ExerciseLibrary } from "@/components/exercises/exercise-library";

export default function ExercisesPage() {
  return (
    <main className="min-h-screen px-4 py-6">
      <section className="mx-auto max-w-5xl rounded-[20px] border border-line bg-white p-5 shadow-sm">
        <Link className="mb-5 inline-flex items-center gap-1 text-sm text-muted" href="/">
          <ChevronLeft size={16} />
          返回首页
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-action/10 text-action">
            <BookOpen size={22} />
          </span>
          <div>
            <p className="text-sm text-muted">已审核动作与基础指导</p>
            <h1 className="text-2xl font-semibold">动作库</h1>
          </div>
        </div>

        <ExerciseLibrary />
      </section>
    </main>
  );
}
