<#  
  setup.ps1  
  — (Invoked by setup-run.bat)  
#>

# — 0) Ensure we're running as Admin
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
  Write-Warning "This script needs to run as Administrator.`nPlease run setup-run.bat instead."
  Pause
  Exit 1
}

# — 1) Install Chocolatey if missing
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Chocolatey…"
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = 'Tls12'
  iex ((New-Object System.Net.WebClient).DownloadString(
    'https://chocolatey.org/install.ps1'))
}

# — 2) Install Node.js, MongoDB, and any extras
Write-Host "`nInstalling Node.js LTS, MongoDB, MongoDB Tools, Python3 and build tools…"
choco feature enable -n allowGlobalConfirmation
choco install nodejs-lts mongodb mongodb-tools python3 windows-build-tools --yes

# — 2a) Refresh this session’s PATH
Write-Host "`nRefreshing environment variables…"
Import-Module "$env:ChocolateyInstall\helpers\RefreshEnv.psm1"
RefreshEnv

# — 2b) Verify
Write-Host "`nNode version:" (node -v)
Write-Host "npm version:"  (npm -v)
Write-Host "mongo version:" (mongo --version)

# — 3) Clone or update your repo
$repoDir = "$env:USERPROFILE\KeepUP-v2"
if (Test-Path $repoDir) {
  Write-Host "`nUpdating existing KeepUP-v2…"
  Push-Location $repoDir
  git pull
  Pop-Location
} else {
  Write-Host "`nCloning KeepUP-v2 to $repoDir…"
  git clone https://github.com/Zlammie/KeepUP-v2.git $repoDir
}

# — 4) Install dependencies & seed DB
Write-Host "`nInstalling npm packages…"
Push-Location $repoDir
npm install

Write-Host "`nSeeding sample data…"
npm run seed
Pop-Location

Write-Host "`n✅ Setup complete!"
Write-Host "➡️  Next: Double-click start.bat to launch the app."
Pause
