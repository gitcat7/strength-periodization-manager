import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

describe("email OTP login contract", () => {
  it("keeps the form on the eight-digit OTP flow", async () => {
    const form = await read("src/components/auth/email-login-form.tsx");
    expect(form).toContain("signInWithOtp");
    expect(form).toContain("verifyOtp");
    expect(form).toContain('type: "email"');
    expect(form).toContain("maxLength={8}");
    expect(form).not.toContain(["粘贴", "邮件", "链接登录"].join(""));
    expect(form).not.toContain("emailRedirect" + "To");
  });

  it("documents the Supabase token template and removes link-only setup", async () => {
    const docs = await Promise.all([
      read("docs/09_development_setup.md"),
      read("docs/11_mvp_release_checklist.md"),
      read("docs/13_vercel_deployment_handoff.md")
    ]);
    const combined = docs.join("\n");
    const legacyCallback = ["/auth", "callback"].join("/");
    expect(combined).toContain("{{ .Token }}");
    expect(combined).not.toContain("Gm" + "ail 复制跳转链接");
    expect(combined).not.toContain(legacyCallback);
    expect(combined).not.toContain("邮件链接能跳回");
  });
});
