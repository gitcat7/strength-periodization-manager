import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export function AdvancedSettingsDisclosure({
  children
}: {
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  return (
    <section className="rounded-lg border border-line bg-white">
      <button
        aria-label="高级功能"
        aria-controls={contentId}
        aria-expanded={expanded}
        className="flex h-11 w-full items-center justify-between gap-3 px-4 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block font-semibold" data-settings-group>高级功能</span>
          <span className="block truncate text-xs text-muted">Agent 授权、诊断与维护</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          size={18}
        />
      </button>
      {expanded ? (
        <div className="border-t border-line p-4" id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
