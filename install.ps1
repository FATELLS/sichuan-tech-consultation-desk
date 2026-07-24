$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repository = "FATELLS/sichuan-tech-consultation-desk"
$ReleaseTag = "v1.0.2"
$InstallDirectory = Join-Path $env:LOCALAPPDATA "ChuanKeXun"
$ArchiveUrl = "https://github.com/$Repository/archive/refs/tags/$ReleaseTag.zip"
$HealthUrl = "http://127.0.0.1:3000/xk-assistant/health"
$SiteUrl = "http://localhost:3000"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Test-DockerReady {
  try {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

Write-Host "ChuanKeXun - Windows Installer" -ForegroundColor Green
Write-Host "Install directory: $InstallDirectory"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Step "Docker Desktop was not found. Installing it with winget"

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is not available. Install App Installer from Microsoft Store, then run this command again."
  }

  & winget install --exact --id Docker.DockerDesktop `
    --accept-package-agreements --accept-source-agreements

  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop installation failed. Check the winget output, then run this command again."
  }

  Refresh-ProcessPath
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is installed but is not visible in this terminal. Reopen PowerShell, then run the same command again."
}

if (-not (Test-DockerReady)) {
  Write-Step "Starting Docker Desktop"
  $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"

  if (-not (Test-Path $dockerDesktop)) {
    throw "Docker Desktop could not be found. Complete its installation, then run this command again."
  }

  Start-Process $dockerDesktop

  $dockerReady = $false
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    Start-Sleep -Seconds 5
    if (Test-DockerReady) {
      $dockerReady = $true
      break
    }
  }

  if (-not $dockerReady) {
    throw "Docker Desktop did not start within 10 minutes. Complete any WSL 2 or Windows restart prompt, then run this command again."
  }
}

Write-Step "Enter the GLM API Key for XiaoKe Assistant"
$secureKey = Read-Host "GLM API Key" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "GLM API Key cannot be empty."
}

Write-Step "Downloading ChuanKeXun $ReleaseTag"
$temporaryRoot = Join-Path $env:TEMP ("chuankexun-" + [Guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $temporaryRoot "source.zip"
$extractPath = Join-Path $temporaryRoot "source"
New-Item -ItemType Directory -Path $extractPath -Force | Out-Null

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $ArchiveUrl -OutFile $archivePath -UseBasicParsing
Expand-Archive -Path $archivePath -DestinationPath $extractPath -Force

$sourceDirectory = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1

if ($null -eq $sourceDirectory) {
  throw "The downloaded archive is incomplete. Run this command again later."
}

New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
Copy-Item -Path (Join-Path $sourceDirectory.FullName "*") `
  -Destination $InstallDirectory -Recurse -Force

$configuration = @(
  "GLM_API_KEY=$apiKey"
  "GLM_API_BASE=https://open.bigmodel.cn/api/coding/paas/v4"
) -join "`r`n"

$utf8WithoutBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[IO.File]::WriteAllText(
  (Join-Path $InstallDirectory ".dev.vars"),
  $configuration + "`r`n",
  $utf8WithoutBom
)

$apiKey = $null
$configuration = $null

Write-Step "Building and starting the platform"
Push-Location $InstallDirectory
try {
  & docker compose up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "The containers failed to start. Make sure port 3000 is free and check Docker Desktop."
  }
} finally {
  Pop-Location
}

Write-Step "Checking platform health"
$healthy = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
    if ($health.ok -and $health.configured) {
      $healthy = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 3
  }
}

if (-not $healthy) {
  throw "The platform started, but its health check failed. Run docker compose logs in the install directory."
}

Write-Host ""
Write-Host "Installation completed." -ForegroundColor Green
Write-Host "Open: $SiteUrl"
Write-Host "Install directory: $InstallDirectory"
Start-Process $SiteUrl
