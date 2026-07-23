$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repository = "FATELLS/sichuan-tech-consultation-desk"
$ReleaseTag = "v1.0.1"
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

Write-Host "川科讯｜Windows 一键安装程序" -ForegroundColor Green
Write-Host "安装目录：$InstallDirectory"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Step "未检测到 Docker Desktop，正在通过 winget 安装"

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "当前系统没有 winget。请先在 Microsoft Store 安装“应用安装程序”，然后重新运行本命令。"
  }

  & winget install --exact --id Docker.DockerDesktop `
    --accept-package-agreements --accept-source-agreements

  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop 安装失败，请检查 winget 输出后重新运行。"
  }

  Refresh-ProcessPath
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker 已安装但当前终端尚未识别。请重新打开 PowerShell 后再次运行同一条命令。"
}

if (-not (Test-DockerReady)) {
  Write-Step "正在启动 Docker Desktop"
  $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"

  if (-not (Test-Path $dockerDesktop)) {
    throw "找不到 Docker Desktop。请完成 Docker Desktop 安装后重新运行。"
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
    throw "Docker Desktop 未能在 10 分钟内启动。若系统提示启用 WSL 2 或重启 Windows，请完成后重新运行同一条命令。"
  }
}

Write-Step "请输入小科助手使用的 GLM API Key"
$secureKey = Read-Host "GLM API Key" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "GLM API Key 不能为空。"
}

Write-Step "正在下载川科讯 $ReleaseTag"
$temporaryRoot = Join-Path $env:TEMP ("chuankexun-" + [Guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $temporaryRoot "source.zip"
$extractPath = Join-Path $temporaryRoot "source"
New-Item -ItemType Directory -Path $extractPath -Force | Out-Null

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $ArchiveUrl -OutFile $archivePath -UseBasicParsing
Expand-Archive -Path $archivePath -DestinationPath $extractPath -Force

$sourceDirectory = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1

if ($null -eq $sourceDirectory) {
  throw "下载包内容不完整，请稍后重新运行。"
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

Write-Step "正在构建并启动平台"
Push-Location $InstallDirectory
try {
  & docker compose up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "容器启动失败。请确认 3000 端口未被占用，并查看 Docker Desktop 提示。"
  }
} finally {
  Pop-Location
}

Write-Step "正在检查平台状态"
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
  throw "平台已经启动，但健康检查暂未通过。请在安装目录执行 docker compose logs 查看原因。"
}

Write-Host ""
Write-Host "安装部署完成！" -ForegroundColor Green
Write-Host "访问地址：$SiteUrl"
Write-Host "安装目录：$InstallDirectory"
Start-Process $SiteUrl
