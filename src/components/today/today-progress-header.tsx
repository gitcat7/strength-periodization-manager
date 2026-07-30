export type TodayProgressHeaderProps = {
  completedSets: number;
  date: string;
  elapsedLabel: string | null;
  focus: string;
  intent: string;
  note: string;
  totalSets: number;
  workoutName: string;
};

export function TodayProgressHeader({
  completedSets, date, elapsedLabel, focus, intent, note, totalSets, workoutName
}: TodayProgressHeaderProps) {
  const percent = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
  return (
    <section className="action-surface overflow-hidden p-5">
      <p className="text-xs font-semibold text-muted">{date}</p>
      <div className="mt-1 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{workoutName}</h1>
          <p className="mt-1 text-sm text-muted">{intent} · {focus}</p>
        </div>
        <span className="shrink-0 rounded-full bg-action/10 px-3 py-1 text-sm font-semibold text-action">{completedSets}/{totalSets} 组</span>
      </div>
      <div aria-label={`训练进度 ${completedSets}/${totalSets} 组`} aria-valuemax={totalSets} aria-valuemin={0} aria-valuenow={completedSets} className="mt-4 h-2 overflow-hidden rounded-full bg-field" role="progressbar">
        <div className="h-full rounded-full bg-action transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">{note}</span>
        {elapsedLabel ? <span className="font-semibold text-action">{elapsedLabel}</span> : null}
      </div>
    </section>
  );
}
