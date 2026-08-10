import Link from "next/link";

export type CurrentProgramOverviewProps = {
  currentCycleLabel: string | null;
  currentWeek: number;
  endDate: string;
  isBusy: boolean;
  managementOpen: boolean;
  name: string;
  nextWorkout: {
    date: string;
    focus: string;
    intent: string;
    name: string;
    stateLabel: string;
  } | null;
  onAdjustPlan: () => void;
  onRegenerate: () => void;
  onToggleManagement: () => void;
  onToggleProfile: () => void;
  profileOpen: boolean;
  startDate: string;
};

export function CurrentProgramOverview(props: CurrentProgramOverviewProps) {
  return (
    <section className="action-surface p-4">
      <p className="page-kicker">当前周期</p>
      <div className="mt-1 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{props.name}</h2>
          <p className="mt-1 text-sm text-muted">
            第 {props.currentWeek} 周{props.currentCycleLabel ? ` · ${props.currentCycleLabel}` : ""}
          </p>
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
      <Link className="pressable mt-4 flex h-11 w-full items-center justify-center rounded-md bg-action px-4 font-semibold text-white" href="/today">
        继续训练
      </Link>
      <button
        aria-expanded={props.managementOpen}
        className="pressable mt-2 flex h-11 w-full items-center justify-center rounded-md border border-line bg-white px-4 font-semibold"
        disabled={props.isBusy}
        onClick={props.onToggleManagement}
        type="button"
      >
        计划管理
      </button>
      {props.managementOpen ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-field p-3">
          <button className="h-11 rounded-md px-3 text-left font-medium disabled:opacity-60" disabled={props.isBusy} onClick={props.onAdjustPlan} type="button">调整计划</button>
          <button className="h-11 rounded-md px-3 text-left font-medium disabled:opacity-60" disabled={props.isBusy} onClick={props.onRegenerate} type="button">按当前参数重新生成</button>
          <button className="h-11 rounded-md px-3 text-left font-medium disabled:opacity-60" disabled={props.isBusy} onClick={props.onToggleProfile} type="button">
            {props.profileOpen ? "收起画像更新" : "更新体重、饮食与恢复"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
