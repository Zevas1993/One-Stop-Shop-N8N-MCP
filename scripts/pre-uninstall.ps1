# Pre-Uninstallation Cleanup Script for n8n MCP Server
# Version: 3.0.0-beta
# Purpose: Gracefully clean up before uninstallation
# Called by: Inno Setup uninstaller

param(
    [string]$InstallDir = "$env:ProgramFiles\n8n-mcp"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"  # Don't fail on warnings

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Level] $Message"
}

try {
    Write-Log "=== Pre-Uninstallation Cleanup ===" "START"

    # Step 1: Stop running MCP server
    Write-Log "Step 1: Stopping MCP server..." "INFO"

    $nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$InstallDir*" }

    if ($nodeProcesses) {
        Write-Log "Found running Node.js process(es), stopping..." "INFO"
        foreach ($process in $nodeProcesses) {
            try {
                Stop-Process -InputObject $process -Force -ErrorAction SilentlyContinue
                Write-Log "✓ Stopped process: $($process.Id)" "INFO"
            }
            catch {
                Write-Log "⚠ Could not stop process $($process.Id): $_" "WARN"
            }
        }
    } else {
        Write-Log "✓ No running MCP processes found" "INFO"
    }

    # Step 2: Remove scheduled task
    Write-Log "Step 2: Removing scheduled task..." "INFO"

    $taskName = "n8n-mcp-auto-update"
    $taskPath = "\n8n-mcp\"

    try {
        $existingTask = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue

        if ($existingTask) {
            Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false -ErrorAction SilentlyContinue
            Write-Log "✓ Scheduled task removed" "INFO"
        } else {
            Write-Log "✓ No scheduled task found" "INFO"
        }
    }
    catch {
        Write-Log "⚠ Could not remove scheduled task: $_" "WARN"
    }

    # Step 3: Remove from PATH
    Write-Log "Step 3: Cleaning up PATH..." "INFO"

    try {
        $envPath = [Environment]::GetEnvironmentVariable("Path", "Machine")

        if ($envPath -like "*n8n-mcp*") {
            $newPath = $envPath -split ";" | Where-Object { $_ -notlike "*n8n-mcp*" } | Join-String -Separator ";"
            [Environment]::SetEnvironmentVariable("Path", $newPath, "Machine")
            Write-Log "✓ Removed n8n-mcp from PATH" "INFO"
        } else {
            Write-Log "✓ n8n-mcp not in PATH" "INFO"
        }
    }
    catch {
        Write-Log "⚠ Could not clean PATH: $_" "WARN"
    }

    # Step 4: Close Claude Desktop config files
    Write-Log "Step 4: Checking Claude Desktop..." "INFO"

    try {
        $claudeConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json"

        if (Test-Path $claudeConfigPath) {
            # Create backup before modification
            $backupPath = "$claudeConfigPath.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
            Copy-Item -Path $claudeConfigPath -Destination $backupPath -ErrorAction SilentlyContinue
            Write-Log "✓ Backed up Claude Desktop config to: $backupPath" "INFO"

            # Optionally remove n8n-graphrag entry (commented out - keep for manual review)
            # $config = Get-Content -Path $claudeConfigPath -Raw | ConvertFrom-Json
            # if ($config.mcpServers."n8n-graphrag") {
            #     $config.mcpServers.PSObject.Properties.Remove('n8n-graphrag')
            #     $config | ConvertTo-Json -Depth 10 | Set-Content -Path $claudeConfigPath
            #     Write-Log "✓ Removed n8n-graphrag from Claude Desktop config" "INFO"
            # }

            Write-Log "⚠ Claude Desktop config not modified - you can manually remove n8n-graphrag if desired" "INFO"
        }
    }
    catch {
        Write-Log "⚠ Could not check Claude Desktop config: $_" "WARN"
    }

    # Step 5: Preserve user data
    Write-Log "Step 5: Preserving user data..." "INFO"

    $userDataPath = "$env:APPDATA\n8n-mcp"
    if (Test-Path $userDataPath) {
        Write-Log "✓ User data preserved at: $userDataPath" "INFO"
        Write-Log "  You can manually delete this if you want to remove all data" "INFO"
    }

    # Step 6: Create uninstall summary
    Write-Log "Step 6: Creating uninstall summary..." "INFO"

    $summaryPath = "$userDataPath\UNINSTALL-SUMMARY.txt"
    $summary = @"
n8n MCP Server Uninstallation Summary
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

REMOVED:
✓ Application files: $InstallDir
✓ Scheduled task: n8n-mcp-auto-update
✓ PATH environment variable
✓ Desktop shortcuts

PRESERVED (User Data):
- Configuration: $userDataPath\config\
- Graphs: $userDataPath\graph\
- Logs: $userDataPath\logs\

MANUAL CLEANUP (Optional):
1. Claude Desktop configuration:
   Location: $env:APPDATA\Claude\claude_desktop_config.json
   Action: Manually remove "n8n-graphrag" entry if desired

2. User data (if you want to remove it):
   Directory: $userDataPath
   Note: This contains your GraphRAG knowledge graph and configuration

3. Environment variables:
   Check Control Panel → System → Advanced → Environment Variables
   Remove any remaining GRAPH_* variables

For re-installation:
Visit: https://github.com/n8n-io/n8n-mcp

Questions or issues:
GitHub Issues: https://github.com/n8n-io/n8n-mcp/issues
"@

    $summary | Set-Content -Path $summaryPath -Force
    Write-Log "✓ Uninstall summary created" "INFO"

    # Step 7: Summary
    Write-Log "=== Pre-Uninstallation Cleanup Completed ===" "SUCCESS"
    Write-Log "" "INFO"
    Write-Log "IMPORTANT:" "INFO"
    Write-Log "Your user data has been preserved at: $userDataPath" "INFO"
    Write-Log "You can manually delete this directory if you want to completely remove n8n-mcp" "INFO"
    Write-Log "" "INFO"
    Write-Log "For complete uninstallation steps, see:" "INFO"
    Write-Log "  docs\GRAPHRAG-INSTALLATION-WINDOWS.md (Uninstallation section)" "INFO"

    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"

    # Don't fail the uninstall if cleanup script errors
    Write-Log "⚠ Pre-uninstall cleanup encountered errors, but continuing with uninstall" "WARN"
    exit 0
}
