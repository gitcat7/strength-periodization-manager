# Codex 与 CC 协作落地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为“力训周期管家”建立可复用的 Codex/CC 分工规范、隔离 Worktree 和首个可直接执行的 CC 实现任务。

**Architecture:** 根目录 `CLAUDE.md` 是 CC 的项目约束入口，`docs/agent-collaboration/` 保存用户操作指南、通用模板和逐任务委派文件。CC 从已通过 Codex 阶段性验证的功能分支创建独立 `claude/*` Worktree，只提交其负责的单个任务；Codex 审查提交后再集成回功能分支。

**Tech Stack:** Git Worktree、Claude Code 2.1.206、PowerShell、Next.js 14、TypeScript、pnpm 11、Vitest、Supabase。

## Global Constraints

- 主目录固定为 `C:\Users\yaokui\Documents\力量训练周期管理`。
- 用户所说的“CC”固定表示 Claude Code。
- CC 不直接修改 `main`、不推送 GitHub、不部署 Vercel、不执行生产 Supabase 迁移。
- CC 只能在 `claude/*` 分支和独立 Worktree 中修改任务范围内的文件。
- 移动 Web/PWA 是首要产品界面；重量单位仅使用 kg。
- 保持 push/pull/squat A-B 周期结构，一天只有一个清晰训练方向。
- 所有代码行为变更遵循 TDD，并运行任务要求的局部测试。
- Codex 负责最终审查、`release:check`、集成以及经用户授权后的发布。
- 不读取、打印、复制或提交 Supabase 密钥、Agent Token、Anthropic API Key。

---

### Task 1: 建立 CC 项目约束入口

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: `docs/03_PRD.md`、`docs/10_training_methodology.md`、项目脚本与 Git 状态。
- Produces: CC 每次从项目 Worktree 启动时必须遵守的统一约束。

- [ ] **Step 1: 创建根目录规则文件**

文件必须覆盖：项目定位、关键目录、训练领域约束、TDD、验证命令、Git 分支规则、交付格式、密钥与生产权限边界。明确要求 CC 开始任务前读取委派文件、运行 `git status --short --branch`，并且发现未知改动时停止。

- [ ] **Step 2: 验证约束内容完整**

Run:

```powershell
rg -n "claude/|release:check|Supabase|push/pull/squat|kg|提交哈希|未知" CLAUDE.md
git diff --check -- CLAUDE.md
```
Expected: 每个关键约束至少命中一次，`git diff --check` 退出码为 0。

### Task 2: 建立用户指南和可复用模板

