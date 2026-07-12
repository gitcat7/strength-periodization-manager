"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Search } from "lucide-react";
import type { ExerciseCatalogFilters, ExerciseCatalogRecord } from "@/domain/exercise-catalog";
import { loadExerciseCatalog } from "@/lib/exercise-catalog-client";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ExerciseCatalogList } from "./exercise-catalog-list";
import { ExerciseDetailPanel } from "./exercise-detail-panel";
import { deriveExerciseLibraryState } from "./exercise-library-state";

type LoadStatus = "loading" | "ready" | "error";

type CatalogExternalIdRow = {
  catalog_external_id: string | null;
};

const initialFilters: ExerciseCatalogFilters = {
  bodyPart: "",
  equipment: "",
  programOnly: false,
  query: "",
  target: ""
};

export function ExerciseLibrary() {
  const [filters, setFilters] = useState<ExerciseCatalogFilters>(initialFilters);
  const [message, setMessage] = useState("");
  const [programExternalIds, setProgramExternalIds] = useState<string[]>([]);
  const [records, setRecords] = useState<ExerciseCatalogRecord[]>([]);
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadLibrary() {
      setStatus("loading");
      setMessage("");

      try {
        const supabase = createBrowserSupabaseClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw new Error(sessionError.message);
        if (!sessionData.session?.user) {
          window.location.href = "/login?next=/exercises";
          return;
        }

        const [catalogRecords, bridgeResult] = await Promise.all([
          loadExerciseCatalog(),
          supabase.from("exercises").select("catalog_external_id").not("catalog_external_id", "is", null)
        ]);

        if (bridgeResult.error) throw new Error(bridgeResult.error.message);
        if (!active) return;

        setRecords(catalogRecords);
        setProgramExternalIds(
          ((bridgeResult.data ?? []) as CatalogExternalIdRow[])
            .map((row) => row.catalog_external_id)
            .filter((externalId): externalId is string => typeof externalId === "string")
        );
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "动作库加载失败，请稍后重试。");
      }
    }

    void loadLibrary();
    return () => {
      active = false;
    };
  }, [retryKey]);

  const libraryState = useMemo(
    () => deriveExerciseLibraryState({ filters, programExternalIds, records, selectedExternalId }),
    [filters, programExternalIds, records, selectedExternalId]
  );
  const programExternalIdSet = useMemo(() => new Set(programExternalIds), [programExternalIds]);

  function updateFilter<K extends keyof ExerciseCatalogFilters>(key: K, value: ExerciseCatalogFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setDetailOpen(false);
  }

  function selectRecord(externalId: string) {
    setSelectedExternalId(externalId);
    setDetailOpen(true);
  }

  if (status === "loading") {
    return <CatalogStatus icon={<Loader2 className="animate-spin" size={18} />} message="正在验证并加载动作库" />;
  }

  if (status === "error") {
    return (
      <CatalogStatus
        action={() => setRetryKey((current) => current + 1)}
        icon={<RefreshCcw size={18} />}
        message={message || "动作库加载失败，请稍后重试。"}
      />
    );
  }

  if (records.length === 0) {
    return (
      <CatalogStatus
        action={() => setRetryKey((current) => current + 1)}
        icon={<RefreshCcw size={18} />}
        message="动作库暂无可用数据，请检查网络后重试。"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative block sm:col-span-2 lg:col-span-2">
          <span className="sr-only">搜索动作</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} />
          <input
            className="h-11 w-full rounded-lg border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-action focus:ring-2 focus:ring-action/20"
            onChange={(event) => updateFilter("query", event.target.value)}
            placeholder="搜索中文、英文或器械"
            type="search"
            value={filters.query ?? ""}
          />
        </label>
        <FilterSelect label="部位" onChange={(value) => updateFilter("bodyPart", value)} options={libraryState.filterOptions.bodyParts} value={filters.bodyPart ?? ""} />
        <FilterSelect label="器械" onChange={(value) => updateFilter("equipment", value)} options={libraryState.filterOptions.equipment} value={filters.equipment ?? ""} />
        <FilterSelect label="目标肌群" onChange={(value) => updateFilter("target", value)} options={libraryState.filterOptions.targets} value={filters.target ?? ""} />
      </div>

      <label className="inline-flex min-h-10 items-center gap-2 text-sm text-ink">
        <input
          checked={Boolean(filters.programOnly)}
          className="h-4 w-4 rounded border-line text-action focus:ring-action"
          onChange={(event) => updateFilter("programOnly", event.target.checked)}
          type="checkbox"
        />
        仅看计划可替换动作
      </label>

      <p className="text-sm text-muted">{libraryState.results.length} 个动作</p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
        <ExerciseCatalogList
          onSelect={selectRecord}
          programExternalIds={programExternalIdSet}
          records={libraryState.results}
          selectedExternalId={libraryState.selectedExternalId}
        />
        <ExerciseDetailPanel
          desktopSide
          localGuidance={null}
          onClose={() => setDetailOpen(false)}
          open={detailOpen}
          record={detailOpen ? libraryState.selectedRecord : null}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">按{label}筛选</span>
      <select
        className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-action focus:ring-2 focus:ring-action/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">全部{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CatalogStatus({
  action,
  icon,
  message
}: {
  action?: () => void;
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-field px-4 py-8 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-sm leading-6 text-muted">
        {icon}
        <p>{message}</p>
        {action ? (
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 font-semibold text-ink"
            onClick={action}
            type="button"
          >
            <RefreshCcw size={16} />
            重试
          </button>
        ) : null}
      </div>
    </div>
  );
}
