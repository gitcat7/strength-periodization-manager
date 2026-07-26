import { expect, test } from "vitest";
import { DB_TABLE } from "./table-names";

test("maps each data domain to a prefixed physical relation", () => {
  expect(DB_TABLE.exercises).toBe("cfg_exercises");
  expect(DB_TABLE.workouts).toBe("plan_workouts");
  expect(DB_TABLE.setLogs).toBe("log_set_logs");
  expect(DB_TABLE.agentAccessTokens).toBe("ops_agent_access_tokens");
  expect(Object.values(DB_TABLE).every((name) => /^(cfg|usr|plan|log|ops)_/.test(name))).toBe(true);
});
