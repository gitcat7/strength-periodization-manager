import type { SupabaseClient } from "@supabase/supabase-js";

export function getLoginNext(searchParams: URLSearchParams): string {
  const next = searchParams.get("next");
  return isSafeInternalPath(next) ? next : "/";
}

export function isSupabaseVerifyLink(url: string) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.endsWith(".supabase.co") && parsedUrl.pathname.includes("/auth/v1/verify");
  } catch {
    return false;
  }
}

export function getSupabaseVerifyLinkFromPastedUrl(url: string) {
  if (isSupabaseVerifyLink(url)) return url;

  try {
    const parsedUrl = new URL(url);
    const wrappedUrl = parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("url");
    return wrappedUrl && isSupabaseVerifyLink(wrappedUrl) ? wrappedUrl : null;
  } catch {
    return null;
  }
}

export async function completeMagicLinkSignIn({
  next,
  supabase,
  url
}: {
  next: string;
  supabase: SupabaseClient;
  url: string;
}) {
  const parsedUrl = new URL(url);
  const code = parsedUrl.searchParams.get("code");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error, next };
  }

  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    return { error, next };
  }

  return {
    error: new Error("链接里没有可用的登录 code 或 token。请复制完整邮件链接。"),
    next
  };
}

export function getSafeNextFromMagicLink(url: string, fallback: string): string {
  try {
    const parsedUrl = new URL(url);
    const next = parsedUrl.searchParams.get("next");
    if (isSafeInternalPath(next)) return next;

    const redirectTo = parsedUrl.searchParams.get("redirect_to");
    if (!redirectTo) return fallback;

    const redirectUrl = new URL(redirectTo);
    const redirectNext = redirectUrl.searchParams.get("next");
    return isSafeInternalPath(redirectNext) ? redirectNext : fallback;
  } catch {
    return fallback;
  }
}

export function isSafeInternalPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}
