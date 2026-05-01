# Lulu AI Installer for Windows
Write-Host "  _      _    _   _      _    _ " -ForegroundColor Cyan
Write-Host " | |    | |  | | | |    | |  | |" -ForegroundColor Cyan
Write-Host " | |    | |  | | | |    | |  | |" -ForegroundColor Cyan
Write-Host " | |____| |__| | | |____| |__| |" -ForegroundColor Cyan
Write-Host " |______|______| |______|______|" -ForegroundColor Cyan
Write-Host "       v0.0.5 | Installation`n" -ForegroundColor Gray

# 1. Check for Bun
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
    Write-Host "Bun not found. Installing Bun..." -ForegroundColor Yellow
    powershell -c "irm bun.sh/install.ps1 | iex"
    $env:PATH += ";$HOME\.bun\bin"
} else {
    Write-Host "✓ Bun is already installed." -ForegroundColor Green
}

# 2. Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Cyan
bun install

# 3. Build the project
Write-Host "Building Lulu..." -ForegroundColor Cyan
bun run build

# 4. Setup Alias (PowerShell Profile)
$profilePath = $PROFILE
if (-not (Test-Path $profilePath)) {
    New-Item -Path $profilePath -ItemType File -Force | Out-Null
}

$currentDir = Get-Location
$aliasCmd = "function lulu { bun $currentDir\src\index.tsx `$args }"

if (-not (Select-String -Path $profilePath -Pattern "function lulu")) {
    Write-Host "Adding 'lulu' function to PowerShell profile..." -ForegroundColor Yellow
    Add-Content -Path $profilePath -Value "`n$aliasCmd"
    Write-Host "✓ Added to profile: $profilePath" -ForegroundColor Green
    Write-Host "Please restart your terminal or run '. `$PROFILE' to use 'lulu' command." -ForegroundColor Green
} else {
    Write-Host "✓ 'lulu' command already exists in profile." -ForegroundColor Green
}

Write-Host "`nInstallation complete! Try running 'lulu' in a new terminal." -ForegroundColor Green
