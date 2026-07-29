import { expect, it } from "vitest";
import { parseCompletionResult } from "./completion-result";

it("rejects malformed completion results", () => expect(() => parseCompletionResult({ status: "completed" })).toThrow("INVALID_COMPLETION_RESULT"));