**Files:**
- Create: `docs/15_codex_cc_collaboration.md`
- Create: `docs/agent-collaboration/cc-task-template.md`
- Create: `docs/agent-collaboration/cc-handoff-template.md`
- Create: `docs/agent-collaboration/cc-review-template.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 根目录 `CLAUDE.md`。
- Produces: 用户启动 CC、发送任务、回传结果和执行复审的固定流程。

- [ ] **Step 1: 编写用户操作指南**

指南必须给出以下真实路径和命令：

```powershell
Set-Location 'C:\Users\yaokui\Documents\力量训练周期管理\.worktrees\claude-exercise-catalog-today'
git status --short --branch
claude
```

并说明用户只需让 CC 读取具体委派文件，完成后把提交哈希和交付摘要发回 Codex。

- [ ] **Step 2: 编写三类模板**

任务模板包含背景、范围、禁止事项、允许文件、验收标准、验证命令、提交要求。交付模板包含提交哈希、文件列表、测试结果、风险与未完成项。审查模板要求只读审查并按 P0–P3 输出文件和行号，不允许直接修改。

- [ ] **Step 3: 在 README 增加入口**

在文档目录增加：

```markdown
- [Codex 与 CC 协作指南](docs/15_codex_cc_collaboration.md)
```

- [ ] **Step 4: 验证文档链接和内容**

Run:

```powershell
$files = @(
  'docs/15_codex_cc_collaboration.md',
  'docs/agent-collaboration/cc-task-template.md',
  'docs/agent-collaboration/cc-handoff-template.md',
  'docs/agent-collaboration/cc-review-template.md'
)
$files | ForEach-Object { if (-not (Test-Path $_)) { throw "Missing $_" } }
rg -n "Codex 与 CC 协作指南" README.md
git diff --check
```

Expected: 四个文件存在、README 命中链接、diff 检查退出码为 0。

### Task 3: 创建首个 CC 委派文件

**Files:**
- Create: `docs/agent-collaboration/tasks/2026-07-13-exercise-catalog-today.md`

**Interfaces:**
- Consumes: `docs/superpowers/plans/2026-07-11-exercise-catalog-integration.md` Task 6，以及 `codex/exercise-catalog-integration` 已完成的 Tasks 1–5。
- Produces: CC 对 Today 动作说明和受控替换功能的唯一执行范围。

- [ ] **Step 1: 固定任务边界**

允许修改：

```text
src/components/today/today-workout.tsx
src/components/today/exercise-substitution-dialog.tsx
src/components/today/exercise-substitution-dialog-state.ts
src/components/today/exercise-substitution-dialog-state.test.ts
src/lib/analytics.ts
src/lib/client-cache.ts
src/lib/client-cache.test.ts
```

任务禁止修改数据库迁移、动作库生成脚本、Agent API、历史/进度/PR 模块、部署配置和已有 Tasks 1–5 提交。

- [ ] **Step 2: 固定 TDD 与验收**

委派文件要求先新增失败测试，再实现最小代码。必须覆盖草稿定向清理、候选动作兼容性、默认作用域、取消/重复提交/错误保持、说明懒加载、替换资格、RPC 参数、成功后的缓存清理与重新加载。

- [ ] **Step 3: 固定验证和交付格式**

CC 必须运行：

```powershell
pnpm vitest run src/domain/exercise-substitution.test.ts src/lib/client-cache.test.ts src/components/today/exercise-substitution-dialog-state.test.ts
pnpm test
pnpm typecheck
pnpm build
```

完成后提交为 `feat: add workout guidance and accessory replacement`，不得推送，并按交付模板报告。

### Task 4: 提交协作基础文件并同步功能分支

**Files:**
- Git commit only; no additional source files.

**Interfaces:**
- Produces: `main` 上可追踪的协作规则，以及包含这些规则的动作库功能分支。

- [ ] **Step 1: 检查并提交协作文件**

```powershell
git status --short --branch
git add CLAUDE.md README.md docs/15_codex_cc_collaboration.md docs/agent-collaboration docs/superpowers/plans/2026-07-13-codex-cc-collaboration-setup.md
git diff --cached --check
git commit -m "docs: add Codex CC collaboration workflow"
```

Expected: 只提交本计划列出的协作文件。

- [ ] **Step 2: 把 main 合并到现有动作库分支**

在 `C:\Users\yaokui\Documents\strength-periodization-worktrees\exercise-catalog-integration` 执行：

```powershell
git status --short --branch
git merge main
```

Expected: 分支保持 `codex/exercise-catalog-integration`，无冲突，并获得 `CLAUDE.md` 与委派文件。

### Task 5: 创建 CC 隔离 Worktree

**Files:**
- Create worktree directory: `.worktrees/claude-exercise-catalog-today`
- Create branch: `claude/exercise-catalog-today`

**Interfaces:**
- Consumes: `codex/exercise-catalog-integration` 最新提交。
- Produces: CC 独占的任务目录与分支。

- [ ] **Step 1: 验证 Worktree 目录被忽略**

```powershell
git check-ignore .worktrees
```

Expected: 输出 `.worktrees` 或其匹配路径，退出码为 0。

- [ ] **Step 2: 创建分支和 Worktree**

```powershell
git worktree add '.worktrees/claude-exercise-catalog-today' -b 'claude/exercise-catalog-today' 'codex/exercise-catalog-integration'
```

Expected: 新目录存在，`git worktree list` 显示新分支。

- [ ] **Step 3: 安装依赖**

在新 Worktree 执行：

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
& 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' install --frozen-lockfile
```

Expected: 安装退出码为 0，锁文件无变化。

### Task 6: 验证 CC 基线并交付启动命令

**Files:**
- No file changes expected.

**Interfaces:**
- Produces: 可安全开始 Task 6 实现的已验证基线。

- [ ] **Step 1: 运行状态与局部基线**

```powershell
git status --short --branch
pnpm vitest run src/domain/exercise-substitution.test.ts src/lib/exercise-catalog-client.test.ts
pnpm typecheck
```

Expected: 分支为 `claude/exercise-catalog-today`，工作区干净，测试和类型检查退出码均为 0。

- [ ] **Step 2: 给用户唯一启动指令**

```powershell
Set-Location 'C:\Users\yaokui\Documents\力量训练周期管理\.worktrees\claude-exercise-catalog-today'
claude
```

进入 CC 后发送：

```text
请先完整阅读根目录 CLAUDE.md 和 docs/agent-collaboration/tasks/2026-07-13-exercise-catalog-today.md，然后严格按委派文件执行。先检查当前分支和工作区，再按 TDD 实现。不要扩大范围、不要推送、不要部署。完成后提交，并按 docs/agent-collaboration/cc-handoff-template.md 返回交付摘要。
```
