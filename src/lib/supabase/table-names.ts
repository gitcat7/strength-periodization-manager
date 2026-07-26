export const DB_TABLE = {
  exercises: "cfg_exercises",
  athleteProfiles: "usr_athlete_profiles",
  liftProfiles: "usr_lift_profiles",
  programs: "plan_programs",
  workouts: "plan_workouts",
  workoutExercises: "plan_workout_exercises",
  setLogs: "log_set_logs",
  recommendations: "log_recommendations",
  prGoals: "log_pr_goals",
  feedbackReports: "ops_feedback_reports",
  analyticsEvents: "ops_analytics_events",
  agentAccessTokens: "ops_agent_access_tokens"
} as const;
