import type { ExternalExerciseReference } from "@/domain/external-exercise";

type ExerciseCatalogListProps = {
  records: readonly ExternalExerciseReference[];
  selectedExternalId: string | null;
  onSelect: (externalId: string) => void;
};

export function ExerciseCatalogList({ onSelect, records, selectedExternalId }: ExerciseCatalogListProps) {
  if (records.length === 0) {
    return <div className="rounded-xl border border-dashed border-line bg-field px-4 py-8 text-center text-sm leading-6 text-muted">没有符合当前关键词的动作。试试英文名称或更短的关键词。</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white" role="list">
      {records.map((record) => {
        const selected = record.externalId === selectedExternalId;
        return <button aria-current={selected ? "true" : undefined} className={`flex min-h-[76px] w-full items-center gap-3 border-b border-line px-3 py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action ${selected ? "bg-action/10" : "hover:bg-field"}`} key={record.externalId} onClick={() => onSelect(record.externalId)} role="listitem" type="button"><span className="min-w-0"><span className="block truncate font-semibold text-ink">{record.name}</span><span className="mt-1 block truncate text-xs text-muted">{record.muscles.join(" · ") || record.category || "未注明"} · {record.equipment.join(" · ") || "未注明器械"}</span></span></button>;
      })}
    </div>
  );
}
