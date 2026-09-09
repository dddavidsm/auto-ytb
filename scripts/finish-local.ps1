param(
  [string]$RepoPath = "$HOME\auto-ytb"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Set-DotEnvValue {
  param([string]$Path,[string]$Key,[string]$Value)
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path $Path) {
    foreach ($line in Get-Content $Path) { [void]$lines.Add([string]$line) }
  }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^$([Regex]::Escape($Key))=") {
      $lines[$i] = "$Key=$Value"
      $found = $true
      break
    }
  }
  if (-not $found) { [void]$lines.Add("$Key=$Value") }
  [IO.File]::WriteAllLines($Path, $lines.ToArray(), (New-Object Text.UTF8Encoding($false)))
}

function Resolve-DockerCommand {
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $known = @(
    "$Env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "$Env:ProgramFiles\Docker\Docker\resources\docker.exe"
  )
  foreach ($candidate in $known) {
    if (Test-Path $candidate) {
      $bin = Split-Path $candidate -Parent
      if (-not (($Env:Path -split ';') -contains $bin)) { $Env:Path = "$bin;$Env:Path" }
      return $candidate
    }
  }
  return $null
}

function Test-DockerDaemon {
  param([string]$DockerExe)
  try {
    $process = Start-Process -FilePath $DockerExe -ArgumentList @('info') -NoNewWindow -PassThru -Wait -RedirectStandardOutput "$env:TEMP\auto-ytb-docker-out.txt" -RedirectStandardError "$env:TEMP\auto-ytb-docker-err.txt"
    return ($process.ExitCode -eq 0)
  } catch { return $false }
}

function Ensure-DockerDesktop {
  $docker = Resolve-DockerCommand
  if (-not $docker) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
      throw 'Docker Desktop is not installed and Windows Package Manager (winget) is unavailable. Install Docker Desktop once, then rerun this command.'
    }
    Write-Host "Docker Desktop is missing. Installing it automatically now..." -ForegroundColor Yellow
    Write-Host "Approve the Windows/UAC prompt if it appears." -ForegroundColor Yellow
    & $winget.Source install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements --silent
    $installExit = $LASTEXITCODE
    if ($installExit -ne 0) {
      throw "Docker Desktop installation failed with exit code $installExit."
    }
    $docker = Resolve-DockerCommand
    if (-not $docker) {
      throw 'Docker Desktop installed, but its CLI is not available yet. A Windows sign-out/restart may be required; after that rerun the same AUTO-YTB command.'
    }
  }

  if (Test-DockerDaemon -DockerExe $docker) { return $docker }

  $dockerDesktop = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path $dockerDesktop)) {
    throw 'Docker CLI is present but Docker Desktop executable was not found.'
  }
  Write-Host 'Docker daemon is not ready. Starting Docker Desktop...' -ForegroundColor Yellow
  Start-Process $dockerDesktop
  Write-Host 'Waiting for Docker Desktop engine...' -ForegroundColor Yellow
  $ready = $false
  for ($i=0; $i -lt 150; $i++) {
    Start-Sleep -Seconds 2
    if (Test-DockerDaemon -DockerExe $docker) { $ready = $true; break }
  }
  if (-not $ready) {
    throw 'Docker Desktop did not become ready in 5 minutes. Open Docker Desktop once and complete any first-run/WSL prompt, then rerun the same AUTO-YTB command.'
  }
  Write-Host 'Docker Desktop engine READY.' -ForegroundColor Green
  return $docker
}

if (-not (Test-Path $RepoPath)) { throw "AUTO-YTB repo not found at $RepoPath. Run bootstrap-local.ps1 first." }
Write-Host "Updating AUTO-YTB..." -ForegroundColor Cyan
git -C $RepoPath pull --ff-only origin main
Set-Location $RepoPath

