import { execFile } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    const response = await requestText(url);
    const body = response.body;

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

async function requestText(url) {
  if (process.env.SMOKE_TRANSPORT === "powershell") {
    return requestTextWithPowerShell(url);
  }

  try {
    const response = await fetch(url);
    return {
      body: await response.text(),
      ok: response.ok,
      status: response.status
    };
  } catch (fetchError) {
    return requestTextWithNode(url, fetchError);
  }
}

function requestTextWithNode(url, originalError) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.request(
      parsedUrl,
      {
        headers: {
          "user-agent": "strength-periodization-smoke-check"
        },
        timeout: 30000
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          resolve({
            body,
            ok: status >= 200 && status < 300,
            status
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("request timed out"));
    });
    request.on("error", (error) => {
      if (process.platform === "win32") {
        requestTextWithPowerShell(url)
          .then(resolve)
          .catch((powerShellError) => {
            reject(
              new Error(
                `${powerShellError.message}; node fallback after ${error.message}; fetch fallback after ${originalError.message}`
              )
            );
          });
        return;
      }

      reject(new Error(`${error.message}; fetch fallback after ${originalError.message}`));
    });
    request.end();
  });
}

async function requestTextWithPowerShell(url) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "$response = Invoke-WebRequest -Uri $env:SMOKE_URL -UseBasicParsing -TimeoutSec 30",
    "$body = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }",
    "$payload = @{ status = [int]$response.StatusCode; body = $body } | ConvertTo-Json -Compress",
    "Write-Output $payload"
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      env: {
        ...process.env,
        SMOKE_URL: url
      },
      maxBuffer: 10 * 1024 * 1024,
      timeout: 45000
    }
  );
  const payload = JSON.parse(stdout.trim());

  return {
    body: payload.body,
    ok: payload.status >= 200 && payload.status < 300,
    status: payload.status
  };
}
