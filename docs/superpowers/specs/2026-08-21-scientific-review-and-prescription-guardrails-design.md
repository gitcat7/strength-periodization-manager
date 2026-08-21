# 科学复盘与计划日处方护栏设计

## 目标和边界

周期训练在完成或显式保存历史修改后，以真实完成组、目标/实际重量次数、RPE、完成率和训练间隔生成保守建议；自由训练仅进入既有分析指标，绝不改周期处方。用户必须预览并明确接受或修改建议后，才改变未来未完成训练日。计划日编辑仅允许本人 active program 中 scheduled/draft、且没有任何完成组的训练日。

不接入模型、第三方或医疗判断；所有建议为通用训练提示，单位为 kg。

## 规则与数据不足

规则输入缺失、RPE 不在 1–10、没有完成组、没有可用处方或训练方向缺失时，输出 `hold`，原因固定为“数据不足，保持当前处方并继续记录”。保护条件严格优先：完成率低于 100%、末组或平均 RPE 高、训练间隔异常、恢复/饮食/体重字段提示恢复差，均不得加重。主项才允许在全部完成、RPE 不高、间隔正常、恢复无警告时按器械增量小幅加重；辅助动作低 RPE 默认保持。

规则结果只可为：维持、加重、减重、减组恢复、延后/恢复提示。每条输出记录结构化原因码、可读中文说明、来源训练和来源 revision。

## 原子完成、重算与审计

新 migration 扩展建议来源字段、训练 revision 和处方修订审计，并提供 security-definer RPC：

1. `complete_training_workout` 在同一事务校验终态、持续时间、组日志和建议；重复调用返回同一已完成结果，不能重复 pending 建议。
2. `revise_completed_workout_logs` 保存历史修改后递增来源 revision；只替换同来源的 pending 建议。accepted、modified、rejected 行保留不变。
3. `preview_recommendation_application` 返回受影响的 scheduled/draft 后续训练日及拟议重量/组数；`apply_recommendation` 在用户确认后原子更新这些处方并将建议标记 accepted/modified。浏览器不得拼接多表写入。

一个训练日、动作和来源 revision 最多一条 pending；RLS 仍仅允许用户本人，RPC 明确核验 `auth.uid()` 和 active program 归属。

## 计划日处方编辑护栏

`revise_workout_prescription` 接受完整本地 `cfg_exercises` 动作清单和乐观锁 revision。数据库阻断：训练日状态不为 scheduled/draft、已有完成组、非本人 active program、动作数不在 1–12、重复动作、缺少有效 `training_direction`、方向与训练日冲突、删除唯一主项且未替换、无效组数/次数/重量。

规则层返回 warning 而非阻断：周有效组明显偏低/高、同日多个重主项、恢复间隔受影响、目标或经验不匹配。UI 必须先展示 warning 和影响预览，再要求二次确认；未确认不调用保存。缺元数据必须回到动作方向修正，不能根据中文名猜测。

## 事实来源、界面与验证

处方编辑写入 `plan_workout_exercises` 和 `log_workout_prescription_revisions`；Today、History、Progress 和 Coach 都继续由该处方及实际日志读取。计划 UI 显示 pending 建议、受影响训练日数、接受/修改/拒绝；Today 完成摘要显示本次规则结论。所有控件 mobile-first、44px 触控高度。

迁移固定为 `20260821010000_scientific_review_and_prescription_guardrails.sql`，幂等、同步 `supabase/schema.sql`、静态 SQL contract 和 pgTAP。生产部署前必须等待用户确认迁移成功。
