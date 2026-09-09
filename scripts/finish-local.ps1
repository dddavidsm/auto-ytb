param(
  [string]$RepoPath = "$HOME\auto-ytb"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Set-DotEnvValue {
  param([string]$Path,[string]$Key,[string]$Value)
  $lines = if (Test-Path $Path) { [System.Collections.Generic.List[string]](Get-Content $Path) } else { [System.Collections.Generic.List[string]]::new() }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^$([Regex]::Escape($Key))=") {
      $lines[$i] = "$Key=$Value"
      $found = $true
      break
    }
  }
  if (-not $found) { $lines.Add("$Key=$Value") }
  [IO.File]::WriteAllLines($Path, $lines, (New-Object Text.UTF8Encoding($false)))
}

if (-not (Test-Path $RepoPath)) { throw "AUTO-YTB repo not found at $RepoPath. Run bootstrap-local.ps1 first." }
Write-Host "Updating AUTO-YTB..." -ForegroundColor Cyan
git -C $RepoPath pull --ff-only origin main
Set-Location $RepoPath

$envPath = Join-Path $RepoPath '.env.local'
if (-not (Test-Path $envPath)) { throw '.env.local is missing. Run bootstrap-local.ps1 first.' }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required for the isolated local PostgreSQL runtime. Install Docker Desktop, then rerun this command.'
}

try { docker info | Out-Null }
catch {
  $dockerDesktop = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktop) {
    Write-Host 'Starting Docker Desktop...' -ForegroundColor Yellow
    Start-Process $dockerDesktop
    $ready = $false
    for ($i=0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 2
      try { docker info | Out-Null; $ready = $true; break } catch {}
    }
    if (-not $ready) { throw 'Docker Desktop did not become ready in time.' }
  } else { throw 'Docker is installed but the daemon is not running. Start Docker Desktop and rerun.' }
}

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
docker compose --env-file $dockerEnv -f docker-compose.local.yml up -d postgres | Out-Host

$healthy = $false
for ($i=0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try {
    docker exec auto-ytb-postgres pg_isready -U auto_ytb -d auto_ytb | Out-Null
    if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
  } catch {}
}
if (-not $healthy) { throw 'Local PostgreSQL did not become healthy.' }

$dbUrl = "postgresql://auto_ytb:$password@127.0.0.1:55432/auto_ytb"
Set-DotEnvValue $envPath 'DATABASE_URL' $dbUrl
Set-DotEnvValue $envPath 'DATABASE_SSL' 'false'

# Reuse the single Gemini API key for the complete Google-first provider stack.
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
