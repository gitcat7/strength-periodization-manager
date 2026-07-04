import { spawn } from "node:child_process";
import { once } from "node:events";

const host = "127.0.0.1";
const port = Number(process.env.RELEASE_CHECK_PORT || 3100);
const baseUrl = `http://${host}:${port}`;

await runPackageScript("typecheck");
await runPackageScript("build");

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", host, "--port", String(port)],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitForHealth(`${baseUrl}/api/health`, 30_000);
  await runPackageScript("smoke", { BASE_URL: baseUrl });
  console.log(`\nRelease check passed for ${baseUrl}`);
} finally {
  server.kill();
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 3_000))
  ]);
}

async function runPackageScript(scriptName, extraEnv = {}) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : "pnpm";
  const args = npmExecPath ? [npmExecPath, scriptName] : [scriptName];

  console.log(`\n> pnpm ${scriptName}`);
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv
    },
    shell: !npmExecPath,
    stdio: "inherit"
  });

  const [code] = await once(child, "exit");
  if (code !== 0) {
    throw new Error(`pnpm ${scriptName} failed with exit code ${code}`);
  }
}

async function waitForHealth(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (response.ok && payload.ok === true) return;
      lastError = `${url} returned ${response.status} ${JSON.stringify(payload)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Production server did not become healthy. ${lastError}\n${output}`);
}
