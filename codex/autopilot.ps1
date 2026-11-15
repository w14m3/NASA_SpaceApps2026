# Keeps Codex working on the project until the deadline, with no approval prompts.
# Each run is a non-interactive `codex exec` session (approval is always "never" in exec mode) in the
# workspace-write sandbox with network access; between runs this script pulls, commits leftovers and pushes to main.
# Usage, from the repository folder in PowerShell:
#   powershell -ExecutionPolicy Bypass -File codex\autopilot.ps1
# Optional: -Model gpt-6-astra   -StopAt "2026-11-15T23:30:00"   -PauseSeconds 120
param(
  [string]$StopAt = '2026-11-15T23:30:00',   # local time of this PC (Europe/Paris)
  [int]$PauseSeconds = 120,
  [string]$Model = ''                         # empty = use the model from your Codex config.toml
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$stop = [datetime]::Parse($StopAt)
$logDir = Join-Path $root 'data\autopilot'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$promptFile = Join-Path $root 'codex\autopilot_prompt.txt'

function Sync-Main {
  git add -A 2>&1 | Out-Null
  git commit -q -m "autopilot: checkpoint" 2>&1 | Out-Null
  git pull --rebase --autostash origin main 2>&1 | Out-Host
  git push origin HEAD:main 2>&1 | Out-Host
}

$run = 0
while ((Get-Date) -lt $stop) {
  $run++
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Write-Host "`n=== autopilot run $run started $stamp (stops at $stop)" -ForegroundColor Cyan
  git pull --rebase --autostash origin main 2>&1 | Out-Host

  $codexArgs = @('exec', '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true')
  if ($Model) { $codexArgs += @('-m', $Model) }
  $codexArgs += '-'                                   # read the prompt from standard input
  Get-Content -Raw $promptFile | & codex @codexArgs 2>&1 | Tee-Object -FilePath (Join-Path $logDir "run-$stamp.log")

  Sync-Main
  if (Test-Path (Join-Path $root 'docs\ALL_OBJECTIVES_MET')) {
    Write-Host 'All objectives met: autopilot stops.' -ForegroundColor Green
    break
  }
  Write-Host "Pausing $PauseSeconds s before the next run (Ctrl+C to stop)."
  Start-Sleep -Seconds $PauseSeconds
}
Write-Host 'Autopilot finished.'
