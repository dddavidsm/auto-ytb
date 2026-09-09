param(
  [string]$RepoPath = "$HOME\auto-ytb",
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoUrl = 'https://github.com/dddavidsm/auto-ytb.git'
$DefaultClientId = '1057552725509-l53fo9ll7m5nuuevae1d5kas9e7b3132.apps.googleusercontent.com'
$DriveRootId = '1NaSy4ni0np1TXUlk0Zq7FFx9isBDtlp3'
$DriveRedirect = 'http://localhost:53683/oauth2/callback'
$YouTubeRedirect = 'http://localhost:53682/oauth2/callback'
$DriveScope = 'https://www.googleapis.com/auth/drive'
$YouTubeScopes = @(
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly'
) -join ' '

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Encode([string]$Value) { return [Uri]::EscapeDataString($Value) }

function Invoke-OAuthFlow {
  param(
    [string]$ClientId,
    [string]$ClientSecret,
    [string]$RedirectUri,
    [string]$Scope,
    [string]$State
  )

  $redirect = [Uri]$RedirectUri
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://localhost:$($redirect.Port)/")
  try {
    $listener.Start()
    $authUrl = 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + (Encode $ClientId) +
      '&redirect_uri=' + (Encode $RedirectUri) +
      '&response_type=code' +
      '&access_type=offline' +
      '&prompt=consent' +
      '&scope=' + (Encode $Scope) +
      '&state=' + (Encode $State)

    Write-Host "`nOpening Google authorization for $State..." -ForegroundColor Cyan
    Start-Process $authUrl
    $context = $listener.GetContext()
    $request = $context.Request
    $code = $request.QueryString['code']
    $returnedState = $request.QueryString['state']
    $error = $request.QueryString['error']

    $html = if ($error) {
      '<html><body><h2>AUTO-YTB authorization failed</h2><p>You can close this window.</p></body></html>'
    } else {
      '<html><body><h2>AUTO-YTB authorization complete</h2><p>You can close this window and return to PowerShell.</p></body></html>'
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($html)
    $context.Response.ContentType = 'text/html; charset=utf-8'
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.OutputStream.Close()

    if ($error) { throw "Google OAuth error: $error" }
    if (-not $code) { throw 'Google OAuth callback did not include a code.' }
    if ($returnedState -ne $State) { throw 'Google OAuth state mismatch.' }

    return Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -ContentType 'application/x-www-form-urlencoded' -Body @{
      code = $code
      client_id = $ClientId
      client_secret = $ClientSecret
      redirect_uri = $RedirectUri
      grant_type = 'authorization_code'
    }
  }
  finally {
    if ($listener.IsListening) { $listener.Stop() }
    $listener.Close()
  }
}

function Get-AccessToken {
  param([string]$ClientId,[string]$ClientSecret,[string]$RefreshToken)
  $response = Invoke-RestMethod -Method Post -Uri 'https://oauth2.googleapis.com/token' -ContentType 'application/x-www-form-urlencoded' -Body @{
    client_id = $ClientId
    client_secret = $ClientSecret
    refresh_token = $RefreshToken
    grant_type = 'refresh_token'
  }
  return $response.access_token
}

if (-not (Test-Path $RepoPath)) {
  Write-Host "Cloning AUTO-YTB into $RepoPath..." -ForegroundColor Cyan
  git clone $RepoUrl $RepoPath
}
Set-Location $RepoPath

$clientIdInput = Read-Host "Google OAuth Client ID [$DefaultClientId]"
$clientId = if ([string]::IsNullOrWhiteSpace($clientIdInput)) { $DefaultClientId } else { $clientIdInput.Trim() }
$clientSecret = Read-Secret 'Google OAuth Client Secret (hidden)'
if ([string]::IsNullOrWhiteSpace($clientSecret)) { throw 'Client Secret is required.' }

Write-Host "`n1/4 Drive authorization — sign in as the Drive storage account." -ForegroundColor Yellow
$driveToken = Invoke-OAuthFlow -ClientId $clientId -ClientSecret $clientSecret -RedirectUri $DriveRedirect -Scope $DriveScope -State 'auto-ytb-drive'
if (-not $driveToken.refresh_token) { throw 'Drive authorization did not return a refresh token.' }
$driveAccess = Get-AccessToken -ClientId $clientId -ClientSecret $clientSecret -RefreshToken $driveToken.refresh_token
$driveHeaders = @{ Authorization = "Bearer $driveAccess" }
$root = Invoke-RestMethod -Uri "https://www.googleapis.com/drive/v3/files/$DriveRootId?fields=id,name,mimeType" -Headers $driveHeaders
if ($root.id -ne $DriveRootId) { throw 'Drive root verification failed.' }
$q = [Uri]::EscapeDataString("name='00_SYSTEM' and mimeType='application/vnd.google-apps.folder' and trashed=false and '$DriveRootId' in parents")
$systemFolders = Invoke-RestMethod -Uri "https://www.googleapis.com/drive/v3/files?q=$q&fields=files(id,name)&pageSize=10" -Headers $driveHeaders
if (-not $systemFolders.files -or $systemFolders.files.Count -lt 1) { throw '00_SYSTEM was not found under the pinned AUTO-YTB Drive root.' }
$systemId = $systemFolders.files[0].id
$canaryName = "_connection-canary-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()).txt"
$canary = Invoke-RestMethod -Method Post -Uri 'https://www.googleapis.com/drive/v3/files?fields=id,name' -Headers $driveHeaders -ContentType 'application/json' -Body (@{
  name = $canaryName
  parents = @($systemId)
  mimeType = 'text/plain'
  description = 'AUTO-YTB OAuth write canary; safe to delete.'
} | ConvertTo-Json -Depth 5)
Invoke-RestMethod -Method Delete -Uri "https://www.googleapis.com/drive/v3/files/$($canary.id)" -Headers $driveHeaders | Out-Null
Write-Host "Drive OK: $($root.name) / 00_SYSTEM (write + delete verified)" -ForegroundColor Green

Write-Host "`n2/4 YouTube authorization — sign in as the YouTube channel account." -ForegroundColor Yellow
$youtubeToken = Invoke-OAuthFlow -ClientId $clientId -ClientSecret $clientSecret -RedirectUri $YouTubeRedirect -Scope $YouTubeScopes -State 'auto-ytb'
if (-not $youtubeToken.refresh_token) { throw 'YouTube authorization did not return a refresh token.' }
$youtubeAccess = Get-AccessToken -ClientId $clientId -ClientSecret $clientSecret -RefreshToken $youtubeToken.refresh_token
$youtube = Invoke-RestMethod -Uri 'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true' -Headers @{ Authorization = "Bearer $youtubeAccess" }
if (-not $youtube.items -or $youtube.items.Count -lt 1) { throw 'No YouTube channel was found for the authorized account.' }
$channelId = $youtube.items[0].id
$channelName = $youtube.items[0].snippet.title
Write-Host "YouTube OK: $channelName ($channelId)" -ForegroundColor Green

Write-Host "`n3/4 Gemini API" -ForegroundColor Yellow
$geminiKey = Read-Secret 'Gemini API key (hidden; press Enter to leave blocked for now)'
$geminiReady = $false
if (-not [string]::IsNullOrWhiteSpace($geminiKey)) {
  try {
    $null = Invoke-RestMethod -Uri 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1' -Headers @{ 'x-goog-api-key' = $geminiKey }
    $geminiReady = $true
    Write-Host 'Gemini OK' -ForegroundColor Green
  } catch {
    Write-Warning "Gemini key test failed: $($_.Exception.Message)"
  }
}

$envLines = @(
  'TEXT_MODEL_PROVIDER=gemini',
  'GEMINI_MODEL=gemini-2.5-flash',
  "GEMINI_API_KEY=$geminiKey",
  "DRIVE_CLIENT_ID=$clientId",
  "DRIVE_CLIENT_SECRET=$clientSecret",
  "DRIVE_REFRESH_TOKEN=$($driveToken.refresh_token)",
  "DRIVE_ROOT_FOLDER_ID=$DriveRootId",
  "DRIVE_REDIRECT_URI=$DriveRedirect",
  "YOUTUBE_CLIENT_ID=$clientId",
  "YOUTUBE_CLIENT_SECRET=$clientSecret",
  "YOUTUBE_REFRESH_TOKEN=$($youtubeToken.refresh_token)",
  "YOUTUBE_CHANNEL_ID=$channelId",
  "YOUTUBE_REDIRECT_URI=$YouTubeRedirect",
  'AUTO_UPLOAD_PRIVATE=true'
)
[IO.File]::WriteAllLines((Join-Path $RepoPath '.env.local'), $envLines, (New-Object Text.UTF8Encoding($false)))
Write-Host "`nSecrets saved only to $RepoPath\.env.local (gitignored)." -ForegroundColor Green

Write-Host "`n4/4 Local project validation" -ForegroundColor Yellow
if (-not $SkipInstall) { npm install --no-audit --no-fund }
node --env-file=.env.local scripts/connections-doctor.mjs

Write-Host "`nBootstrap complete." -ForegroundColor Green
Write-Host "Drive: READY"
Write-Host "YouTube: READY ($channelName / $channelId)"
Write-Host ("Gemini: " + $(if ($geminiReady) { 'READY' } else { 'BLOCKED — add GEMINI_API_KEY to .env.local later' }))
Write-Host 'OAuth app may remain in Testing for local development; Google test-mode refresh tokens can require reauthorization later.'
