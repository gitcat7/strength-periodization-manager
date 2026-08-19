import type { ReactNode } from "react";

type PlanManagementPanelProps = {
  busy: boolean;
  children: ReactNode;
  onAdjust: () => void;
  onRegenerate: () => void;
  onToggle: () => void;
  onToggleProfile: () => void;
  open: boolean;
  profileOpen: boolean;
};

export function PlanManagementPanel(props: PlanManagementPanelProps) {
  return (
    <section aria-label="计划管理" className="rounded-xl border border-line bg-white p-4">
      <button
        aria-expanded={props.open}
        className="flex h-11 w-full items-center justify-between rounded-md px-1 text-left font-semibold"
        disabled={props.busy}
        onClick={props.onToggle}
        type="button"
      >
        <span>计划管理</span>
        <span aria-hidden="true" className="text-muted">{props.open ? "−" : "+"}</span>
      </button>
      {props.open ? (
        <div className="mt-3 space-y-4 border-t border-line pt-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" disabled={props.busy} onClick={props.onAdjust} type="button">调整计划</button>
            <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" disabled={props.busy} onClick={props.onRegenerate} type="button">按当前参数重新生成</button>
            <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" disabled={props.busy} onClick={props.onToggleProfile} type="button">
              {props.profileOpen ? "收起画像更新" : "更新体重、饮食与恢复"}
            </button>
          </div>
          {props.children}
        </div>
      ) : null}
    </section>
  );
}
