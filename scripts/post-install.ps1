# Post-Installation Setup Script for n8n MCP Server
# Version: 3.0.0-beta
# Purpose: Run after Inno Setup installation completes
# Location: Called by installer in post-install phase

param(
    [string]$InstallDir = "$env:ProgramFiles\n8n-mcp",
    [string]$BuildGraph = $true,
    [string]$N8nUrl = "",
    [string]$N8nApiKey = ""
)

# Enable strict mode
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Logging
$LogFile = "$env:APPDATA\n8n-mcp\logs\install.log"
New-Item -ItemType Directory -Path "$env:APPDATA\n8n-mcp\logs" -Force | Out-Null

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$Timestamp] [$Level] $Message"
    Write-Host $LogMessage
    Add-Content -Path $LogFile -Value $LogMessage -Force
}

Write-Log "=== n8n MCP Post-Installation Setup ===" "START"
Write-Log "Install directory: $InstallDir"

try {
    # Step 1: Verify installation
    Write-Log "Step 1: Verifying installation..." "INFO"

    if (!(Test-Path "$InstallDir\dist\mcp\index.js")) {
        throw "MCP server not found at $InstallDir\dist\mcp\index.js"
    }
    Write-Log "✓ MCP server verified" "INFO"

    if (!(Test-Path "$InstallDir\runtime\node\node.exe")) {
        throw "Node.js runtime not found"
    }
    Write-Log "✓ Node.js runtime verified" "INFO"

    if (!(Test-Path "$InstallDir\runtime\python\python.exe")) {
        throw "Python runtime not found"
    }
    Write-Log "✓ Python runtime verified" "INFO"

    # Step 2: Create cache directories
    Write-Log "Step 2: Creating cache directories..." "INFO"

    $GraphDir = "$env:APPDATA\n8n-mcp\graph"
    $ConfigDir = "$env:APPDATA\n8n-mcp\config"
    $LogsDir = "$env:APPDATA\n8n-mcp\logs"

    foreach ($Dir in @($GraphDir, $ConfigDir, $LogsDir)) {
        New-Item -ItemType Directory -Path $Dir -Force | Out-Null
        Write-Log "✓ Created: $Dir" "INFO"
    }

    # Step 3: Create .env configuration
    Write-Log "Step 3: Creating .env configuration..." "INFO"

    $EnvPath = "$ConfigDir\.env"
    $EnvContent = @"
# n8n MCP Server Configuration
# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

# Core settings
NODE_ENV=production
MCP_MODE=stdio

# GraphRAG settings
GRAPH_DIR=$GraphDir
GRAPH_PYTHON=$InstallDir\runtime\python\python.exe
GRAPH_BACKEND=$InstallDir\python\backend\graph\lightrag_service.py
BRIDGE_CACHE_MAX=100
METRICS_GRAPHRAG=false
DEBUG_MCP=false

# Memory management
MEM_GUARD_THRESHOLD_MB=512

# n8n Integration
"@

    if ($N8nUrl) {
        $EnvContent += "`nN8N_API_URL=$N8nUrl"
    }

    if ($N8nApiKey) {
        $EnvContent += "`nN8N_API_KEY=$N8nApiKey"
    }

    Set-Content -Path $EnvPath -Value $EnvContent -Force
    Write-Log "✓ Created .env at: $EnvPath" "INFO"

    # Step 4: Set environment variables
    Write-Log "Step 4: Setting environment variables..." "INFO"

    [Environment]::SetEnvironmentVariable("GRAPH_DIR", $GraphDir, "User")
    [Environment]::SetEnvironmentVariable("NODE_ENV", "production", "User")
    Write-Log "✓ Environment variables set" "INFO"

    # Step 5: Register with Claude Desktop (optional)
    Write-Log "Step 5: Claude Desktop integration (optional)..." "INFO"

    $claudeConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json"
    if (Test-Path $claudeConfigPath) {
        Write-Log "Claude Desktop config found, you can add n8n-mcp server" "INFO"
        Write-Log "See: docs\GRAPHRAG-INSTALLATION-WINDOWS.md for configuration steps" "INFO"
    }

    # Step 6: Build initial graph (if enabled)
    if ($BuildGraph -eq "true" -or $BuildGraph -eq $true) {
        Write-Log "Step 6: Building initial GraphRAG catalog..." "INFO"

        $n8nDiscoveryScript = "$InstallDir\scripts\n8n_discovery.py"
        if (Test-Path $n8nDiscoveryScript) {
            Write-Log "Running n8n discovery..." "INFO"
            & "$InstallDir\runtime\python\python.exe" $n8nDiscoveryScript

            $initialBuilderScript = "$InstallDir\scripts\initial_graph_builder.py"
            if (Test-Path $initialBuilderScript) {
                Write-Log "Building initial graph (this may take 2-5 minutes)..." "INFO"
                & "$InstallDir\runtime\python\python.exe" $initialBuilderScript
                Write-Log "✓ Graph building completed" "INFO"
            }
        }
    } else {
        Write-Log "Graph building skipped (you can rebuild later with: npm run rebuild)" "INFO"
    }

    # Step 7: Create shortcuts and start menu
    Write-Log "Step 7: Creating shortcuts..." "INFO"

    $StartMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\n8n-mcp"
    New-Item -ItemType Directory -Path $StartMenuPath -Force | Out-Null
    Write-Log "✓ Start menu created" "INFO"

    # Step 8: Verify final installation
    Write-Log "Step 8: Final verification..." "INFO"

    $requiredFiles = @(
        "$InstallDir\dist\mcp\index.js",
        "$InstallDir\package.json",
        "$InstallDir\docs\GRAPHRAG-INSTALLATION-WINDOWS.md"
    )

    foreach ($File in $requiredFiles) {
        if (Test-Path $File) {
            Write-Log "✓ Found: $File" "INFO"
        } else {
            Write-Log "✗ Missing: $File" "WARN"
        }
    }

    Write-Log "=== Installation Completed Successfully ===" "SUCCESS"
    Write-Log "Installation directory: $InstallDir" "INFO"
    Write-Log "Configuration file: $EnvPath" "INFO"
    Write-Log "Graph directory: $GraphDir" "INFO"
    Write-Log "Logs: $LogsDir" "INFO"
    Write-Log "" "INFO"
    Write-Log "NEXT STEPS:" "INFO"
    Write-Log "1. Review documentation: $InstallDir\docs\" "INFO"
    Write-Log "2. Configure n8n connection: Edit $EnvPath" "INFO"
    Write-Log "3. Register with Claude Desktop: See installation guide" "INFO"
    Write-Log "4. Start using n8n-mcp with Claude!" "INFO"

    exit 0
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)" "ERROR"
    Write-Log $_.ScriptStackTrace "ERROR"

    # Show error dialog
    [System.Windows.Forms.MessageBox]::Show(
        "Installation encountered an error:`n`n$($_.Exception.Message)`n`nCheck logs: $LogFile",
        "Installation Error",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )

    exit 1
}
