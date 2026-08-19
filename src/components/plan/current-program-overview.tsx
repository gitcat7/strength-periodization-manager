import Link from "next/link";

export type CurrentProgramOverviewProps = {
  calendarWeekLabel: string;
  currentCycleLabel: string | null;
  currentWeek: number;
  endDate: string;
  name: string;
  nextWorkout: {
    date: string;
    focus: string;
    intent: string;
    name: string;
    stateLabel: string;
  } | null;
  nextWorkoutActionLabel: string;
  onPausedAction: () => void;
  paused: boolean;
  startDate: string;
  totalWeeks: number;
};

export function CurrentProgramOverview(props: CurrentProgramOverviewProps) {
  return (
    <section className="action-surface p-4">
      <p className="page-kicker">当前周期</p>
      <div className="mt-1 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{props.name}</h2>
          <p className="mt-1 text-sm text-muted">
            计划第 {props.currentWeek}/{props.totalWeeks} 周{props.currentCycleLabel ? ` · ${props.currentCycleLabel}` : ""}
          </p>
          <p className="text-sm text-muted">日历执行{props.calendarWeekLabel}</p>
          <p className="text-sm text-muted">{props.startDate} 至 {props.endDate}</p>
        </div>
      </div>
      {props.nextWorkout ? (
        <div className="mt-4 min-w-0 rounded-lg border border-action/15 bg-white p-3">
          <p className="page-kicker">{props.nextWorkout.stateLabel}</p>
          <p className="mt-1 truncate font-semibold">{props.nextWorkout.name}</p>
          <p className="mt-1 text-sm text-muted">
            {props.nextWorkout.intent} · {props.nextWorkout.focus} · {props.nextWorkout.date}
          </p>
        </div>
      ) : null}
      {props.paused ? (
        <button className="pressable mt-4 flex h-11 w-full items-center justify-center rounded-md bg-action px-4 font-semibold text-white" onClick={props.onPausedAction} type="button">
          恢复计划
        </button>
      ) : (
        <Link className="pressable mt-4 flex h-11 w-full items-center justify-center rounded-md bg-action px-4 font-semibold text-white" href="/today">
          {props.nextWorkoutActionLabel}
        </Link>
      )}
    </section>
  );
}
