param([string]$ProjectPath = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = "Stop"
Set-Location $ProjectPath

function Test-Variable([string]$Name) {
  $inEnvironment = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))
  $inLocalFile = (Test-Path .env.local -PathType Leaf) -and (Select-String -Path .env.local -Pattern "^$Name=" -Quiet)
  return $inEnvironment -or $inLocalFile
}

$migrationNames = Get-ChildItem supabase/migrations -File -Filter *.sql | ForEach-Object { $_.BaseName.Split('_')[0] }
$duplicateVersions = $migrationNames | Group-Object | Where-Object Count -gt 1

Write-Output "Project: $((Get-Content package.json -Raw | ConvertFrom-Json).name)"
Write-Output "Git status: $(git status --short --branch)"
Write-Output "Dependencies: $(if (Test-Path node_modules/.bin) { 'present' } else { 'missing' })"
Write-Output "Supabase URL configured: $(Test-Variable 'NEXT_PUBLIC_SUPABASE_URL')"
Write-Output "Supabase public key configured: $(Test-Variable 'NEXT_PUBLIC_SUPABASE_ANON_KEY')"
Write-Output "Migrations: $($migrationNames.Count); duplicate versions: $($duplicateVersions.Count)"

if ($duplicateVersions) { throw "Duplicate migration versions: $($duplicateVersions.Name -join ', ')" }
