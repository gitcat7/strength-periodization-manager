# 序列优先排程设计

## 目标

让训练计划以“下一节训练”的顺序推进，日期仅作为建议，支持固定星期、练休节奏与自由滚动，同时保留现有计划和训练记录。

## 产品规则

- 下一节训练是同一计划中最小 `sequence_index` 的未完成、未跳过训练。
- `scheduled_date` 保留为建议日期；漏练不自动消失，也不自动跳过。
- 训练模板为一分化、三分化、五分化、推拉蹲；模板和排程方式独立。
- 排程方式属于计划：`fixed_weekdays`、`cadence`、`flexible`。
- “休息/顺延”仅会在后续阶段调整建议日期；“跳过”必须显式确认。

## 第一阶段范围

1. 新增数据库迁移：为 `programs` 增加 `schedule_mode`，为 `workouts` 增加 `sequence_index`。
2. 将历史训练按 `program_id, scheduled_date, created_at, id` 回填为从 0 开始的连续序号。
3. 新增每计划唯一序号约束和查询索引。
4. 计划生成领域模型输出 `sequenceIndex`，现有计划保存路径写入它；固定日期生成逻辑保持不变，界面不变。

## 兼容性与边界

- `scheduled_date`、`completed_at` 不改名；已有客户端和 RPC 不在本阶段改动。
- 历史计划的 `schedule_mode` 默认为 `fixed_weekdays`，避免改变其行为。
- 本阶段不改变首页、训练页、计划创建表单、推荐应用逻辑或训练模板内容；仅调整现有计划保存请求的字段映射。
- 数据库迁移在 `supabase/migrations/` 新增；`supabase/schema.sql` 同步最新建库结构。

## 验收

- 生成的训练计划具有连续且从 0 开始的 `sequenceIndex`。
- 固定日期计划仍按原可训练星期生成相同数量和日期。
- 迁移对已有计划为每个 `program_id` 独立回填连续序号。
- `programs.schedule_mode` 与 `workouts.sequence_index` 都具有非空、受约束的存储规则。
