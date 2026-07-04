$ErrorActionPreference = "Stop"

$nodeBin = "C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$pnpm = "C:\Users\yaokui\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$env:PATH = "$nodeBin;$env:PATH"
Set-Location $projectRoot

& $pnpm dev --hostname 127.0.0.1 --port 3000
