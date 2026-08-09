# 本地开发启动说明

版本：v0.1  
日期：2026-07-01

## 当前状态

项目骨架已初始化：

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Supabase JS SDK
- Lucide React icons
- 移动端优先首页原型

已验证：

- `pnpm install` 已完成。
- `pnpm typecheck` 已通过。
- `pnpm lint` 已通过。
- `pnpm build` 已通过。
- 本地开发服务器可访问：`http://127.0.0.1:3000`

## 本地运行方式

当前机器的系统 PATH 没有直接安装 Node/npm，但 Codex 工作区提供了内置 Node.js 和 pnpm。

可用启动脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
```

启动后访问：

```text
http://127.0.0.1:3000
```

## 环境变量

已创建：

```text
.env.example
```

已创建本地：

```text
.env.local
```

已填入 Supabase：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

请不要把 Supabase service role key 放进前端环境变量。

## 下一步

Supabase public env 已就绪。接下来进入：

- Supabase Auth 接入
- 数据库 schema 创建
- 用户画像表
- 训练计划表
- 今日训练数据流

## Supabase 数据库初始化

已准备 SQL 文件：

```text
supabase/schema.sql
```

你可以在 Supabase Dashboard 中进入：

```text
SQL Editor -> New query
```

复制 `supabase/schema.sql` 的全部内容执行。

该 SQL 会创建 MVP 核心表、插入基础动作，并开启 RLS。不要在前端环境变量中使用 service role key。

## Supabase Auth 邮箱验证码配置

邮箱登录使用当前页面输入 8 位验证码，不需要登录回调地址。请在 Supabase Dashboard 中检查：

```text
Authentication -> URL Configuration
```

开发期建议配置 Site URL：

```text
Site URL: http://127.0.0.1:3000
```

在 `Authentication -> Email Templates` 的登录邮件模板中保留验证码变量：

```text
你的登录验证码是：{{ .Token }}
```

不要只配置确认链接模板；验证码邮件必须实际显示 `{{ .Token }}`。同时确认 Auth 邮件限流允许至少 60 秒后再次发送。

## 配置验收方式

本地打开：

```text
http://127.0.0.1:3000/diagnostics
```

检查结果应该是：

- 环境变量：通过
- 登录状态：未登录时显示提示；邮箱登录后显示通过
- 数据库读取：登录后能读取基础动作表

如果数据库读取失败，请先确认 `supabase/schema.sql` 已在 SQL Editor 成功执行。

## 用户画像验收方式

本地打开：

```text
http://127.0.0.1:3000/onboarding
```

填写训练经验、每周训练天数、可训练日和四个主项最近工作组。保存成功后会跳转到：

```text
http://127.0.0.1:3000/today
```

如果保存失败，优先检查是否已登录，以及 `athlete_profiles`、`lift_profiles` 两张表是否已经通过 `supabase/schema.sql` 创建。

## 训练计划验收方式

本地打开：

```text
http://127.0.0.1:3000/plan
```

如果还没有 active program，点击：

```text
生成 4 周训练计划
```

当前默认使用“推/拉/蹲 + A强度/B容量”的编排格式，而不是复制某个用户的个人计划。

成功后页面会展示 4 周训练日列表。随后打开：

```text
http://127.0.0.1:3000/today
```

应该能看到最近一次待训练日，以及每个动作的目标组数、次数和重量。
