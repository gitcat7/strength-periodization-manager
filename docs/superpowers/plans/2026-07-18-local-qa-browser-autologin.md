# 本地 QA 浏览器自动登录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 localhost 开发服务器中为内置浏览器建立一个普通 QA 用户的真实 Supabase 会话，不改变生产认证或 RLS。

**Architecture:** 服务端 API 只在 development、localhost 和两个私有 QA 环境变量都存在时才使用 Supabase anon key 发起密码登录。独立 `/qa-login` 页面接收 session，调用现有浏览器客户端 `setSession` 后跳到安全的站内路径；任何不满足开关的环境返回 404。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Supabase JS、Vitest。

## Global Constraints

- 不提交 QA 邮箱、密码、token、Supabase key 或 `.env.local`。
- QA 用户为普通用户，所有业务读取继续依赖 Supabase RLS。
- 入口只在 `NODE_ENV === "development"` 且 hostname 为 `localhost` 或 `127.0.0.1` 时启用。
- 生产、预览或环境变量缺失时 API 返回 404，且 UI 无自动登录入口。
- `next` 仅接受以单个 `/` 开头的内部路径。

---

### Task 1: 本地 QA 访问判定与 API

**Files:**
- Create: `src/lib/dev-qa-auth.ts`
- Create: `src/lib/dev-qa-auth.test.ts`
- Create: `src/app/api/dev/qa-session/route.ts`
- Create: `src/app/api/dev/qa-session/route.test.ts`

**Interfaces:**
- Produces `isLocalQaSessionEnabled(input): boolean`，输入为 nodeEnv、hostname、qaEmail、qaPassword。
- Produces `POST(request): Response`，关闭时 404，开启时仅以服务器环境变量创建 session。

- [x] **Step 1: Write the failing tests**

```ts
expect(isLocalQaSessionEnabled({ nodeEnv: "production", hostname: "localhost", qaEmail: "x", qaPassword: "y" })).toBe(false);
expect(isLocalQaSessionEnabled({ nodeEnv: "development", hostname: "localhost", qaEmail: "x", qaPassword: "y" })).toBe(true);
expect(await POST(new Request("http://localhost/api/dev/qa-session", { method: "POST" }))).toHaveProperty("status", 404);
```

- [x] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run src/lib/dev-qa-auth.test.ts src/app/api/dev/qa-session/route.test.ts`

Expected: FAIL because the helper and route do not exist.

- [x] **Step 3: Implement the smallest safe API**

```ts
if (!isLocalQaSessionEnabled(config)) return new Response(null, { status: 404 });
const { data, error } = await createClient(url, anonKey).auth.signInWithPassword({ email, password });
if (error || !data.session) return Response.json({ error: "本地 QA 登录不可用。" }, { status: 503 });
return Response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
```

- [x] **Step 4: Run tests to verify GREEN**

Run: `pnpm vitest run src/lib/dev-qa-auth.test.ts src/app/api/dev/qa-session/route.test.ts`

Expected: PASS; tests assert neither request body nor user_id influences the result.

- [x] **Step 5: Commit**

```powershell
git add src/lib/dev-qa-auth.ts src/lib/dev-qa-auth.test.ts src/app/api/dev/qa-session/route.ts src/app/api/dev/qa-session/route.test.ts
git commit -m "feat: add local QA session endpoint"
```

### Task 2: QA 登录页与会话写入

**Files:**
- Create: `src/components/auth/local-qa-login.tsx`
- Create: `src/components/auth/local-qa-login.test.tsx`
- Create: `src/app/qa-login/page.tsx`
- Create: `src/app/qa-login/page.test.tsx`

**Interfaces:**
- Consumes `POST /api/dev/qa-session` returning `{ access_token, refresh_token }`.
- Produces an automatic client-side login flow that calls `createBrowserSupabaseClient().auth.setSession` and redirects only to `getLoginNext` result.

- [x] **Step 1: Write the failing tests**

```tsx
render(<LocalQaLogin />);
await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" }));
expect(mockReplace).toHaveBeenCalledWith("/history");
```

- [x] **Step 2: Run test to verify RED**

Run: `pnpm vitest run src/components/auth/local-qa-login.test.tsx src/app/qa-login/page.test.tsx`

Expected: FAIL because the component and page do not exist.

- [x] **Step 3: Implement the minimal page**

```tsx
const response = await fetch("/api/dev/qa-session", { method: "POST" });
if (!response.ok) throw new Error("本地 QA 登录不可用，请检查本机开发配置。");
const { access_token, refresh_token } = await response.json();
await createBrowserSupabaseClient().auth.setSession({ access_token, refresh_token });
router.replace(getLoginNext(searchParams));
```

- [x] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run src/components/auth/local-qa-login.test.tsx src/app/qa-login/page.test.tsx`

Expected: PASS; API failure and external `next` paths show a generic error or fall back `/`.

- [x] **Step 5: Commit**

```powershell
git add src/components/auth/local-qa-login.tsx src/components/auth/local-qa-login.test.tsx src/app/qa-login/page.tsx src/app/qa-login/page.test.tsx
git commit -m "feat: add local QA browser login page"
```

### Task 3: 本地配置说明与验证

**Files:**
- Modify: `README.md`
- Modify: `docs/12_database_release_runbook.md`

**Interfaces:**
- Documents two unvalued local-only keys: `DEV_BROWSER_QA_EMAIL` and `DEV_BROWSER_QA_PASSWORD`.

- [x] **Step 1: Add safe setup guidance**

```md
在未提交的 `.env.local` 中设置 QA 账号变量，然后访问 `/qa-login?next=/history`。该入口仅 localhost 的 development 服务器可用，绝不配置到 Vercel。
```

- [x] **Step 2: Verify the documentation cannot be mistaken for production setup**

Run: `rg -n "DEV_BROWSER_QA_|仅本地开发|Vercel" README.md docs/12_database_release_runbook.md`

Expected: Both variable names appear only in setup guidance that explicitly states localhost/development-only use and excludes Vercel.

- [x] **Step 3: Run final verification**

Run: `pnpm test; pnpm lint; pnpm typecheck; pnpm build`

Expected: all commands exit 0.

- [x] **Step 4: Commit**

```powershell
git add README.md docs/12_database_release_runbook.md
git commit -m "docs: explain local QA browser setup"
```
