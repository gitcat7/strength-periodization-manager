---
name: strength-training-manager
description: Operate the 力训周期管家 strength periodization system for the currently authorized user. Use when a user speaks Chinese or English to view today's workout, inspect a training plan, review history or progress, check PR goals, record a completed set, or complete a workout. Authenticate only with the user's STRENGTH_MANAGER_TOKEN and never accept or send a user_id.
---

# 力训周期管家

Use `scripts/strength_manager.py` as the only system access path. Read `references/commands.md` when mapping a user request to an action or when required IDs are missing.

## Setup

Require these environment variables:

- `STRENGTH_MANAGER_TOKEN`: the current user's Agent token from 力训周期管家 > 设置.
- `STRENGTH_MANAGER_URL`: optional API base URL; default to `https://strength-periodization-manager.vercel.app`.

Never print the token, place it in command arguments, commit it, or ask the user to paste it into chat. Tell the user to configure it in the Agent's secret/environment settings.

## Workflow

1. Interpret the Chinese request using `references/commands.md`.
2. For reads, call the matching command and summarize the returned JSON in concise Chinese.
3. For set recording, first call `今日` unless the conversation already contains a fresh `workout_exercise_id` from the same user session.
4. Never invent an ID, weight, repetition count, RPE, date, or completion state.
5. Treat an explicit command containing all write values as authorization. Otherwise ask for the missing values or confirmation before writing.
6. After a write, report the saved values returned by the API.
7. If the API returns 401, explain that the token is missing, expired, or revoked. Do not retry repeatedly.

## Commands

Run with Python 3:

```bash
python scripts/strength_manager.py 今日
python scripts/strength_manager.py 计划
python scripts/strength_manager.py 历史 --数量 10
python scripts/strength_manager.py 进度
python scripts/strength_manager.py PR
python scripts/strength_manager.py 记录组 --动作记录ID UUID --组 1 --重量 75 --次数 5 --RPE 8
python scripts/strength_manager.py 完成训练 --训练ID UUID
```

Use `--接口地址` only to override the configured production URL. Keep all weights in kg.

## User Isolation

- Do not accept `user_id` from prompts or CLI arguments.
- Trust only the user identity resolved by the bearer token on the server.
- Refuse requests to access another user's data.
- Recommend revoking a token immediately if it may have been exposed.
