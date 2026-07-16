export function getUserScopedCache<T extends { userId: string }>(
  cache: T | null,
  userId: string,
): T | null {
  return cache?.userId === userId ? cache : null;
}
