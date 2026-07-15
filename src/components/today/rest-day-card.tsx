"use client";

import Link from "next/link";
import { CheckCircle2, HeartPulse, Loader2 } from "lucide-react";

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
    <section className="space-y-4 rounded-xl border border-line bg-field p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">
          <HeartPulse size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{restItem.scheduledDate}</p>
          <h2 className="text-xl font-semibold">今日恢复</h2>
          <p className="mt-1 text-sm text-muted">按计划休息，给下一节训练留出恢复空间。</p>
        </div>
      </div>

      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
