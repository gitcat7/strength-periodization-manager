# Codex 与 Claude Code 双代理协作设计

## 目标

在“力训周期管家”项目中建立稳定的双代理研发流程：Codex 负责需求澄清、架构、任务拆分、集成与最终验收；Claude Code 负责边界明确的独立实现和交叉审查。两个代理不得同时在同一工作目录中修改代码。

## 工具准备

必需工具：

- Git for Windows
- Node.js 20 或项目已配置的 Node.js 运行时
- pnpm
- Codex 桌面应用
- Claude Code
- Anthropic 账号、Claude Pro/Max 订阅或可用的 Anthropic API 计费账号

当前电脑已安装 Claude Code 2.1.206。IDEA、WebStorm 和 VS Code 均为可选工具，不影响双代理流程。若需要人工查看 TypeScript 类型、Git diff 或目录结构，可安装其中任意一个；本项目为 Next.js/TypeScript，优先推荐 VS Code 或 WebStorm。无需同时安装多个 IDE。

## 职责边界

### Codex

- 读取产品文档并澄清需求。
- 设计功能边界和验收标准。
- 决定任务是否适合交给 Claude Code。
- 创建或指导创建 Claude 专用 Worktree 和分支。
- 审查 Claude 的提交、处理跨模块集成问题。
- 运行完整 `release:check`。
- 仅在用户明确授权后推送、部署或操作生产数据库。

### Claude Code

- 只处理任务说明中列出的范围。
- 在 `claude/*` 分支和独立 Worktree 中工作。
- 开始前读取根目录 `CLAUDE.md` 以及任务指定的项目文档。
- 先检查状态和相关测试，再修改代码。
- 不直接修改或合并 `main`，不部署生产环境，不输出密钥。
- 完成后提交代码，并报告提交哈希、变更文件、验证命令、验证结果和遗留风险。

### 用户

- 确认产品方向、范围和高影响取舍。
- 将 Codex 生成的任务委派文本粘贴到 Claude Code。
- 将 Claude Code 的交付摘要和提交哈希发回 Codex。
- 对推送、合并、数据库迁移和生产部署给予明确授权。

## 仓库与 Worktree 结构

主工作目录保持不变：

```text
C:\Users\yaokui\Documents\力量训练周期管理
```

Claude Code 使用独立的相邻目录，例如：

```text
C:\Users\yaokui\Documents\力量训练周期管理-claude-exercise-catalog
```

每项 Claude 任务使用独立分支：

```text
claude/exercise-catalog
```

创建 Worktree 前，主仓库必须没有未处理的工作区冲突，并以用户认可的本地基线提交为起点。当前 `main` 比 `origin/main` 领先 3 个提交，因此首次创建 Worktree 应以本地 `main` 为基线，不能直接假设 `origin/main` 是最新代码。

## 标准工作流

1. 用户向 Codex 提出功能或问题。
2. Codex 澄清需求，给出设计和验收标准。
3. Codex 判断任务边界，生成一份 Claude Code 委派文本。
4. 用户在 Claude 专用 Worktree 中启动 Claude Code并粘贴委派文本。
5. Claude Code 实现、运行局部验证并提交到 `claude/*` 分支。
6. 用户把 Claude 的交付摘要和提交哈希发回 Codex。
7. Codex 审查提交；如需修改，生成精确的复审指令。
8. 审查通过后，Codex 将提交集成到主线并运行完整发布检查。
9. 只有用户明确授权后，才推送 GitHub 或部署 Vercel。

## Claude Code 操作方式

### 首次检查

在 PowerShell 中执行：

```powershell
claude --version
claude doctor
```

若尚未登录，在项目目录运行 `claude`，根据界面选择 Claude 订阅或 Anthropic Console 账号完成认证。

### 进入任务 Worktree

```powershell
Set-Location 'C:\Users\yaokui\Documents\力量训练周期管理-claude-exercise-catalog'
git status --short --branch
claude
```

进入 Claude Code 后，先粘贴由 Codex 生成的完整任务委派文本。不要只输入“继续开发项目”之类的宽泛指令。

### 推荐的 Claude 开场指令

```text
先阅读根目录 CLAUDE.md 和本任务指定的文档。检查 git status、相关代码和测试。
只修改任务范围内的文件；先给出简短计划，再实施并验证。
不要修改 main、不要推送、不要部署、不要接触或输出密钥。
完成后提交到当前 claude/* 分支，并报告提交哈希、变更文件、验证结果和遗留风险。
```

### 中断与继续

在同一 Worktree 中继续最近会话：

```powershell
claude --continue
```

如果 Claude 请求超出任务范围的权限，先停止操作并把问题发回 Codex。不得使用 `--dangerously-skip-permissions` 作为日常启动方式。

## 委派任务格式

每个任务必须包含：

- 背景与用户价值
- 明确范围
- 不在范围内的内容
- 允许修改的主要文件或模块
- 产品和训练领域约束
- 验收标准
- 必须运行的验证命令
- Git 提交与交付格式

任务应尽量做到一次只解决一个可独立验证的问题。同一文件在同一时间只分配给一个代理。

## 交叉审查

Claude 可承担两类审查：

1. 实现后自查：检查其自身 diff、边界条件、类型和测试。
2. 独立复审：只读检查 Codex 的设计或提交，输出按严重级别排序的问题，不直接修改代码，除非后续明确授权。

Codex 对 Claude 的提交进行最终审查，重点检查：

- 是否满足验收标准。
- 是否违反 push/pull/squat A-B、kg-only 和新手保守建议等产品约束。
- 是否引入用户隔离、Supabase、缓存或 PWA 风险。
- 是否存在超范围修改。
- 局部测试是否足够，以及完整发布检查是否通过。

## 验证与发布

Claude Code 至少运行任务相关的局部检查。最终集成由 Codex 运行：

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
& 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' release:check
```

生产部署、Supabase 迁移和 GitHub 推送不属于 Claude 默认权限。相关操作必须经过用户明确确认，并由 Codex 统一执行和验证。

## 异常处理

- Worktree 有未知未提交改动：停止并确认改动归属。
- 两个任务需要修改同一文件：改为串行执行或重新切分边界。
- Claude 的实现超出范围：不集成超范围提交，要求拆分或重做。
- 测试失败：保留失败输出，先定位根因，不用跳过测试掩盖问题。
- Claude 与 Codex 结论冲突：以代码、测试、项目文档和明确验收标准为依据，由 Codex整理证据并让用户决定产品取舍。
- 推送或部署失败：保留本地提交和日志，不重复执行高风险操作。

## 首次落地内容

设计获用户复核后，首次实施包括：

1. 创建根目录 `CLAUDE.md`，记录项目约束、命令和安全边界。
2. 创建可复用的委派任务与交付摘要模板。
3. 创建第一个 Claude Worktree，并验证 Claude 能读取项目。
4. 选择一个小型、低耦合任务完成首次演练。
5. 由 Codex 审查首次提交并运行发布检查，以验证完整闭环。
