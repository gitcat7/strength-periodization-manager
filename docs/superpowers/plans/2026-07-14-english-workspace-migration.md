# English Workspace Path Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本地仓库根目录迁移到全英文路径，修复 Git Worktree 元数据并消除 Vitest/Vite 对中文文件 URL 的解析失败。

**Architecture:** 主仓库从 `C:\Users\yaokui\Documents\力量训练周期管理` 原地重命名为 `C:\Users\yaokui\Documents\strength-periodization-manager`。外部 Codex Worktree 保持原路径，嵌套 CC Worktree 随主仓库移动；迁移后使用 `git worktree repair` 修复两个 linked worktree 的双向管理路径。

**Tech Stack:** PowerShell、Git Worktree、pnpm、Vitest、Next.js 14。

## Global Constraints

- 产品显示名称继续使用“力训周期管家”。
- GitHub 仓库名和远端地址不变。
- 不丢弃 `claude/exercise-catalog-today` 的提交 `273246c`。
- 迁移前所有 Worktree 必须干净，CC CLI 必须退出。
- 不推送、不部署、不执行数据库迁移。
- 文件移动使用 PowerShell `Move-Item -LiteralPath`，目标路径必须预先确认不存在。

---

### Task 1: 更新仓库内绝对路径

**Files:**
- Modify: `docs/13_vercel_deployment_handoff.md`
- Modify: `docs/15_codex_cc_collaboration.md`
- Modify: `docs/agent-collaboration/tasks/2026-07-13-exercise-catalog-today.md`
- Modify: `docs/superpowers/specs/2026-07-12-codex-claude-code-collaboration-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-codex-cc-collaboration-setup.md`

- [ ] **Step 1: 将旧根路径替换为英文根路径**

所有当前操作命令使用：

```text
C:\Users\yaokui\Documents\strength-periodization-manager
```

- [ ] **Step 2: 验证仓库不再包含旧绝对路径**

```powershell
rg -n -F 'C:\Users\yaokui\Documents\力量训练周期管理' . --hidden -g '!node_modules/**' -g '!.git/**' -g '!.next/**' -g '!docs/superpowers/plans/2026-07-14-english-workspace-migration.md'
git diff --check
```

Expected: `rg` 无匹配，`git diff --check` 退出码为 0。

### Task 2: 重命名根目录并修复 Worktree

**Files:**
- Move: `C:\Users\yaokui\Documents\力量训练周期管理`
- To: `C:\Users\yaokui\Documents\strength-periodization-manager`

- [ ] **Step 1: 从父目录执行原地重命名**

```powershell
Move-Item -LiteralPath 'C:\Users\yaokui\Documents\力量训练周期管理' -Destination 'C:\Users\yaokui\Documents\strength-periodization-manager'
```

- [ ] **Step 2: 修复 linked worktree 元数据**

```powershell
git worktree repair `
  'C:\Users\yaokui\Documents\strength-periodization-worktrees\exercise-catalog-integration' `
  'C:\Users\yaokui\Documents\strength-periodization-manager\.worktrees\claude-exercise-catalog-today'
git worktree list --porcelain
```

Expected: 三个 Worktree 都指向有效英文 common Git 目录，分支分别为 `main`、`codex/exercise-catalog-integration` 和 `claude/exercise-catalog-today`。

### Task 3: 更新本地项目技能

**Files:**
- Modify: `C:\Users\yaokui\.codex\skills\strength-periodization-manager\SKILL.md`
- Modify: `C:\Users\yaokui\.codex\skills\strength-periodization-manager\references\project-guide.md`
- Modify: `C:\Users\yaokui\.codex\skills\strength-periodization-manager\scripts\project-health.ps1`

- [ ] **Step 1: 将技能默认 Workspace 更新为英文路径**

技能描述、默认工作目录、项目快照和健康检查默认参数统一使用：

```text
C:\Users\yaokui\Documents\strength-periodization-manager
```

- [ ] **Step 2: 运行健康检查**

```powershell
& 'C:\Users\yaokui\.codex\skills\strength-periodization-manager\scripts\project-health.ps1'
```

Expected: 项目路径为英文，必需文件和脚本检查通过。

### Task 4: 验证迁移后的 CC 分支

**Files:**
- No source edits expected.

- [ ] **Step 1: 验证 Git 状态和提交**

```powershell
git status --short --branch
git rev-parse HEAD
```

Expected: 分支为 `claude/exercise-catalog-today`，工作区干净，HEAD 为 `273246c2c22678491c617ca2d0553ba800a59b7c`。

- [ ] **Step 2: 重跑完整测试、类型检查和构建**

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: 中文路径导致的 `service-worker-contract.test.mjs` 失败消失；全部命令退出码为 0。
