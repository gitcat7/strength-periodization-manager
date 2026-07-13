# Codex 与 CC 协作指南

本项目中，“CC”固定表示 Claude Code。

## 固定分工

- Codex：需求澄清、架构、任务拆分、功能分支集成、代码审查、完整发布检查和经授权后的发布。
- CC：在独立 Worktree 中实现一个边界明确的任务，先测试后实现，提交后停止。
- 用户：把 Codex 给出的启动指令和委派指令发给 CC，再把 CC 的提交哈希与交付摘要发回 Codex。

CC 不直接修改 `main`，不推送、不部署、不操作生产数据库。

## 首次任务的启动方式

打开 PowerShell，执行：

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
Set-Location 'C:\Users\yaokui\Documents\力量训练周期管理\.worktrees\claude-exercise-catalog-today'
git status --short --branch
claude
```

预期分支：

```text
claude/exercise-catalog-today
```

如果显示 `main`、`codex/*` 或其他分支，立即退出，不要让 CC 修改文件。

## 发给 CC 的首条消息

```text
请先完整阅读根目录 CLAUDE.md 和 docs/agent-collaboration/tasks/2026-07-13-exercise-catalog-today.md，然后严格按委派文件执行。先检查当前分支和工作区，再按 TDD 实现。不要扩大范围、不要推送、不要部署。完成后提交，并按 docs/agent-collaboration/cc-handoff-template.md 返回交付摘要。
```

CC 给出计划后，可以让它继续。出现权限确认时，只批准任务范围内的读取、编辑、测试和本地 Git 提交；不要批准推送、部署、生产数据库或读取密钥。

## CC 完成后

把以下内容原样发回 Codex：

- CC 的交付摘要
- 提交哈希
- 测试结果
- CC 报告的风险或未完成项

Codex 会独立检查 diff 和测试，不会只凭 CC 的完成声明直接集成。

## 让 CC 修改审查问题

Codex 如果发现问题，会给出一段新的修正指令。回到同一个 Worktree：

```powershell
Set-Location 'C:\Users\yaokui\Documents\力量训练周期管理\.worktrees\claude-exercise-catalog-today'
claude --continue
```

粘贴修正指令，让 CC 在同一分支追加修复提交。不要自行 cherry-pick 或合并；集成由 Codex 完成。

## 成本控制

- 默认用 Sonnet 5 完成日常编码。
- 简单搜索和摘要可临时用 Haiku 4.5。
- 只有复杂架构、棘手调试或关键审查才切 Opus 4.8。
- 不相关任务开始前使用 `/clear`，避免旧上下文重复计费。
- 使用 `/usage` 查看本次会话 Token 和预估费用；真实余额以 Anthropic Console Billing 为准。

## 常见异常

- `pnpm` 找不到：重新执行本指南顶部的 `$env:PATH` 命令。
- Worktree 有未知改动：停止，截图或复制 `git status --short --branch` 给 Codex。
- 测试失败：把完整失败摘要交给 Codex，不跳过测试。
- CC 要修改任务范围外文件：拒绝并把原因发回 Codex重新拆分。
- CC 要求 API Key、Supabase 密钥或生产权限：拒绝。
