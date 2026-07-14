import type { ExerciseCatalogSummary } from "@/domain/exercise-catalog";

type ExerciseCatalogListProps = {
  programExternalIds: ReadonlySet<string>;
  records: readonly ExerciseCatalogSummary[];
  selectedExternalId: string | null;
  onSelect: (externalId: string) => void;
};

export function ExerciseCatalogList({
  onSelect,
  programExternalIds,
  records,
  selectedExternalId
}: ExerciseCatalogListProps) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-field px-4 py-8 text-center text-sm leading-6 text-muted">
        没有符合当前条件的动作。试着清除筛选或换一个关键词。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white" role="list">
      {records.map((record) => {
        const selected = record.externalId === selectedExternalId;
        const inProgram = programExternalIds.has(record.externalId);

        return (
          <button
            aria-current={selected ? "true" : undefined}
            className={`flex min-h-[76px] w-full items-center justify-between gap-3 border-b border-line px-3 py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action ${
              selected ? "bg-action/10" : "hover:bg-field"
            }`}
            key={record.externalId}
            onClick={() => onSelect(record.externalId)}
            role="listitem"
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold text-ink">{record.nameZh ?? record.nameEn}</span>
              {record.nameZh ? <span className="mt-0.5 block truncate text-sm text-muted">{record.nameEn}</span> : null}
              <span className="mt-1 block truncate text-xs text-muted">
                {record.equipment} · {record.target}
              </span>
            </span>
            {inProgram ? (
              <span className="shrink-0 rounded-full border border-action/20 bg-white px-2 py-1 text-xs font-semibold text-action">
                计划可替换
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
