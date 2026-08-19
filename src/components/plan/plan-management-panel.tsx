"use client";

import { useState } from "react";
import { ProfileContextForm, type ProfileContextFormProps } from "./profile-context-form";
import { PlanScheduleManagement, type PlanScheduleManagementProps } from "./plan-schedule-management";

export type PlanManagementPanelProps = {
  busy: boolean;
  onAdjust: () => void;
  onRegenerate: () => void;
  profile: ProfileContextFormProps;
  schedule: PlanScheduleManagementProps;
};

export function PlanManagementPanel(props: PlanManagementPanelProps) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <section aria-label="计划管理" className="rounded-xl border border-line bg-white p-4">
      <button
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between rounded-md px-1 text-left font-semibold"
        disabled={props.busy}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>计划管理</span>
        <span aria-hidden="true" className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-4 border-t border-line pt-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" disabled={props.busy} onClick={props.onAdjust} type="button">调整计划</button>
            <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" disabled={props.busy} onClick={props.onRegenerate} type="button">按当前参数重新生成</button>
            <button className="h-11 rounded-md border border-line bg-white px-3 text-sm font-medium" disabled={props.busy} onClick={() => setProfileOpen((current) => !current)} type="button">
              {profileOpen ? "收起画像更新" : "更新体重、饮食与恢复"}
            </button>
          </div>
          {profileOpen ? <ProfileContextForm {...props.profile} /> : null}
          <PlanScheduleManagement {...props.schedule} />
        </div>
      ) : null}
    </section>
  );
}
