const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

const checks = [
  { path: "/", type: "html", mustInclude: ["力训周期管家"] },
  { path: "/login", type: "html", mustInclude: ["登录或注册", "发送登录链接"] },
  { path: "/diagnostics", type: "html", mustInclude: ["项目诊断"] },
  { path: "/onboarding", type: "html", mustInclude: ["创建训练画像"] },
  { path: "/plan", type: "html", mustInclude: ["生成训练计划"] },
  { path: "/today", type: "html", mustInclude: ["今日训练"] },
  { path: "/history", type: "html", mustInclude: ["训练历史"] },
  { path: "/progress", type: "html", mustInclude: ["进展分析"] },
  { path: "/pr", type: "html", mustInclude: ["PR 计划"] },
  { path: "/settings", type: "html", mustInclude: ["设置"] },
  { path: "/feedback", type: "html", mustInclude: ["反馈问题"] },
  { path: "/privacy", type: "html", mustInclude: ["隐私与数据"] },
  { path: "/manifest.webmanifest", type: "manifest" },
  { path: "/icon.svg", type: "asset" },
  { path: "/api/health", type: "health" }
];

const failures = [];

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;

  try {
    const response = await fetch(url);
    const body = await response.text();

    if (!response.ok) {
      failures.push(`${check.path} returned ${response.status}`);
      continue;
    }

    if (check.type === "html") {
      for (const text of check.mustInclude ?? []) {
        if (!body.includes(text)) {
          failures.push(`${check.path} does not include "${text}"`);
        }
      }
    }

    if (check.type === "health") {
      const payload = JSON.parse(body);
      if (payload.ok !== true) {
        failures.push(`${check.path} returned ok=${payload.ok}`);
      }
    }

    if (check.type === "manifest") {
      const payload = JSON.parse(body);
      if (payload.name !== "力训周期管家" || payload.display !== "standalone") {
        failures.push(`${check.path} manifest metadata is invalid`);
      }
    }

    console.log(`ok ${check.path}`);
  } catch (error) {
    failures.push(`${check.path} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error("\nSmoke check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`\nSmoke check passed for ${baseUrl}`);
