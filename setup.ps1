<#
  setup.ps1
  — (Invoked by setup-run.bat, automatically elevated)
#>

# 0) Make sure we're running as Admin
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
  Write-Warning "Please run setup-run.bat (it will relaunch this as Admin)."
  Pause
  Exit 1
}

# 1) Install Chocolatey if missing
if (!(Test-Path 'C:\ProgramData\chocolatey')) {
  Write-Host "Installing Chocolatey…"
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = 'Tls12'
  iex ((New-Object System.Net.WebClient).DownloadString(
    'https://chocolatey.org/install.ps1'))
} else {
  Write-Host "Chocolatey already present."
}

# 2) Ensure choco is on PATH immediately
$chocoBin = 'C:\ProgramData\chocolatey\bin'
if (Test-Path $chocoBin -and -not ($env:PATH -split ';' | Where-Object { $_ -eq $chocoBin })) {
  Write-Host "Adding Chocolatey bin to PATH for this session…"
  $env:PATH = "$chocoBin;"+$env:PATH
}

# 3) Install all prerequisites
Write-Host "`nInstalling Node.js LTS, Git, MongoDB & tools, Python3, build-tools…"
choco feature enable -n allowGlobalConfirmation
choco install nodejs-lts git mongodb mongodb-tools python3 windows-build-tools --yes

# 4) Refresh (fallback)
Write-Host "`nAttempting to refresh environment variables…"
# Try the PowerShell module
if (Test-Path "$env:ChocolateyInstall\helpers\RefreshEnv.psm1") {
  Import-Module "$env:ChocolateyInstall\helpers\RefreshEnv.psm1"
  RefreshEnv
}
# And the CMD script
$refreshCmd = Join-Path $chocoBin 'refreshenv.cmd'
if (Test-Path $refreshCmd) {
  & $refreshCmd
}

# 5) Verify everything is now on PATH
Write-Host "`nNode version:   " (node -v   2>&1)
Write-Host "npm version:    " (npm -v    2>&1)
Write-Host "Git version:    " (git --version 2>&1)
Write-Host "mongoimport:    " (mongoimport --version 2>&1)

# 6) Clone or update your repo
$repoDir = "$env:USERPROFILE\KeepUP-v2"
if (Test-Path $repoDir) {
  Write-Host "`nUpdating KeepUP-v2…"
  Push-Location $repoDir; git pull; Pop-Location
} else {
  Write-Host "`nCloning KeepUP-v2 to $repoDir…"
  git clone https://github.com/Zlammie/KeepUP-v2.git $repoDir
}

# 7) Install npm deps & seed DB
Write-Host "`nInstalling npm packages…"
Push-Location $repoDir
npm install
Write-Host "`nSeeding sample data…"
npm run seed
Pop-Location

Write-Host "`n✅ Setup complete!"
Write-Host "➡️  Now double-click start.bat to launch the app."
Pause
