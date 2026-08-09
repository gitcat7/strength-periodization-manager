# 邮箱验证码登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录页改为邮箱 6 位验证码登录，删除粘贴链接入口及旧邮件链接登录路径，同时保持现有邮箱身份和站内跳转安全性。

**Architecture:** `EmailLoginForm` 使用 Supabase `signInWithOtp({ email })` 发送验证码，再用 `verifyOtp({ email, token, type: "email" })` 建立会话。将站内 `next` 校验从 magic-link 工具中抽到独立的认证重定向模块；删除 callback 页面、magic-link 解析代码和所有旧入口引用。验证码发送依赖 Supabase 邮件模板中的 `{{ .Token }}`，不新增数据库结构。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Supabase JS、Vitest、Tailwind。

## Global Constraints

- 登录流程必须是邮箱输入 → 6 位数字验证码 → 当前页面完成登录。
- 登录页不得出现粘贴链接、完整邮件链接、Gmail 跳转链接或“发送登录链接”文案。
- `verifyOtp` 必须使用 `{ email, token, type: "email" }`；token 仅接受 6 位数字。
- 发送验证码后必须有 60 秒重发冷却；错误不得清空邮箱或错误地推进登录阶段。
- 保留 `next` 的站内路径校验；默认目标为 `/`，禁止外部 URL 和协议相对路径。
- 不新增表、字段、RPC、依赖或用户身份模型；训练数据继续按现有 `auth.uid()` 归属。
- 不保留旧邮件链接登录兼容；删除 `/auth/callback` 页面和 magic-link 解析模块。
- Supabase 登录邮件模板必须包含 `{{ .Token }}`；真实邮箱端到端验证是发布前手工门禁。

---

### Task 1: 提取安全登录跳转并删除旧链接模块

**Files:**
- Create: `src/lib/supabase/auth-redirect.ts`
- Create: `src/lib/supabase/auth-redirect.test.ts`
- Modify: `src/components/auth/local-qa-login.tsx`
- Delete: `src/lib/supabase/magic-link.ts`
- Delete: `src/lib/supabase/magic-link.test.ts`
- Delete: `src/components/auth/auth-callback-handler.tsx`
- Delete: `src/app/auth/callback/page.tsx`

**Interfaces:**

```ts
export function getLoginNext(searchParams: URLSearchParams): string;
```

- [ ] **Step 1: Write the failing redirect tests**

```ts
import { describe, expect, it } from "vitest";
import { getLoginNext } from "./auth-redirect";

describe("getLoginNext", () => {
  it("defaults to the dashboard", () => expect(getLoginNext(new URLSearchParams())).toBe("/"));
  it("keeps a safe internal path", () => expect(getLoginNext(new URLSearchParams("next=%2Fhistory"))).toBe("/history"));
  it("rejects external and protocol-relative paths", () => {
    expect(getLoginNext(new URLSearchParams("next=https%3A%2F%2Fevil.example"))).toBe("/");
    expect(getLoginNext(new URLSearchParams("next=%2F%2Fevil.example"))).toBe("/");
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `pnpm vitest run src/lib/supabase/auth-redirect.test.ts`

Expected: FAIL because `auth-redirect.ts` does not exist.

- [ ] **Step 3: Implement the redirect helper and migrate local QA login**

Move only the safe internal-path behavior into `auth-redirect.ts`; do not copy any pasted-URL parsing. Update `local-qa-login.tsx` to import `getLoginNext` from the new module.

- [ ] **Step 4: Delete obsolete callback and magic-link files**

Delete the callback page/handler and `magic-link.ts` plus its test. Run `rg -n 'magic-link|AuthCallbackHandler|/auth/callback|completeMagicLinkSignIn|getSafeNextFromMagicLink|getSupabaseVerifyLinkFromPastedUrl' src scripts` and require no matches.

- [ ] **Step 5: Run focused regression tests**

Run: `pnpm vitest run src/lib/supabase/auth-redirect.test.ts src/components/auth/local-qa-login.test.tsx`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/supabase/auth-redirect.ts src/lib/supabase/auth-redirect.test.ts src/components/auth/local-qa-login.tsx
git rm src/lib/supabase/magic-link.ts src/lib/supabase/magic-link.test.ts src/components/auth/auth-callback-handler.tsx src/app/auth/callback/page.tsx
git commit -m "refactor: remove magic link callback flow"
```

### Task 2: Implement the two-stage email OTP form

**Files:**
- Modify: `src/components/auth/email-login-form.tsx`
- Create: `src/components/auth/email-login-form.test.tsx`

**Interfaces:**

```ts
type LoginStage = "email" | "code";
type Status = "idle" | "loading" | "sent" | "error";
```

- [ ] **Step 1: Write failing component tests**

Cover these exact behaviors with a mocked browser Supabase client:

```tsx
it("sends an email OTP and reveals the code step", async () => {
  const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
  render(<EmailLoginForm />, { supabase: { auth: { signInWithOtp, verifyOtp: vi.fn() } } });
  await user.type(screen.getByLabelText("邮箱"), "athlete@example.com");
  await user.click(screen.getByRole("button", { name: "获取验证码" }));
  expect(signInWithOtp).toHaveBeenCalledWith({ email: "athlete@example.com" });
  expect(screen.getByLabelText("验证码")).toBeInTheDocument();
});

it("verifies a six-digit code and rejects invalid length", async () => {
  const verifyOtp = vi.fn().mockResolvedValue({ data: { session: {} }, error: null });
  render(<EmailLoginForm />, { supabase: { auth: { signInWithOtp: vi.fn().mockResolvedValue({ error: null }), verifyOtp } } });
  // submit an email, enter 123456, then assert the exact verifyOtp payload and redirect.
  expect(verifyOtp).toHaveBeenCalledWith({ email: "athlete@example.com", token: "123456", type: "email" });
});

it("does not render the removed pasted-link UI", () => {
  render(<EmailLoginForm />);
  expect(screen.queryByText("粘贴邮件链接登录")).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/Confirm email address/i)).not.toBeInTheDocument();
});
```

