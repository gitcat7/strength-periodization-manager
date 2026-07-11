import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const healthy = hasSupabaseUrl && hasSupabaseAnonKey;

  return NextResponse.json(
    {
      env: {
        agentApi: hasServiceRoleKey,
        supabaseAnonKey: hasSupabaseAnonKey,
        supabaseUrl: hasSupabaseUrl
      },
      ok: healthy,
      service: "strength-periodization-manager",
      timestamp: new Date().toISOString()
    },
    {
      status: healthy ? 200 : 500
    }
  );
}
