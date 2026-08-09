export function getLoginNext(searchParams: URLSearchParams): string {
  const next = searchParams.get("next");
  return isSafeInternalPath(next) ? next : "/";
}

function isSafeInternalPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(path));
}
