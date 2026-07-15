"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, Moon } from "lucide-react";

import type { RestScheduleItem, TrainingScheduleItem } from "./rest-day-state";

export function RestDayCard({
  nextTraining,
  restItem,
  saving,
  onComplete
}: {
  nextTraining: TrainingScheduleItem | null;
  restItem: RestScheduleItem;
  saving: boolean;
  onComplete: () => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-[#4a7a9a]/25 bg-[#4a7a9a]/5 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#4a7a9a]/10 text-[#4a7a9a]">
          <Moon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{restItem.scheduledDate}</p>
          <h2 className="text-xl font-semibold">今日恢复</h2>
          <p className="mt-1 text-sm text-muted">按计划休息，给下一节训练留出恢复空间。</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#4a7a9a]/10 px-3 py-1 text-xs font-semibold text-[#4a7a9a]">
          {restItem.status === "completed" ? "已完成" : "休息/恢复日"}
        </span>
      </div>

      <button
        aria-label="完成休息"
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#4a7a9a]/30 bg-[#4a7a9a]/10 px-4 font-semibold text-[#4a7a9a] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={saving}
        onClick={onComplete}
        type="button"
      >
        {saving ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
        完成休息
      </button>

      {nextTraining ? (
        <Link className="block text-center text-sm font-semibold text-action underline-offset-4 hover:underline" href="/plan">
          查看下一节训练 · {nextTraining.name}
        </Link>
      ) : null}
    </section>
  );
}
