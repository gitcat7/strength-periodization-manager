# Vercel 上线交接清单

用途：把当前本地 MVP 发布到 Vercel 默认域名，并完成线上验收。

## 1. 当前本地状态

本地 MVP 已具备：

- 邮箱登录和登录回调。
- 训练画像。
- 推/拉/蹲 A/B 训练计划生成。
- 今日训练记录、草稿保存、完成训练。
- Fitness Coach 重量建议。
- 历史记录编辑。
- 进度页。
- 多个 PR 目标。
- CSV 导出。
- 问题反馈。
- 行为埋点。
- PWA manifest 和图标。
- 健康检查：`/api/health`。

本地验收命令：

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
pnpm typecheck
pnpm release:check
pnpm smoke
```

## 2. GitHub 仓库

如果命令行没有 Git，可以用 GitHub Desktop：

1. 打开 GitHub Desktop。
2. 选择 `File -> Add local repository`。
3. 选择项目目录：

```text
C:\Users\yaokui\Documents\strength-periodization-manager
```

4. 如果提示还不是 Git 仓库，选择创建仓库。
5. Repository name 建议：

```text
strength-periodization-manager
```

6. 确认 `.env.local` 不要提交。
7. Commit message 建议：

```text
MVP release candidate
```

8. 点击 `Publish repository` 发布到 GitHub。

## 3. Vercel 导入项目

1. 打开 Vercel Dashboard。
2. 点击 `Add New -> Project`。
3. Import 刚才的 GitHub 仓库。
4. Framework Preset 选择 `Next.js`。
5. Build Command 保持默认或填写：

```text
pnpm build
```

6. Install Command 保持默认或填写：

```text
pnpm install
```

7. 添加环境变量：

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` 只用于服务端 Agent API。必须配置为 Vercel Secret，绝不能使用 `NEXT_PUBLIC_` 前缀、写入客户端代码或提交到 Git。

8. 点击 Deploy。

## 4. Supabase Auth 线上回调

拿到 Vercel 默认域名后，到 Supabase Dashboard：

```text
Authentication -> URL Configuration
```

设置：

```text
Site URL: https://你的-vercel-默认域名
```

Redirect URLs 至少包含：

```text
http://127.0.0.1:3000/auth/callback
http://localhost:3000/auth/callback
https://你的-vercel-默认域名/auth/callback
```

如果 Supabase 页面支持通配符，也可以额外加入：

```text
https://你的-vercel-默认域名/**
```

## 5. 线上验收顺序

部署完成后先检查：

```text
https://你的-vercel-默认域名/api/health
```

应该返回：

```json
{"ok":true}
```

然后打开：

```text
https://你的-vercel-默认域名/diagnostics
```

登录后应看到：

- 环境变量通过。
- 登录状态通过。
- 数据库读取通过。
- 反馈表通过。
- 行为埋点表通过。

## 6. 线上完整冒烟

用一个测试邮箱从头跑：

1. 登录。
2. 创建或修改训练画像。
3. 生成 4 周计划。
4. 打开今日训练。
5. 按计划填入并保存记录。
6. 刷新页面，确认草稿或记录不丢。
7. 保存并完成训练。
8. 查看历史记录。
9. 修改一组历史记录并保存。
10. 查看进展页。
11. 到计划页应用或修改 Coach 建议。
12. 创建两个不同动作的 PR 目标。
13. 导出 CSV。
14. 提交反馈。
15. 退出登录。

## 7. 交给 Codex 的信息

部署成功后，把下面三项发给 Codex：

```text
Vercel 默认域名：
Supabase Auth 已添加线上回调：是/否
线上 /diagnostics 是否全绿：是/否
```

Codex 会继续做：

- 线上健康检查。
- 线上 smoke。
- 根据你截图修复线上问题。
- 最终判断是否达到 MVP 内测标准。
