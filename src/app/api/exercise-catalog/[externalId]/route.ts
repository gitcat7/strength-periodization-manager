import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isWgerExternalId } from "@/domain/external-exercise";
import { getWgerExercise } from "@/lib/wger-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ externalId: string }> }) {
  const { externalId } = await params;
  if (!isWgerExternalId(externalId)) return jsonError("INVALID_EXERCISE_QUERY", 400);
  if (!(await hasSession(request))) return jsonError("UNAUTHORIZED", 401);

  try {
    const item = await getWgerExercise(externalId);
    if (!item) return jsonError("EXERCISE_NOT_FOUND", 404);
    return NextResponse.json(item, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return jsonError("WGER_UNAVAILABLE", 503);
  }
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
