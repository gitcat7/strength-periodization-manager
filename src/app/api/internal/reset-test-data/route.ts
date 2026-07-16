import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deleteAllAuthUsers } from "@/lib/test-auth-reset";

export const dynamic = "force-dynamic";

function hasValidResetToken(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export async function POST(request: Request) {
  if (!hasValidResetToken(request.headers.get("x-reset-token"), process.env.DATA_RESET_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await deleteAllAuthUsers(createAdminSupabaseClient());
    return NextResponse.json({ ok: true, deletedUsers: result.deletedUsers });
  } catch {
    return NextResponse.json({ error: "Auth test-data reset failed" }, { status: 500 });
  }
}
