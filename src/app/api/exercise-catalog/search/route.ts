import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { searchWgerExercises } from "@/lib/wger-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const input = parseSearchInput(new URL(request.url).searchParams);
  if (!input) return jsonError("INVALID_EXERCISE_QUERY", 400);
  if (!(await hasSession(request))) return jsonError("UNAUTHORIZED", 401);

  try {
    const result = await searchWgerExercises(input);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return jsonError("WGER_UNAVAILABLE", 503);
  }
}

function parseSearchInput(params: URLSearchParams) {
  const query = (params.get("q") ?? "").trim();
  const rawPage = params.get("page") ?? "1";
  const category = params.get("category") ?? undefined;
  if (!query || query.length > 80 || !/^[1-9]\d?$/.test(rawPage)) return null;
  const page = Number(rawPage);
  if (page > 50 || (category !== undefined && !/^[1-9]\d{0,4}$/.test(category))) return null;
  return { category, page, query };
}

async function hasSession(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  const { data, error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }).auth.getUser(token);
  return Boolean(data.user && !error);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { headers: { "Cache-Control": "no-store" }, status });
}
