"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, Search } from "lucide-react";
import type { ExternalExerciseReference } from "@/domain/external-exercise";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { ExerciseCatalogList } from "./exercise-catalog-list";
import { ExerciseDetailPanel } from "./exercise-detail-panel";

type LoadStatus = "idle" | "loading" | "error";

export function ExerciseLibrary() {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<ExternalExerciseReference[]>([]);
  const [selectedExternalId, setSelectedExternalId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [message, setMessage] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRecords([]);
      setSelectedExternalId(null);
      setStatus("idle");
      setMessage("");
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void search();
    }, 250);

    async function search() {
      setStatus("loading");
      setMessage("");
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session?.access_token) {
          window.location.href = "/login?next=/exercises";
          return;
        }

        const response = await fetch(`/api/exercise-catalog/search?q=${encodeURIComponent(trimmed)}&page=1`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(response.status === 503 ? "动作服务暂不可用，请重试。" : "动作搜索失败，请重试。");
        const payload = await response.json() as { items?: ExternalExerciseReference[] };
        if (!Array.isArray(payload.items)) throw new Error("动作搜索结果异常，请重试。");
        if (!active) return;

        setRecords(payload.items);
        setSelectedExternalId((current) => payload.items?.some((item) => item.externalId === current) ? current : payload.items?.[0]?.externalId ?? null);
        setStatus("idle");
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "动作搜索失败，请重试。");
      }
    }

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, retryKey]);

  const selectedRecord = records.find((record) => record.externalId === selectedExternalId) ?? null;

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">搜索动作</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} />
        <input
          className="h-11 w-full rounded-lg border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-action focus:ring-2 focus:ring-action/20"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索英文动作名称"
          type="search"
          value={query}
        />
      </label>

      <p className="text-sm text-muted">动作数据由 wger 提供，仅在搜索时引用；不会保存完整动作目录。</p>

      {status === "loading" ? <CatalogStatus icon={<Loader2 className="animate-spin" size={18} />} message="正在搜索动作" /> : null}
      {status === "error" ? <CatalogStatus action={() => setRetryKey((current) => current + 1)} icon={<RefreshCcw size={18} />} message={message} /> : null}
      {status === "idle" && query.trim() ? (
        <>
          <p className="text-sm text-muted">{records.length} 个动作</p>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
            <ExerciseCatalogList onSelect={(externalId) => { setSelectedExternalId(externalId); setDetailOpen(true); }} records={records} selectedExternalId={selectedExternalId} />
            <ExerciseDetailPanel desktopSide localGuidance={null} onClose={() => setDetailOpen(false)} open={detailOpen} reference={detailOpen ? selectedRecord : null} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function CatalogStatus({ action, icon, message }: { action?: () => void; icon: React.ReactNode; message: string }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-field px-4 text-center text-sm text-muted" role="status">
      <span className="text-action">{icon}</span>
      <p>{message}</p>
      {action ? <button className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 font-semibold text-ink" onClick={action} type="button"><RefreshCcw size={15} />重试</button> : null}
    </div>
  );
}
