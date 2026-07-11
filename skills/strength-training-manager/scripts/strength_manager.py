#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.error
import urllib.request


DEFAULT_URL = "https://strength-periodization-manager.vercel.app"


def build_parser():
    parser = argparse.ArgumentParser(description="用中文操作力训周期管家")
    parser.add_argument("命令", choices=["今日", "计划", "历史", "进度", "PR", "记录组", "完成训练"])
    parser.add_argument("--接口地址", default=os.environ.get("STRENGTH_MANAGER_URL", DEFAULT_URL))
    parser.add_argument("--日期")
    parser.add_argument("--数量", type=int, default=10)
    parser.add_argument("--动作记录ID")
    parser.add_argument("--训练ID")
    parser.add_argument("--组", type=int)
    parser.add_argument("--重量", type=float)
    parser.add_argument("--次数", type=int)
    parser.add_argument("--RPE", type=float)
    return parser


def build_payload(args):
    actions = {
        "今日": "today",
        "计划": "plan",
        "历史": "history",
        "进度": "progress",
        "PR": "pr_goals",
        "记录组": "record_set",
        "完成训练": "complete_workout",
    }
    payload = {"action": actions[args.命令]}

    if args.命令 == "今日" and args.日期:
        payload["date"] = args.日期
    elif args.命令 == "历史":
        payload["limit"] = args.数量
    elif args.命令 == "记录组":
        required = {
            "--动作记录ID": args.动作记录ID,
            "--组": args.组,
            "--重量": args.重量,
            "--次数": args.次数,
            "--RPE": args.RPE,
        }
        missing = [name for name, value in required.items() if value is None]
        if missing:
            raise ValueError("记录组缺少参数: " + ", ".join(missing))
        payload.update(
            {
                "actual_reps": args.次数,
                "actual_weight": args.重量,
                "completed": True,
                "rpe": args.RPE,
                "set_index": args.组,
                "workout_exercise_id": args.动作记录ID,
            }
        )
    elif args.命令 == "完成训练":
        if not args.训练ID:
            raise ValueError("完成训练缺少参数: --训练ID")
        payload["workout_id"] = args.训练ID

    return payload


def request_api(base_url, token, payload):
    url = base_url.rstrip("/") + "/api/agent/v1"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "strength-training-manager-skill/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"error": {"code": "http_error", "message": body or str(error)}}
        return payload


def main():
    parser = build_parser()
    args = parser.parse_args()
    token = os.environ.get("STRENGTH_MANAGER_TOKEN", "").strip()
    if not token:
        parser.error("请先在安全环境变量中配置 STRENGTH_MANAGER_TOKEN")

    try:
        payload = build_payload(args)
        result = request_api(args.接口地址, token, payload)
    except (ValueError, urllib.error.URLError, TimeoutError) as error:
        print(json.dumps({"ok": False, "error": {"message": str(error)}}, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
