<#  
  setup.ps1  
  — Run “Right-click → Run with PowerShell (As Administrator)”  
#>

# 1) Install Chocolatey if missing
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Chocolatey…"
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = 'Tls12'
  iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
}

# 2) Install Node.js LTS, MongoDB Server, MongoDB Tools, Python3, and build tools
Write-Host "Installing Node.js LTS, MongoDB, MongoDB Tools, Python3 and build tools…"
choco install nodejs-lts mongodb mongodb-tools python3 windows-build-tools --yes

# 2a) Reload environment so npm/mongoimport/python are on the PATH
Import-Module "$env:ChocolateyInstall\helpers\RefreshEnv.psm1"
RefreshEnv

# 3) Clone or update the repo
$repoDir = "$env:USERPROFILE\KeepUP-v2"
if (Test-Path $repoDir) {
  Write-Host "Updating existing KeepUP-v2…"
  Push-Location $repoDir
  git pull
  Pop-Location
} else {
  Write-Host "Cloning KeepUP-v2 to $repoDir…"
  git clone https://github.com/Zlammie/KeepUP-v2.git $repoDir
}

# 4) Install npm packages & seed DB
Write-Host "Installing npm dependencies…"
Push-Location $repoDir
npm install

Write-Host "Seeding sample data…"
npm run seed
Pop-Location

Write-Host "✅ Setup complete!"
Write-Host "➡️  Next: Double-click start.bat to launch the app."