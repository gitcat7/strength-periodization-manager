import type { PlanSetupInput } from "@/domain/plan-setup";

export type ProfileContextFormProps = {
  errors: Record<string, string>;
  isSaving: boolean;
  onChange: (value: PlanSetupInput) => void;
  onSave: () => void;
  value: PlanSetupInput;
};

export function ProfileContextForm({ errors, isSaving, onChange, onSave, value }: ProfileContextFormProps) {
  function update(patch: Partial<PlanSetupInput>) {
    onChange({ ...value, ...patch });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-4">
        <p className="page-kicker">训练画像</p>
        <h2 className="text-xl font-bold">更新体重、饮食与恢复</h2>
        <p className="mt-1 text-sm leading-6 text-muted">保存不会修改当前周期、已安排的训练或历史记录；这些数据会用于下一次重建计划。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">当前体重（可选）</span>
          <input aria-label="当前体重 kg" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" inputMode="decimal" max="300" min="30" onChange={(event) => update({ currentBodyWeightKg: event.target.value })} placeholder="例如 70" step="0.1" type="number" value={value.currentBodyWeightKg ?? ""} />
          {errors.currentBodyWeightKg ? <p className="mt-1 text-xs text-red-600">{errors.currentBodyWeightKg}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">目标体重（可选）</span>
          <input aria-label="目标体重 kg" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" inputMode="decimal" max="300" min="30" onChange={(event) => update({ targetBodyWeightKg: event.target.value })} placeholder="例如 65" step="0.1" type="number" value={value.targetBodyWeightKg ?? ""} />
          <p className="mt-1 text-xs text-muted">按 {value.weekCount} 周换算为每周体重变化。</p>
          {errors.targetBodyWeightKg ? <p className="mt-1 text-xs text-red-600">{errors.targetBodyWeightKg}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">近 14 天体重变化（可选）</span>
          <input aria-label="近14天体重变化 kg" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" inputMode="decimal" max="3" min="-3" onChange={(event) => update({ weightChangeLast14DaysKg: event.target.value })} placeholder="当前体重 - 14 天前体重" step="0.1" type="number" value={value.weightChangeLast14DaysKg ?? ""} />
          {errors.weightChangeLast14DaysKg ? <p className="mt-1 text-xs text-red-600">{errors.weightChangeLast14DaysKg}</p> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">饮食执行度</span>
          <select aria-label="饮食执行度" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => update({ nutritionAdherence: event.target.value as PlanSetupInput["nutritionAdherence"] })} value={value.nutritionAdherence ?? "moderate"}>
            <option value="high">高：大部分时间按计划执行</option><option value="moderate">中：有少量偏离</option><option value="low">低：近期难以稳定执行</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">恢复状态</span>
          <select aria-label="恢复状态" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => update({ recoveryStatus: event.target.value as PlanSetupInput["recoveryStatus"] })} value={value.recoveryStatus ?? "normal"}>
            <option value="high">良好：睡眠、精力和酸痛都可控</option><option value="normal">一般：可正常训练</option><option value="low">偏低：疲劳、睡眠或酸痛影响训练</option>
          </select>
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input checked={value.proteinTargetMet ?? false} className="mt-1 h-4 w-4" onChange={(event) => update({ proteinTargetMet: event.target.checked })} type="checkbox" />
        <span>近期大多数日子达到自己的蛋白质目标</span>
      </label>
      <button className="pressable mt-4 inline-flex h-11 items-center justify-center rounded-md bg-action px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={onSave} type="button">{isSaving ? "保存中…" : "保存画像数据"}</button>
    </section>
  );
}