$envPath = Join-Path $RepoPath '.env.local'
if (-not (Test-Path $envPath)) { throw '.env.local is missing. Run bootstrap-local.ps1 first.' }

$dockerExe = Ensure-DockerDesktop

$dockerEnv = Join-Path $RepoPath '.env.docker.local'
$password = $null
if (Test-Path $dockerEnv) {
  $existing = Get-Content $dockerEnv | Where-Object { $_ -match '^POSTGRES_PASSWORD=' } | Select-Object -First 1
  if ($existing) { $password = $existing.Substring('POSTGRES_PASSWORD='.Length) }
}
if ([string]::IsNullOrWhiteSpace($password)) {
  $password = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')).Substring(0,48)
  [IO.File]::WriteAllText($dockerEnv, "POSTGRES_PASSWORD=$password`n", (New-Object Text.UTF8Encoding($false)))
}

Write-Host 'Starting isolated PostgreSQL 17 container...' -ForegroundColor Cyan
& $dockerExe compose --env-file $dockerEnv -f docker-compose.local.yml up -d postgres | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'docker compose failed to start PostgreSQL.' }

$healthy = $false
for ($i=0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  & $dockerExe exec auto-ytb-postgres pg_isready -U auto_ytb -d auto_ytb *> $null
  if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
}
if (-not $healthy) { throw 'Local PostgreSQL did not become healthy.' }

$dbUrl = "postgresql://auto_ytb:$password@127.0.0.1:55432/auto_ytb"
Set-DotEnvValue $envPath 'DATABASE_URL' $dbUrl
Set-DotEnvValue $envPath 'DATABASE_SSL' 'false'

Set-DotEnvValue $envPath 'SEARCH_PROVIDER' 'gemini'
Set-DotEnvValue $envPath 'GEMINI_SEARCH_MODEL' 'gemini-3.7-flash'
Set-DotEnvValue $envPath 'VOICE_PROVIDER' 'gemini'
Set-DotEnvValue $envPath 'VOICE_ID' 'Kore'
Set-DotEnvValue $envPath 'VOICE_MODEL' 'gemini-3.1-flash-tts-preview'
Set-DotEnvValue $envPath 'GEMINI_TTS_MODEL' 'gemini-3.1-flash-tts-preview'
Set-DotEnvValue $envPath 'IMAGE_PROVIDER' 'gemini'
Set-DotEnvValue $envPath 'IMAGE_MODEL' 'gemini-2.5-flash-image'
Set-DotEnvValue $envPath 'GEMINI_IMAGE_MODEL' 'gemini-2.5-flash-image'
Set-DotEnvValue $envPath 'VIDEO_PROVIDER' 'gemini'
Set-DotEnvValue $envPath 'VIDEO_MODEL' 'veo-3.1-fast-generate-preview'
Set-DotEnvValue $envPath 'GEMINI_VIDEO_MODEL' 'veo-3.1-fast-generate-preview'
Set-DotEnvValue $envPath 'GEMINI_VIDEO_RESOLUTION' '720p'
Set-DotEnvValue $envPath 'AUTO_UPLOAD_PRIVATE' 'true'

Write-Host 'Building and migrating AUTO-YTB database...' -ForegroundColor Cyan
npm install --no-audit --no-fund | Out-Host
npm run build | Out-Host
node --env-file=.env.local scripts/migrate.mjs | Out-Host

Write-Host "`nConnection readiness:" -ForegroundColor Yellow
node --env-file=.env.local scripts/connections-doctor.mjs --strict | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'connections:doctor still reports a core blocker.' }

Write-Host "`nAUTO-YTB local foundation is READY." -ForegroundColor Green
Write-Host 'PostgreSQL: READY (isolated Docker container)'
Write-Host 'Drive: READY'
Write-Host 'YouTube: READY'
Write-Host 'Gemini text/search/TTS/image/video: configured'
Write-Host 'No external media generation call was made, so this step incurred no video/image/TTS generation cost.'
