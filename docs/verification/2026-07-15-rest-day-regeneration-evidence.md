# 休息日与计划重建发布证据

记录时间（UTC）：2026-07-15T16:51:00Z。

状态：**发布受阻，未执行迁移或生产部署。** 本工作树没有 Supabase 项目链接，Supabase CLI 未认证；因此不能安全地确定目标数据库、备份、应用必需 schema 或运行认证功能检查。Vercel CLI 已认证，但在数据库迁移未确认前不得发布依赖该 schema 的前端代码。

## 本地证据

- RED 证明（2026-07-15T16:46:51Z）：临时移除 `scripts/rest-day-smoke.test.mjs` 后，`vitest run scripts/rest-day-smoke.test.mjs` 以退出码 1 失败，原因是 `No test files found`；随后立即原样恢复 helper。
- `pnpm test`（2026-07-15T16:48:11Z）：32 个测试文件、168 个测试通过；`scripts/rest-day-smoke.test.mjs` 因未设置 `BASE_URL` 跳过 1 个线上路由测试。
- `pnpm typecheck`（2026-07-15T16:48:25Z）：通过。
- `pnpm build`（2026-07-15T16:48:40Z）：通过。构建输出还报告工作树外的重复 lockfile 与 ESLint 插件解析警告；命令退出码为 0。
- `pnpm release:check`（2026-07-15T16:49:36Z）：未通过。构建和类型检查完成，但本地 `/api/health` 返回 500，因为 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 均未配置。
- 混合日程、原子 RPC、重建确认、恢复日打卡与指标隔离均有单元/合约测试；数据库 pgTAP 文件为 `supabase/tests/rest_day_schedule.test.sql`，尚未在可访问数据库执行。
- 数据库迁移文件：`20260715110000_rest_day_schedule_and_program_replacement.sql`。
- Supabase CLI 可经项目运行时调用（版本 `2.109.1`），但项目列表命令返回“未提供访问令牌”；工作树也没有 Supabase 链接元数据。因此迁移、备份确认、pgTAP 与认证功能检查均未执行，不能标记为通过。
- Vercel CLI 可经项目运行时调用并已认证；工作树没有 Vercel 项目链接元数据。为避免 schema 与前端版本不一致，未尝试生产部署或生产 smoke。
- 浏览器自动化运行时在本会话不可用，且没有可用的已登录测试会话；320×568、390×844、768×1024、1440×900 的对话框焦点/关闭/加载、休息卡片、计划与历史行、横向溢出、资源及控制台检查未执行。

## 发布前待填

- [ ] 备份完成时间（UTC）与脱敏位置。
- [ ] 链接并认证目标 Supabase 后，迁移已执行；记录迁移 UTC 时间与脱敏备份位置。
- [ ] pgTAP/SQL：旧计划回滚、跨用户隔离、休息日无动作、连续索引通过。
- [ ] 已验证重新生成预览、确认、回载失败的“重新加载页面”恢复路径。
- [ ] 已验证休息日只可当天一键完成，且不阻断下一次力量训练。
- [ ] 已在 320×568、390×844、768×1024、1440×900 检查无横向溢出、对话框焦点和恢复卡片。
- [ ] 迁移与认证检查通过后，部署生产并运行生产 `BASE_URL` 的 rest-day smoke。
