import type { ReactNode } from "react";

import type { PlanOutline, PlanOutlineWorkout } from "@/domain/plan-outline";

export type PlanScheduleOutlineProps = {
  defaultCycleIndex: number | null;
  defaultWeek: number;
  mode: "all" | "collapsed" | "default";
  onModeChange: (mode: "all" | "collapsed" | "default") => void;
  outline: PlanOutline;
  renderWorkout: (workout: PlanOutlineWorkout, index: number) => ReactNode;
};

export function PlanScheduleOutline({
  defaultCycleIndex,
  defaultWeek,
  mode,
  onModeChange,
  outline,
  renderWorkout
}: PlanScheduleOutlineProps) {
  return (
    <section aria-label="训练计划日程" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" onClick={() => onModeChange("default")} type="button">当前进度</button>
        <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" onClick={() => onModeChange("all")} type="button">全部展开</button>
        <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" onClick={() => onModeChange("collapsed")} type="button">全部收起</button>
      </div>
      <div className="space-y-3" key={mode}>
        {outline.map((week) => (
          <details
            className="rounded-lg border border-line bg-white"
            data-plan-week={week.week}
            key={week.week}
            open={mode === "all" || (mode === "default" && week.week === defaultWeek)}
          >
            <summary className="cursor-pointer px-4 py-3 font-semibold">
              计划第 {week.week} 周 · 日历执行{week.calendarWeekLabel} · 已完成 {week.completedTrainingDays}/{week.totalTrainingDays}
              {week.deferredTrainingDays > 0 ? ` · 含 ${week.deferredTrainingDays} 节延期/追加训练` : ""}
            </summary>
            <div className="space-y-2 border-t border-line p-3">
              {week.cycles.map((cycle) => (
                <details
                  className="rounded-md border border-line bg-field"
                  data-plan-cycle={cycle.index}
                  key={cycle.index}
                  open={mode === "all" || (mode === "default" && week.week === defaultWeek && cycle.index === defaultCycleIndex)}
                >
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">循环 {cycle.index} · {cycle.label}</summary>
                  <div className="space-y-2 border-t border-line p-2">
                    {cycle.workouts.map(renderWorkout)}
                  </div>
                </details>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
