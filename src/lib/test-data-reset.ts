export const userGeneratedDataTables = [
  "analytics_events",
  "feedback_reports",
  "agent_access_tokens",
  "recommendations",
  "pr_goals",
  "programs",
  "lift_profiles",
  "athlete_profiles"
] as const;

type ResetClient = {
  from(table: string): {
    delete(): {
      not(column: string, operator: string, value: null): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export async function deleteUserGeneratedData(client: ResetClient) {
  for (const table of userGeneratedDataTables) {
    const { error } = await client.from(table).delete().not("id", "is", null);
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
  }

  return { deletedTables: userGeneratedDataTables };
}
