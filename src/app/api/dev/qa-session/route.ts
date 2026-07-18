import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isLocalQaSessionEnabled } from "@/lib/dev-qa-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const qaEmail = process.env.DEV_BROWSER_QA_EMAIL;
  const qaPassword = process.env.DEV_BROWSER_QA_PASSWORD;

  if (
    !isLocalQaSessionEnabled({
      hostname: new URL(request.url).hostname,
      nodeEnv: process.env.NODE_ENV,
      qaEmail,
      qaPassword,
      supabaseAnonKey,
      supabaseUrl
    })
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const { data, error } = await createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { autoRefreshToken: false, persistSession: false }
    }).auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });

    if (error || !data.session) {
      return NextResponse.json({ error: "LOCAL_QA_LOGIN_UNAVAILABLE" }, { status: 503 });
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });
  } catch {
    return NextResponse.json({ error: "LOCAL_QA_LOGIN_UNAVAILABLE" }, { status: 503 });
  }
}
