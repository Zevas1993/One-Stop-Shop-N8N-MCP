# Setup Windows Task Scheduler for n8n MCP Auto-Updates
# Version: 3.0.0-beta
# Purpose: Create scheduled task to check for n8n updates every 6 hours
# Requires: Administrator privileges

param(
    [string]$InstallDir = "$env:ProgramFiles\n8n-mcp",
    [int]$IntervalHours = 6,
    [switch]$Disable = $false,
    [switch]$Remove = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Check for admin privileges
$isAdmin = ([System.Security.Principal.WindowsIdentity]::GetCurrent().Groups -match 'S-1-5-32-544') -ne $null
if (-not $isAdmin) {
    Write-Host "ERROR: This script requires Administrator privileges" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again" -ForegroundColor Red
    exit 1
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

try {
    Write-Log "=== Setting up Windows Task Scheduler ===" "START"
    Write-Log "Install directory: $InstallDir" "INFO"
    Write-Log "Update interval: $IntervalHours hours" "INFO"

    # Define task name
    $taskName = "n8n-mcp-auto-update"
    $taskPath = "\n8n-mcp\"

    # Step 1: Remove existing task if requested or if it exists
    if ($Remove) {
        Write-Log "Removing existing task..." "INFO"
        schtasks /delete /tn "$taskPath$taskName" /f 2>$null | Out-Null
        Write-Log "✓ Task removed (if it existed)" "INFO"
        exit 0
    }

    # Check if task exists
    $existingTask = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue

    if ($existingTask) {
        Write-Log "Existing task found, updating..." "INFO"
        Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false
    }

    # Step 2: Create task directory
    Write-Log "Step 1: Creating task directory..." "INFO"
    $taskDir = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders"
    New-Item -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree\n8n-mcp" -Force | Out-Null
    Write-Log "✓ Task directory created" "INFO"

    # Step 3: Create task action
    Write-Log "Step 2: Creating task action..." "INFO"

    $pythonExe = "$InstallDir\runtime\python\python.exe"
    $updateScript = "$InstallDir\scripts\auto_updater.py"

    if (!(Test-Path $pythonExe)) {
        throw "Python executable not found: $pythonExe"
    }
    if (!(Test-Path $updateScript)) {
        throw "Auto-updater script not found: $updateScript"
    }

    $action = New-ScheduledTaskAction `
        -Execute $pythonExe `
        -Argument "`"$updateScript`""

    Write-Log "✓ Task action created" "INFO"

    # Step 4: Create task trigger
    Write-Log "Step 3: Creating task trigger..." "INFO"

    $trigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date).AddMinutes(5) `
        -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
        -RepetitionDuration (New-TimeSpan -Days 365)

    # Add jitter (±10 minutes) to avoid thundering herd
    $jitter = Get-Random -Minimum -600 -Maximum 600
    $trigger.StartBoundary = ((Get-Date).AddSeconds($jitter)).ToString('s')

    Write-Log "✓ Task trigger created (every $IntervalHours hours)" "INFO"

    # Step 5: Create task settings
    Write-Log "Step 4: Creating task settings..." "INFO"

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -Compatibility Win8 `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -RunOnlyIfNetworkAvailable `
        -WakeToRun

    # Don't start if on battery for long periods
    $settings.DisallowStartIfOnBatteries = $true
    $settings.StopIfGoingOnBatteries = $true

    Write-Log "✓ Task settings created" "INFO"

    # Step 6: Create principal (run as user)
    Write-Log "Step 5: Creating task principal..." "INFO"

    $principal = New-ScheduledTaskPrincipal `
        -UserId (whoami) `
        -RunLevel Limited `
        -LogonType ServiceAccount

    Write-Log "✓ Task principal created (running as current user)" "INFO"

    # Step 7: Register task
    Write-Log "Step 6: Registering scheduled task..." "INFO"

    $task = New-ScheduledTask `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "n8n MCP Server: Check for n8n updates every $IntervalHours hours and update GraphRAG knowledge graph"

    Register-ScheduledTask `
        -TaskName $taskName `
        -TaskPath $taskPath `
        -InputObject $task `
        -Force | Out-Null

    Write-Log "✓ Scheduled task registered" "INFO"

    # Step 8: Verify task
    Write-Log "Step 7: Verifying task..." "INFO"

    $registeredTask = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue

    if ($registeredTask) {
        Write-Log "✓ Task verified successfully" "INFO"
        Write-Log "" "INFO"
        Write-Log "TASK DETAILS:" "INFO"
        Write-Log "  Name: $taskName" "INFO"
        Write-Log "  Path: $taskPath" "INFO"
        Write-Log "  Action: Run $pythonExe" "INFO"
        Write-Log "  Arguments: $updateScript" "INFO"
        Write-Log "  Trigger: Every $IntervalHours hours" "INFO"
        Write-Log "  Status: Enabled" "INFO"
    } else {
        throw "Task registration failed"
    }

    # Step 9: Create log directory
    Write-Log "Step 8: Setting up logging..." "INFO"

    $logDir = "$env:APPDATA\n8n-mcp\logs"
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Write-Log "✓ Log directory created: $logDir" "INFO"

    Write-Log "=== Task Setup Completed Successfully ===" "SUCCESS"
    Write-Log "" "INFO"
    Write-Log "AUTO-UPDATE DETAILS:" "INFO"
    Write-Log "  Schedule: Every $IntervalHours hours" "INFO"
    Write-Log "  First run: In approximately 5 minutes (with ±10 min jitter)" "INFO"
    Write-Log "  Script: $updateScript" "INFO"
    Write-Log "  Logs: $logDir" "INFO"
    Write-Log "" "INFO"
    Write-Log "MANAGE THE TASK:" "INFO"
    Write-Log "  View task: schtasks /query /tn \n8n-mcp\$taskName /v" "INFO"
    Write-Log "  Run now: schtasks /run /tn \n8n-mcp\$taskName" "INFO"
    Write-Log "  Disable: schtasks /change /tn \n8n-mcp\$taskName /disable" "INFO"
    Write-Log "  Enable: schtasks /change /tn \n8n-mcp\$taskName /enable" "INFO"
    Write-Log "  Delete: schtasks /delete /tn \n8n-mcp\$taskName /f" "INFO"

    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"

    [System.Windows.Forms.MessageBox]::Show(
        "Failed to setup auto-update task:`n`n$($_.Exception.Message)",
        "Task Setup Error",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) 2>/dev/null

    exit 1
}
