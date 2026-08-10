# PLAN-01 Existing Plan Management Entry Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Replace existing-plan creation-oriented controls with explicit adjustment and reset actions.

**Architecture:** Reuse the existing plan parameter panel and the atomic `replace_active_program` confirmation flow. The UI changes only select which existing transition runs: adjust reveals parameters; reset opens the same protected regeneration confirmation using current parameters.

## Task 1: Add management-entry regression tests
- [ ] Add a test in `src/components/plan/program-manager.test.tsx` with an active program that asserts `调整计划` and `重置计划` are visible and `生成 4 周训练计划` is absent.
- [ ] Run the focused test and observe failure.
- [ ] Modify `src/components/plan/program-manager.tsx` so existing-plan actions use the approved labels. `调整计划` toggles parameter visibility; `重置计划` calls `openRegenerationDialog`, which already opens a confirmation stating completed history is retained.
- [ ] Re-run focused tests and typecheck.
- [ ] Commit the source and test change.

## Task 2: Verify and release
- [ ] Run `pnpm release:check`.
- [ ] Push `codex/p0-remediation`, deploy production, and run online smoke checks.
