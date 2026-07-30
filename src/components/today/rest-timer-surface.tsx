export type RestTimerSurfaceProps = {
  context: string;
  enabled: boolean;
  isRunning: boolean;
  onNudge(seconds: number): void;
  onPause(): void;
  onReset(): void;
  onResume(): void;
  onSecondsChange(seconds: number): void;
  onSkip(): void;
  onToggle(enabled: boolean): void;
  options: number[];
  remaining: number;
  seconds: number;
};

function format(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RestTimerSurface(props: RestTimerSurfaceProps) {
  if (props.remaining > 0) {
    return (
      <aside aria-live="polite" className="fixed inset-x-4 bottom-[calc(10rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-xl border border-action/20 bg-white/95 p-3 shadow-xl backdrop-blur" data-rest-timer-floating>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="truncate text-xs text-muted">{props.context}</p><p className="text-2xl font-bold tabular-nums text-action">{format(props.remaining)}</p></div>
          <button className="h-11 rounded-lg border border-line px-4 font-semibold" onClick={props.isRunning ? props.onPause : props.onResume} type="button">{props.isRunning ? "暂停" : "继续"}</button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button className="h-11 rounded-lg border border-line" onClick={() => props.onNudge(15)} type="button">+15秒</button>
          <button className="h-11 rounded-lg border border-line" onClick={props.onReset} type="button">重置</button>
          <button className="h-11 rounded-lg border border-line" onClick={props.onSkip} type="button">跳过</button>
        </div>
      </aside>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">组间休息 {props.seconds} 秒</span>
        <label className="flex h-11 items-center gap-2 text-sm"><input checked={props.enabled} onChange={(event) => props.onToggle(event.target.checked)} type="checkbox" />启用</label>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.options.map((seconds) => <button className={`h-11 rounded-lg px-3 text-sm ${seconds === props.seconds ? "bg-action text-white" : "border border-line"}`} key={seconds} onClick={() => props.onSecondsChange(seconds)} type="button">{seconds} 秒</button>)}
      </div>
    </div>
  );
}