The test harness may inject the browser client through the existing module mock; if the current component cannot accept a client directly, mock `createBrowserSupabaseClient` at the module boundary without testing mock behavior itself.

- [ ] **Step 2: Run the component test and verify it fails for the old link UI**

Run: `pnpm vitest run src/components/auth/email-login-form.test.tsx`

Expected: FAIL because the current component exposes the magic-link form and has no code verification step.

- [ ] **Step 3: Implement the email stage**

Normalize the email with `trim()`, call `signInWithOtp({ email })` without `emailRedirectTo`, set the saved email and switch to `code` only when there is no error. Set `sent` status and a 60-second cooldown timestamp. Map rate-limit, invalid-email and generic network errors to concise Chinese messages.

- [ ] **Step 4: Implement the code stage**

Render a 6-digit numeric input with `inputMode="numeric"`, `maxLength={6}`, `autoComplete="one-time-code"`, and a verify button. Strip non-digits on input. Disable verification unless exactly six digits are present. On success call `window.location.href = getLoginNext(new URLSearchParams(window.location.search))`; on failure keep the code stage and show an error. Add “修改邮箱” to return to the email stage and clear the code.

- [ ] **Step 5: Implement resend and timeout behavior**

Use a client-side one-second interval while the cooldown is positive; display the remaining seconds and enable resend only at zero. A resend must call the same `signInWithOtp` with the saved email and restart the cooldown only on success. Do not expose any pasted-link fallback in rate-limit copy.

- [ ] **Step 6: Run focused component tests**

Run: `pnpm vitest run src/components/auth/email-login-form.test.tsx src/lib/supabase/auth-redirect.test.ts src/components/auth/local-qa-login.test.tsx`

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add src/components/auth/email-login-form.tsx src/components/auth/email-login-form.test.tsx
git commit -m "feat: add email otp login form"
```

### Task 3: Update documentation, route contracts, and release checks

**Files:**
- Modify: `docs/09_development_setup.md`
- Modify: `docs/11_mvp_release_checklist.md`
- Modify: `docs/13_vercel_deployment_handoff.md`
- Modify: `scripts/smoke-check.mjs`
- Inspect: `src/app/login/page.tsx` to confirm it has no independent link copy
- Inspect: existing smoke and route tests for `/auth/callback` assertions

- [ ] **Step 1: Write failing documentation/route contract assertions**

Add a small contract test under `scripts/email-otp-login-contract.test.mjs` that reads the three docs and `email-login-form.tsx` and asserts:

```js
expect(form).toContain('verifyOtp');
expect(form).toContain('type: "email"');
expect(form).not.toContain("粘贴邮件链接登录");
expect(docs).not.toContain("Gmail 复制跳转链接");
expect(docs).toContain("{{ .Token }}");
```

Run: `pnpm vitest run scripts/email-otp-login-contract.test.mjs`

Expected: FAIL before the docs and form are updated.

- [ ] **Step 2: Update user-facing setup and release documentation**

Replace callback URL setup and pasted-link acceptance with: Supabase email template contains `{{ .Token }}`, email OTP is enabled, rate limits are configured, and a real QA email completes send/verify once. Remove old callback URLs from the login setup instructions because the route is deleted.

- [ ] **Step 3: Keep unauthenticated route smoke aligned**

Search the smoke and route tests for `/auth/callback`; the search must return no active route assertion after Task 1 deletes the page. Do not add authenticated OTP credentials to default `pnpm smoke` or `pnpm release:check`. Keep `/login` in the 14-route smoke.

- [ ] **Step 4: Run contract and complete local checks**

Run:

```powershell
pnpm vitest run scripts/email-otp-login-contract.test.mjs
pnpm test
pnpm release:check
```

Expected: contract passes, full tests pass, and release check passes.

- [ ] **Step 5: Commit**

```powershell
git add docs/09_development_setup.md docs/11_mvp_release_checklist.md docs/13_vercel_deployment_handoff.md scripts/smoke-check.mjs scripts/email-otp-login-contract.test.mjs
git commit -m "docs: document email otp authentication"
```

### Task 4: Supabase template gate and final verification

**Files:**
- No database migration files.
- Verify Supabase Dashboard Authentication Email Templates manually.

- [ ] **Step 1: Confirm the email template configuration**

In Supabase Dashboard, ensure the sign-in email template renders a six-digit code using `{{ .Token }}`. Do not leave the template link-only. Confirm the project’s email rate limit is at least 60 seconds between OTP sends.

- [ ] **Step 2: Run the real email OTP smoke**

Using a QA mailbox, open `/login`, submit the mailbox, enter the received six-digit code, and verify that the browser reaches `/` or the requested safe `next` path. Repeat an invalid code once and confirm the form remains on the code stage with an error. Do not record the email address or code in source control or responses.

- [ ] **Step 3: Run release verification**

Run:

```powershell
pnpm test
pnpm release:check
$env:BASE_URL='https://strength-periodization-manager.vercel.app'
$env:SMOKE_TRANSPORT='powershell'
pnpm smoke
```

Expected: all automated tests and 14 production routes pass; the real OTP smoke is recorded separately as manual evidence.
