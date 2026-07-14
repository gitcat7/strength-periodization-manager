export type FocusTarget = {
  focus: () => void;
};

export function getNextDialogFocusTarget<T>(
  focusTargets: readonly T[],
  currentTarget: T | null,
  shiftKey: boolean
): T | null {
  const firstTarget = focusTargets[0] ?? null;
  const lastTarget = focusTargets.at(-1) ?? null;
  if (!firstTarget || !lastTarget) return null;

  const currentIndex = currentTarget ? focusTargets.indexOf(currentTarget) : -1;
  if (currentIndex === -1) return shiftKey ? lastTarget : firstTarget;
  if (shiftKey && currentIndex === 0) return lastTarget;
  if (!shiftKey && currentIndex === focusTargets.length - 1) return firstTarget;
  return null;
}

export function createDetailFocusManager() {
  let previousFocus: FocusTarget | null = null;

  return {
    capture(target: FocusTarget | null) {
      previousFocus = target;
    },
    restore() {
      previousFocus?.focus();
      previousFocus = null;
    }
  };
}
