"use client";

import { useState } from "react";
import { CalendarX2, Loader2, Trash2 } from "lucide-react";

export type UnavailableDateItem = {
  id: string;
  date: string;
  note: string | null;
};

export type UnavailableDateManagerProps = {
  dates: UnavailableDateItem[];
  onAdd: (date: string, note: string) => void;
  onRemove: (id: string) => void;
  busy?: boolean;
};

export function UnavailableDateManager({ dates, onAdd, onRemove, busy = false }: UnavailableDateManagerProps) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  const sortedDates = [...dates].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-action/10 text-action">
          <CalendarX2 size={18} />
        </span>
        <div>
          <h2 className="font-semibold">不可训练日</h2>
          <p className="text-sm text-muted">出差、考试等确定无法训练的日子，训练会自动顺延。</p>
        </div>
      </div>

      {sortedDates.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {sortedDates.map((item) => (
            <li
              className="flex items-center justify-between gap-3 rounded-lg bg-field px-3 py-2 text-sm"
              key={item.id}
            >
              <span>
                <span className="font-semibold">{item.date}</span>
                {item.note ? <span className="ml-2 text-muted">{item.note}</span> : null}
              </span>
              <button
                aria-label={`删除 ${item.date}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={() => onRemove(item.id)}
                type="button"
              >
                <Trash2 size={14} />
                删除 {item.date}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">还没有不可训练日。</p>
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input
          aria-label="不可训练日期"
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
          disabled={busy}
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
        <input
          aria-label="备注（可选）"
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
          disabled={busy}
          maxLength={40}
          onChange={(event) => setNote(event.target.value)}
          placeholder="备注（可选）"
          type="text"
          value={note}
        />
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy || !date}
          onClick={() => {
            if (!date) return;
            onAdd(date, note.trim());
            setDate("");
            setNote("");
          }}
          type="button"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : null}
          添加
        </button>
      </div>
    </section>
  );
}
