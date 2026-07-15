import type { SupabaseClient } from "@supabase/supabase-js";

export type AnalyticsEventName =
  | "profile_saved"
  | "program_generated"
  | "program_regenerated"
  | "workout_saved"
  | "workout_completed"
  | "recommendation_accepted"
  | "recommendation_modified"
  | "recommendation_rejected"
  | "pr_goal_created"
  | "pr_goal_completed"
  | "pr_goal_cancelled"
  | "csv_exported"
  | "feedback_submitted"
  | "exercise_substituted";

export async function trackEvent({
  eventName,
  properties = {},
  supabase,
  userId
}: {
  eventName: AnalyticsEventName;
  properties?: Record<string, unknown>;
  supabase: SupabaseClient;
  userId: string | null;
}) {
  if (!userId) return;

  try {
    const pagePath = typeof window === "undefined" ? null : window.location.pathname;
    const { error } = await supabase.from("analytics_events").insert({
      event_name: eventName,
      page_path: pagePath,
      properties,
      user_id: userId
    });

    if (error) {
      console.warn("analytics event failed", error.message);
    }
  } catch (error) {
    console.warn("analytics event failed", error);
  }
}
