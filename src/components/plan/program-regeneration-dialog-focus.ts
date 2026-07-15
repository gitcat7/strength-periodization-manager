export function getFocusTrapTarget<T extends Element>(
  focusableElements: T[],
  activeElement: Element | null,
  shiftKey: boolean
): T | null {
  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];

  if (!first || !last) return null;

  if (!activeElement || !focusableElements.includes(activeElement as T)) {
    return shiftKey ? last : first;
  }

  if (activeElement === first && shiftKey) return last;
  if (activeElement === last && !shiftKey) return first;

  return null;
}
