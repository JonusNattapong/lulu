# Auto-start Lulu daemon on Windows boot
# Run as admin: .\install-daemon.ps1

$luluPath = $PSScriptRoot
$daemonScript = Join-Path $luluPath "src\core\daemon.ts"

# Create startup registry entry
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$name = "LuluDaemon"

# Use Windows Task Scheduler for more reliable auto-start
$action = New-ScheduledTaskAction -Execute "bun" -Argument "`"$daemonScript`" start" -WorkingDirectory $luluPath
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register the task
Register-ScheduledTask -TaskName "LuluDaemon" -Action $action -Trigger $trigger -Settings $settings -Description "Lulu Personal AI Agent - starts on login" -Force

Write-Host "Lulu daemon will start automatically on login."
Write-Host "To start now manually: bun `"$daemonScript`" start"
Write-Host "To remove auto-start: Unregister-ScheduledTask -TaskName LuluDaemon -Confirm:`$false"