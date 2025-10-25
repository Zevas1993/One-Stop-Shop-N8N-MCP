# Register n8n MCP Server with Claude Desktop
# Version: 3.0.0-beta
# Purpose: Add n8n-mcp to Claude Desktop configuration
# Usage: .\register-claude.ps1 [-InstallDir "C:\Program Files\n8n-mcp"] [-Force]

param(
    [string]$InstallDir = "$env:ProgramFiles\n8n-mcp",
    [switch]$Force = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    Write-Host "[$Level] $Message"
}

try {
    Write-Log "=== Registering n8n MCP with Claude Desktop ===" "START"

    # Step 1: Verify installation
    Write-Log "Step 1: Verifying installation..." "INFO"

    if (!(Test-Path "$InstallDir\dist\mcp\index.js")) {
        throw "MCP server not found at $InstallDir\dist\mcp\index.js"
    }
    Write-Log "✓ MCP server found" "INFO"

    # Step 2: Locate Claude Desktop config
    Write-Log "Step 2: Locating Claude Desktop configuration..." "INFO"

    $claudeConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json"

    if (!(Test-Path "$env:APPDATA\Claude")) {
        New-Item -ItemType Directory -Path "$env:APPDATA\Claude" -Force | Out-Null
        Write-Log "Created Claude Desktop config directory" "INFO"
    }

    # Step 3: Read or create configuration
    Write-Log "Step 3: Reading configuration..." "INFO"

    if (Test-Path $claudeConfigPath) {
        Write-Log "Found existing configuration" "INFO"
        $config = Get-Content -Path $claudeConfigPath -Raw | ConvertFrom-Json
        Write-Log "✓ Configuration loaded" "INFO"
    } else {
        Write-Log "Creating new configuration" "INFO"
        $config = @{
            mcpServers = @{}
        }
    }

    # Ensure mcpServers object exists
    if (-not $config.mcpServers) {
        $config.mcpServers = @{}
    }

    # Step 4: Check if already registered
    Write-Log "Step 4: Checking registration status..." "INFO"

    if ($config.mcpServers."n8n-graphrag" -and -not $Force) {
        Write-Log "✓ n8n-graphrag is already registered" "INFO"
        Write-Log "Use -Force to override existing configuration" "INFO"

        # Show current configuration
        $config.mcpServers."n8n-graphrag" | ConvertTo-Json | ForEach-Object { Write-Log "  $_" "INFO" }

        exit 0
    }

    # Step 5: Create configuration entry
    Write-Log "Step 5: Creating configuration entry..." "INFO"

    $n8nConfig = @{
        command = "node"
        args = @(
            "$InstallDir\dist\mcp\index.js"
        )
        env = @{
            MCP_MODE = "stdio"
            GRAPH_DIR = "$env:APPDATA\n8n-mcp\graph"
            NODE_ENV = "production"
        }
    }

    $config.mcpServers."n8n-graphrag" = $n8nConfig
    Write-Log "✓ Configuration entry created" "INFO"

    # Step 6: Save configuration
    Write-Log "Step 6: Saving configuration..." "INFO"

    # Create backup
    if (Test-Path $claudeConfigPath) {
        $backupPath = "$claudeConfigPath.backup"
        Copy-Item -Path $claudeConfigPath -Destination $backupPath -Force
        Write-Log "✓ Backup created: $backupPath" "INFO"
    }

    # Save new configuration with pretty formatting
    $jsonContent = $config | ConvertTo-Json -Depth 10 | Add-Content -Path $claudeConfigPath -Force
    $config | ConvertTo-Json -Depth 10 | Set-Content -Path $claudeConfigPath -Force -Encoding UTF8

    Write-Log "✓ Configuration saved to: $claudeConfigPath" "INFO"

    # Step 7: Verify Claude Desktop will find it
    Write-Log "Step 7: Verifying configuration..." "INFO"

    if (Test-Path "$InstallDir\dist\mcp\index.js") {
        Write-Log "✓ MCP server path is accessible" "INFO"
    } else {
        throw "MCP server path is not accessible"
    }

    # Step 8: Show what's next
    Write-Log "=== Registration Completed Successfully ===" "SUCCESS"
    Write-Log "" "INFO"
    Write-Log "NEXT STEPS:" "INFO"
    Write-Log "1. Completely close Claude Desktop (not just minimize)" "INFO"
    Write-Log "2. Reopen Claude Desktop" "INFO"
    Write-Log "3. Check Settings → Connected Servers" "INFO"
    Write-Log "4. You should see 'n8n-graphrag' listed as connected" "INFO"
    Write-Log "" "INFO"
    Write-Log "CONFIGURATION DETAILS:" "INFO"
    Write-Log "Config file: $claudeConfigPath" "INFO"
    Write-Log "Install dir: $InstallDir" "INFO"
    Write-Log "Graph cache: $env:APPDATA\n8n-mcp\graph" "INFO"
    Write-Log "" "INFO"
    Write-Log "If n8n-graphrag doesn't appear in Claude:" "INFO"
    Write-Log "1. Check logs: $env:APPDATA\Claude\logs\" "INFO"
    Write-Log "2. Verify path exists: $InstallDir\dist\mcp\index.js" "INFO"
    Write-Log "3. Try rebuilding: npm run build in install directory" "INFO"

    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"

    [System.Windows.Forms.MessageBox]::Show(
        "Failed to register with Claude Desktop:`n`n$($_.Exception.Message)",
        "Registration Error",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) 2>/dev/null

    exit 1
}
