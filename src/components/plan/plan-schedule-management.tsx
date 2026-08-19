"use client";

import { useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import type { PauseReason } from "@/domain/schedule-adjustment";
import { UnavailableDateManager, type UnavailableDateItem } from "./unavailable-date-manager";

export type PlanScheduleManagementProps = {
  available: boolean;
  busy: boolean;
  hasPendingScheduleRows: boolean;
  onAddUnavailableDate: (date: string, note: string) => void;
  onExtraRest: () => void;
  onPause: (reason: PauseReason, resumeDate: string) => Promise<boolean>;
  onRemoveUnavailableDate: (id: string) => void;
  onResume: () => void;
  paused: boolean;
  recoveryMessage: string | null;
  resumeDate: string | null;
  unavailableDates: UnavailableDateItem[];
};

export function PlanScheduleManagement(props: PlanScheduleManagementProps) {
  const [pauseFormOpen, setPauseFormOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState<PauseReason>("fatigue");
  const [pauseResumeDate, setPauseResumeDate] = useState("");
  const [pauseSubmitting, setPauseSubmitting] = useState(false);
  if (!props.available) return null;
  const actionBusy = props.busy || pauseSubmitting;

  async function submitPause() {
    setPauseSubmitting(true);
    const saved = await props.onPause(pauseReason, pauseResumeDate);
    setPauseSubmitting(false);
    if (saved) {
      setPauseFormOpen(false);
      setPauseResumeDate("");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action">{props.paused ? <Play size={20} /> : <Pause size={20} />}</span>
          <div><h2 className="font-semibold">日程调整</h2><p className="text-sm text-muted">暂停、恢复或多休一天，训练顺序会自动保持。</p></div>
        </div>
        {props.paused ? (
          <div className="rounded-lg border border-[#c75c1a]/30 bg-[#c75c1a]/5 p-3">
            <p className="font-semibold text-[#c75c1a]">计划已暂停</p>
            <p className="mt-1 text-sm text-muted">{props.resumeDate ? `预计 ${props.resumeDate} 恢复。` : "尚未设置恢复日期。"}{props.recoveryMessage ? ` ${props.recoveryMessage}` : ""}</p>
            <button className="pressable mt-3 inline-flex h-11 items-center gap-2 rounded-md bg-action px-4 font-semibold text-white disabled:opacity-60" disabled={actionBusy || !props.hasPendingScheduleRows} onClick={props.onResume} type="button"><Play size={16} />恢复训练</button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button className="pressable inline-flex h-11 items-center rounded-md border border-line bg-white px-4 font-semibold disabled:opacity-60" disabled={actionBusy || !props.hasPendingScheduleRows} onClick={props.onExtraRest} type="button">今天多休一天</button>
            <button className="pressable inline-flex h-11 items-center rounded-md border border-line bg-white px-4 font-semibold" disabled={actionBusy} onClick={() => setPauseFormOpen((current) => !current)} type="button">{pauseFormOpen ? "收起暂停设置" : "暂停计划"}</button>
          </div>
        )}
        {pauseFormOpen && !props.paused ? (
          <div className="mt-3 grid gap-3 rounded-lg bg-field p-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-sm font-medium">暂停原因</span><select aria-label="暂停原因" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" disabled={actionBusy} onChange={(event) => setPauseReason(event.target.value as PauseReason)} value={pauseReason}><option value="fatigue">疲劳累积，需要休整</option><option value="time_conflict">工作/学习时间冲突</option><option value="minor_discomfort">轻微不适</option><option value="injury">受伤</option><option value="personal">个人事务</option><option value="other">其他</option></select></label>
            <label className="block"><span className="mb-1 block text-sm font-medium">预计恢复日期（可选）</span><input aria-label="预计恢复日期（可选）" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" disabled={actionBusy} onChange={(event) => setPauseResumeDate(event.target.value)} type="date" value={pauseResumeDate} /></label>
            <div className="flex gap-3 sm:col-span-2">
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={actionBusy} onClick={() => void submitPause()} type="button">{actionBusy ? <Loader2 className="animate-spin" size={16} /> : null}确认暂停</button>
              <button className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold" disabled={actionBusy} onClick={() => setPauseFormOpen(false)} type="button">取消</button>
            </div>
          </div>
        ) : null}
      </section>
      <UnavailableDateManager busy={props.busy} dates={props.unavailableDates} onAdd={props.onAddUnavailableDate} onRemove={props.onRemoveUnavailableDate} />
    </div>
  );
}
