"use client";

import { Moon } from "lucide-react";
import { getWorkoutPresentation } from "@/domain/workout-presentation";

interface RestDayCardProps {
  onCompleteRest?: () => void;
  onViewNextWorkout?: () => void;
  scheduledDate: string;
  workoutName: string;
}

export function RestDayCard({ onCompleteRest, onViewNextWorkout, scheduledDate, workoutName }: RestDayCardProps) {
  const presentation = getWorkoutPresentation({ dayType: "rest", status: "scheduled" });

  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#4a7a9a]/10 text-[#4a7a9a]">
          <Moon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{scheduledDate}</p>
          <h2 className="text-xl font-semibold">{workoutName}</h2>
          <p className="mt-1 text-sm text-muted">恢复日保持低强度活动，帮助身体适应训练负荷。</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#4a7a9a]/10 px-3 py-1 text-xs font-semibold text-[#4a7a9a]">
          {presentation.label}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          aria-label="完成休息"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#4a7a9a]/30 bg-[#4a7a9a]/5 px-4 font-semibold text-[#4a7a9a] transition active:scale-[0.98]"
          onClick={onCompleteRest}
          title="完成休息"
          type="button"
        >
          <Moon size={17} />
          完成休息
        </button>
        <button
          aria-label="查看下一节训练"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-field px-4 font-semibold text-ink transition active:scale-[0.98]"
          onClick={onViewNextWorkout}
          title="查看下一节训练"
          type="button"
        >
          查看下一节训练
        </button>
      </div>
    </section>
  );
}
