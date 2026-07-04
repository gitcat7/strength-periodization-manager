# 产品决策记录

版本：v0.1  
日期：2026-07-01

## 已确认决策

| 决策项 | 结论 |
|---|---|
| 临时产品名 | 力训周期管家 |
| 技术栈 | Next.js + TypeScript + Supabase + Vercel |
| 产品形态 | 移动端优先 Web/PWA |
| 单位 | MVP 只支持 kg |
| 训练模板 | 3 天全身线性进阶、4 天上下肢拆分都做 |
| 用户重点 | 新手到初级训练者 |
| 域名策略 | 先用 Vercel 默认域名，内测稳定后再购买自定义域名 |

## 当前阶段

已完成 MVP 启动的核心方向确认。下一步进入第 0 周准备：

- GitHub 账号：已准备。
- Vercel 账号：已准备。
- Supabase 账号：已准备。
- 创建代码仓库。
- 创建 Supabase 项目。
- 初始化 Next.js 项目。

## 本地项目初始化记录

- 已创建 Next.js + TypeScript 项目骨架。
- 已添加 `.env.example`，等待 Supabase 项目 URL 和 anon key。
- 本地 PATH 暂无 Node/npm，但 Codex 工作区提供了内置 Node.js 和 pnpm，可用于开发命令。
- 已完成依赖安装、类型检查、lint 和生产构建。
- 已启动本地开发服务器：`http://127.0.0.1:3000`。
- 已接收 Supabase Project URL 和 publishable/anon key，并写入本地 `.env.local`。
- 已添加最小邮箱登录页面：`/login`。
- 已准备 Supabase 初始化 SQL：`supabase/schema.sql`。
- 已完成 Supabase Auth 诊断页：`/diagnostics`。
- 已完成训练画像 onboarding：`/onboarding`。
- 已完成 4 周训练计划生成入口：`/plan`。
- 已完成今日训练读取入口：`/today`。
- 已将今日训练升级为训练执行记录页：可初始化每组记录、填写实际重量/次数/RPE、保存训练记录、标记训练完成。

## 2026-07-03 训练产品规则补充

- 计划展示不能替代训练记录；MVP 必须沉淀每组真实完成数据。
- 后续重量调整必须优先参考历史完成情况、RPE 和是否中断训练。
- 外部 `fitness-coach-rpg` skill 已安装到本机，但当前会话未自动暴露为可触发 skill；其有效原则已提炼为“数据驱动、长期连续性、中断恢复降强度”。

## 2026-07-04 Fitness Coach 整合

- 新增项目内 Coach 规则模块：`src/domain/fitness-coach.ts`。
- 今日训练页已接入训练前提示：读取上次完成训练，判断是否需要按中断恢复规则降强度。
- 完成训练后会根据每组完成情况和 RPE 生成下次重量建议，并写入 `recommendations` 表。
- 暂不整合 RPG 剧情层，MVP 先保留专业教练和数据驱动调整能力。
- 计划页已接入 pending 建议列表，支持将建议重量应用到当前周期后续训练日，或忽略建议。
- 今日训练页读取待练训练日时会跳过已完成训练，完成后刷新会进入下一次待练。

## 2026-07-04 训练历史闭环

- 新增 `/history` 训练历史页，展示已完成训练、总训练量、平均 RPE、每个动作的完成组数和最佳组。
- 历史页会展示每次训练产生的 Coach 调整，以及建议的 pending/accepted/rejected 状态。
- 今日训练页和计划页已增加历史入口，方便从训练执行和计划管理回看复盘。

## 暂缓决策

以下事项暂不阻塞开发，可以在第 4-6 周前确认：

- 是否购买正式域名。
- 是否接入 Sentry。
- 是否接入 PostHog。
- 是否接入 Resend。
- 是否开启游客试用。
- 是否预留付费会员功能。
