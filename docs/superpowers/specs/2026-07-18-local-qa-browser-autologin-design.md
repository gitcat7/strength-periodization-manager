# 本地 QA 浏览器自动登录设计

## 目标

让 Codex 内置浏览器能在本机开发环境中使用一个专用 QA 账号完成真实 Supabase 会话登录，而无需人工打开邮箱或粘贴魔法链接。该能力不得在 Vercel、预览环境或生产环境可用。

## 边界与安全约束

- QA 账号不是产品管理员，也不拥有越过 RLS 的权限；它只是专门用于本地验收的普通 Supabase 用户。
- 仅当 `NODE_ENV === "development"`、请求主机是 `localhost` 或 `127.0.0.1`、且本机同时设置 `DEV_BROWSER_QA_EMAIL` 与 `DEV_BROWSER_QA_PASSWORD` 时可用。
- 凭据只存在于未提交的 `.env.local`。不在代码、测试、日志、URL、前端公开环境变量或文档中写入其值。
- 非上述条件的请求统一返回 404；生产构建不展示入口、按钮或提示。
- 服务端以 Supabase anon key 调用密码登录取得该 QA 用户的正常会话；浏览器再以既有 Supabase client 的 `setSession` 保存会话。因此后续所有数据请求仍受 Supabase RLS 约束。
- 只允许站内安全的 `next` 路径，默认跳转 `/`。

## 用户流程

1. 开发者在本机 `.env.local` 配置 QA 账号邮箱和密码。
2. 内置浏览器访问 `/qa-login?next=/history`。
3. 页面调用本项目的本地开发 API，取得正常 Supabase access/refresh session 并写入浏览器当前 profile。
4. 页面跳转到安全的 `next` 页面；之后该 Browser profile 可直接验证受登录保护的页面。
5. 环境变量缺失、账号无效或网络失败时，页面显示通用失败文案和返回登录页操作，不回显内部配置或凭据。

## 组件边界

- `src/lib/dev-qa-auth.ts`：纯函数，集中判定本地开发开关与安全跳转路径。
- `src/app/api/dev/qa-session/route.ts`：不接收账号、密码或 user_id；仅在满足开关时用服务端环境变量向 Supabase 创建 QA 会话。
- `src/app/qa-login/page.tsx` 与客户端组件：调用 API、使用既有浏览器 Supabase client 保存 session、跳转或显示通用错误。
- 既有邮件登录、生产认证、RLS、业务页面和数据库 schema 不修改。

## 验收

- 开关函数拒绝 production、非本地主机、缺少任一变量的情况。
- API 在关闭时返回 404，且不调用 Supabase。
- API 开启时不接受用户输入的账号或 user_id，并只返回 session 所需字段。
- `/qa-login` 成功后调用 `setSession` 并跳转安全内部路径；非法 `next` 回退 `/`。
- 失败不泄露账号、密码、Supabase key 或服务端错误详情。
- `pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；本地内置浏览器可从 `/qa-login?next=/history` 到达已登录历史页。
