"use client";

import { useMemo, useState } from "react";
import { Brain, CheckCircle2, XCircle } from "lucide-react";
import type { RecommendationType } from "@/domain/fitness-coach";

export type CoachRecommendation = {
  exercise_id: string;
  exercises: { name: string; slug: string } | null;
  id: string;
  previous_weight: number;
  reason: string;
  recommendation_type: RecommendationType;
  suggested_weight: number;
  workout_id: string | null;
  workouts: { name: string; scheduled_date: string; sequence_index: number } | null;
};

export type CoachRecommendationImpact = {
  count: number;
  dates: string[];
};

type CoachRecommendationInboxProps = {
  busy: boolean;
  getImpact: (recommendation: CoachRecommendation) => CoachRecommendationImpact;
  onAccept: (recommendation: CoachRecommendation) => Promise<void> | void;
  onReject: (recommendationId: string) => Promise<void> | void;
  onWeightChange: (recommendationId: string, weight: string) => void;
  recommendations: CoachRecommendation[];
  weights: Record<string, string>;
};

export function CoachRecommendationInbox(props: CoachRecommendationInboxProps) {
  const [showAll, setShowAll] = useState(false);
  const [preview, setPreview] = useState<CoachRecommendation | null>(null);
  const sorted = useMemo(() => {
    const unique = new Map<string, CoachRecommendation>();
    for (const recommendation of props.recommendations) {
      const key = `${recommendation.workout_id ?? "legacy"}:${recommendation.exercise_id}`;
      if (!unique.has(key)) unique.set(key, recommendation);
    }
    return [...unique.values()].sort((left, right) => priority(left.recommendation_type) - priority(right.recommendation_type));
  }, [props.recommendations]);
  const visible = showAll ? sorted : sorted.slice(0, 3);
  const remaining = Math.max(0, sorted.length - 3);
  const previewImpact = preview ? props.getImpact(preview) : null;

  if (sorted.length === 0) return null;

  return (
    <section aria-label="Fitness Coach 建议" className="rounded-xl border border-line bg-white p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-action/10 text-action"><Brain size={20} /></span>
        <div>
          <h2 className="font-semibold">Fitness Coach 建议</h2>
          <p className="text-sm text-muted">先预览影响范围，再应用到当前周期的后续训练日。</p>
        </div>
      </div>
      <div className="space-y-3">
        {visible.map((recommendation) => (
          <article className="rounded-lg bg-field p-3" key={recommendation.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{recommendation.exercises?.name ?? "动作"}</h3>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-action">{formatType(recommendation.recommendation_type)}</span>
                </div>
                <p className="mt-1 text-sm tabular-nums text-muted">{recommendation.previous_weight}kg → {recommendation.suggested_weight}kg</p>
                <p className="mt-2 text-sm leading-6 text-muted">{recommendation.reason}</p>
                <label className="mt-3 block max-w-40">
                  <span className="mb-1 block text-xs text-muted">应用重量 kg</span>
                  <input className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm tabular-nums" min="0" onChange={(event) => props.onWeightChange(recommendation.id, event.target.value)} step="0.5" type="number" value={props.weights[recommendation.id] ?? String(recommendation.suggested_weight)} />
                </label>
                {recommendation.workouts ? <p className="mt-2 text-xs text-muted">来源：{recommendation.workouts.scheduled_date} · {recommendation.workouts.name}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-52">
                <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-3 text-sm font-semibold text-white disabled:opacity-60" disabled={props.busy} onClick={() => setPreview(recommendation)} type="button"><CheckCircle2 size={16} />预览应用</button>
                <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold disabled:opacity-60" disabled={props.busy} onClick={() => void props.onReject(recommendation.id)} type="button"><XCircle size={16} />忽略</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {remaining > 0 ? (
        <button className="mt-3 h-11 rounded-md border border-line bg-white px-4 text-sm font-medium" onClick={() => setShowAll((current) => !current)} type="button">
          {showAll ? "收起建议" : `还有 ${remaining} 条建议`}
        </button>
      ) : null}
      {preview && previewImpact ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">确认应用 {preview.exercises?.name ?? "动作"} 建议</h3>
            <p className="mt-3 text-sm leading-6 text-muted">将影响 {previewImpact.count} 个后续训练日，并保持各训练日原有的强度与减量差异。</p>
            {previewImpact.dates.length > 0 ? <p className="mt-2 text-sm text-muted">涉及日期：{previewImpact.dates.slice(0, 5).join("、")}{previewImpact.dates.length > 5 ? "…" : ""}</p> : <p className="mt-2 text-sm text-muted">当前没有包含该动作的后续训练日。</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="h-11 rounded-md border border-line bg-white px-4 font-semibold" onClick={() => setPreview(null)} type="button">取消</button>
              <button className="h-11 rounded-md bg-action px-4 font-semibold text-white disabled:opacity-60" disabled={props.busy || previewImpact.count === 0} onClick={() => void Promise.resolve(props.onAccept(preview)).then(() => setPreview(null))} type="button">确认应用</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function priority(type: RecommendationType) {
  if (type === "deload" || type === "decrease") return 0;
  if (type === "hold") return 1;
  return 2;
}

function formatType(type: RecommendationType) {
  if (type === "increase") return "加重";
  if (type === "decrease") return "降重";
  if (type === "deload") return "减量恢复";
  return "保持";
}
