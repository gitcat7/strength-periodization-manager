import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const tokenPrefix = "ltp_";

export type AgentIdentity = {
  tokenId: string;
  userId: string;
};

export async function authenticateAgentRequest(request: Request): Promise<AgentIdentity | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ", 2);

  if (scheme.toLowerCase() !== "bearer" || !isValidTokenShape(token)) {
    return null;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("agent_access_tokens")
    .select("id,user_id,token_hash,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const storedHash = Buffer.from(data.token_hash, "hex");
  const receivedHash = Buffer.from(tokenHash, "hex");
  if (storedHash.length !== receivedHash.length || !timingSafeEqual(storedHash, receivedHash)) {
    return null;
  }

  await supabase
    .from("agent_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("user_id", data.user_id);

  return {
    tokenId: data.id,
    userId: data.user_id
  };
}

function isValidTokenShape(token: string | undefined) {
  return Boolean(token?.startsWith(tokenPrefix) && token.length >= 40 && token.length <= 100);
}
