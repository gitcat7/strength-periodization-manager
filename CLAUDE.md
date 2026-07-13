# 力训周期管家：Claude Code 项目规则

## 开始任何任务之前

1. 确认当前目录是任务专用 Git Worktree，不是主目录。
2. 运行 `git status --short --branch`。
3. 当前分支必须以 `claude/` 开头。
4. 完整阅读用户指定的 `docs/agent-collaboration/tasks/*.md` 委派文件。
5. 只读取任务所需的产品文档和代码；先给出简短计划，再实施。
6. 如果工作区存在未知改动、分支不符或委派文件有歧义，立即停止并报告，不要猜测或覆盖改动。

## 产品定位

“力训周期管家”是面向力量训练新手到初级训练者的移动优先 Web/PWA。技术栈是 Next.js 14 App Router、React、TypeScript、Tailwind、Supabase 和 Vercel。

必须保持以下产品约束：

- 重量单位仅使用 kg。
- 训练采用 push/pull/squat A-B 周期结构；A 偏强度，B 偏容量。
- 一天只有一个清晰训练方向，不混合无关的深蹲、卧推、划船、硬拉重项。
- 建议必须依据已完成组、实际重量、次数和 RPE。
- 面向新手的建议保持保守；一般训练建议不能冒充医疗意见。
- 移动 Web/PWA 是首要界面，按钮文字、触控区域和安全区必须适配窄屏。
- 不扩大到社交、营养、市场、原生 App 等未获批准的范围。

需要领域背景时阅读：

- `docs/03_PRD.md`
- `docs/10_training_methodology.md`
- `docs/11_mvp_release_checklist.md`
- 当前任务指定的设计和实施计划

## 代码边界

- 严格遵守委派文件中的允许修改文件和禁止事项。
- 不做与任务无关的重构、依赖升级或格式化。
- 保留现有 Supabase 用户隔离和 RLS 语义。
- 不接受客户端传入的 `user_id`；用户身份只能来自已验证会话或 Agent Token。
- 数据库 RPC 必须显式验证 `auth.uid()` 所有权。
- 训练历史、已完成组、PR 目标和现有 exercise UUID 不能被破坏。
- 新增 UI 控件优先使用现有组件模式和 lucide 图标。

## 开发流程

所有功能和修复遵循 TDD：

1. 先写能证明目标行为的失败测试。
2. 运行测试并记录预期失败原因。
3. 实现使测试通过的最小代码。
4. 重新运行局部测试。
5. 运行委派文件要求的回归、类型检查和构建。
6. 检查最终 diff，确认没有超范围改动。

不要跳过失败测试阶段，不要通过删除断言、放宽类型或跳过测试来制造通过。

## 常用命令

如果终端找不到 Node 或 pnpm，先执行：

```powershell
$env:PATH = 'C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback;C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin;' + $env:PATH
```

然后使用：

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm release:check
```

局部测试优先使用委派文件给出的 `pnpm vitest run ...` 命令。只有 Codex 负责最终集成分支上的完整 `release:check` 和发布验收。

## Git 与权限

- 只能在 `claude/*` 分支提交。
- 不修改、合并或重置 `main`。
- 不执行 `git push`、不创建 PR、不部署 Vercel。
- 不执行生产 Supabase 迁移或写入真实用户数据。
- 不使用 `git reset --hard`、`git checkout --` 或其他会丢失改动的命令。
- 不使用 `--dangerously-skip-permissions`。
- 提交前运行 `git diff --check` 和任务要求的验证。

## 密钥与隐私

绝不读取、打印、复制、截图或提交：

- `.env*` 中的值
- Supabase URL 对应的密钥
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 的实际值
- service-role key
- `STRENGTH_MANAGER_TOKEN`
- Anthropic API Key
- 登录链接、用户邮箱或完整用户 UUID

可以检查环境变量是否存在，但不能输出其值。

## 完成交付

完成任务后：

1. 使用委派文件指定的提交信息提交。
2. 不推送。
3. 按 `docs/agent-collaboration/cc-handoff-template.md` 输出：提交哈希、变更文件、测试命令与结果、关键实现说明、风险和未完成项。
4. 如果测试未通过或任务未完成，明确报告实际状态，不得声称完成。
