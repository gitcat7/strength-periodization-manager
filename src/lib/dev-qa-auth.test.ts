import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isLocalDevelopmentHost, isLocalQaSessionEnabled } from "./dev-qa-auth";

const completeConfig = {
  nodeEnv: "development",
  hostname: "localhost",
  qaEmail: "qa@example.com",
  qaPassword: "test-password",
  supabaseAnonKey: "anon-key",
  supabaseUrl: "https://example.supabase.co"
};

describe("isLocalQaSessionEnabled", () => {
  it("enables a fully configured local development request", () => {
    expect(isLocalQaSessionEnabled(completeConfig)).toBe(true);
  });

  it("rejects production and preview-like environments", () => {
    expect(isLocalQaSessionEnabled({ ...completeConfig, nodeEnv: "production" })).toBe(false);
    expect(isLocalQaSessionEnabled({ ...completeConfig, nodeEnv: "test" })).toBe(false);
  });

  it("rejects non-local hosts and missing private credentials", () => {
    expect(isLocalQaSessionEnabled({ ...completeConfig, hostname: "strength-periodization-manager.vercel.app" })).toBe(false);
    expect(isLocalQaSessionEnabled({ ...completeConfig, hostname: "127.0.0.1" })).toBe(true);
    expect(isLocalQaSessionEnabled({ ...completeConfig, qaEmail: "" })).toBe(false);
    expect(isLocalQaSessionEnabled({ ...completeConfig, qaPassword: "" })).toBe(false);
  });
});

describe("isLocalDevelopmentHost", () => {
  it("allows only development requests made to localhost", () => {
    expect(isLocalDevelopmentHost({ nodeEnv: "development", hostname: "localhost" })).toBe(true);
    expect(isLocalDevelopmentHost({ nodeEnv: "development", hostname: "127.0.0.1" })).toBe(true);
    expect(isLocalDevelopmentHost({ nodeEnv: "production", hostname: "localhost" })).toBe(false);
    expect(isLocalDevelopmentHost({ nodeEnv: "development", hostname: "preview.vercel.app" })).toBe(false);
  });
});

describe("local QA server binding", () => {
  it("binds the supported development command to loopback only", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { scripts: { dev: string } };

    expect(packageJson.scripts.dev).toContain("--hostname 127.0.0.1");
  });
});
