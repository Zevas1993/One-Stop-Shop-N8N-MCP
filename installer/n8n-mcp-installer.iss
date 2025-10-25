; n8n MCP Server Installer
; Version: 3.0.0-beta
; Platform: Windows 10/11 (64-bit)
; Created with Inno Setup 6.2+
; Last Updated: 2025-01-19

#define MyAppName "n8n MCP Server"
#define MyAppVersion "3.0.0-beta"
#define MyAppPublisher "n8n-io"
#define MyAppURL "https://github.com/n8n-io/n8n-mcp"
#define MyAppExeName "n8n-mcp.exe"
#define SourceDir "C:\path\to\n8n-mcp"
#define OutputDir ".\Output"

[Setup]
; Compiler settings
AppId={{F8B5E3C1-8B7D-4C8F-9A6B-7C5D3E2F1A0B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={pf}\n8n-mcp
DefaultGroupName=n8n-mcp
AllowNoIcons=yes
LicenseFile={#SourceDir}\LICENSE
OutputDir={#OutputDir}
OutputBaseFilename=n8n-mcp-{#MyAppVersion}-x64
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
WizardStyle=modern
DisableProgramGroupPage=no
PrivilegesRequired=admin
SetupIconFile={#SourceDir}\installer\setup.ico
UninstallDisplayIcon={app}\app.ico
ShowLanguageDialog=no
DefaultLanguage=english
;InfoBeforeFile=before.txt
;InfoAfterFile=after.txt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "Full installation"
Name: "custom"; Description: "Custom installation"; Flags: iscustom

[Components]
Name: "runtime"; Description: "Node.js Runtime (18.20.0 LTS)"; Types: full custom; Flags: fixed
Name: "python"; Description: "Python 3.11 (Embedded)"; Types: full custom; Flags: fixed
Name: "app"; Description: "n8n MCP Application"; Types: full custom; Flags: fixed
Name: "graphrag"; Description: "GraphRAG Backend (LightRAG)"; Types: full custom
Name: "models"; Description: "ML Models (Optional, 2.6GB)"; Types: custom

[Files]
; Node.js runtime (pre-built, bundled in installer)
Source: "{#SourceDir}\runtime\node\*"; DestDir: "{app}\runtime\node"; Components: runtime; Flags: ignoreversion recursesubdirs createallsubdirs

; Python runtime (pre-built, bundled in installer)
Source: "{#SourceDir}\runtime\python\*"; DestDir: "{app}\runtime\python"; Components: python; Flags: ignoreversion recursesubdirs createallsubdirs

; Node modules (pre-built)
Source: "{#SourceDir}\node_modules\*"; DestDir: "{app}\node_modules"; Components: app; Flags: ignoreversion recursesubdirs createallsubdirs

; Built application
Source: "{#SourceDir}\dist\*"; DestDir: "{app}\dist"; Components: app; Flags: ignoreversion recursesubdirs createallsubdirs

; Source files (for development/reference)
Source: "{#SourceDir}\src\*"; DestDir: "{app}\src"; Components: app; Flags: ignoreversion recursesubdirs createallsubdirs

; Python backend
Source: "{#SourceDir}\python\*"; DestDir: "{app}\python"; Components: graphrag; Flags: ignoreversion recursesubdirs createallsubdirs

; Configuration templates
Source: "{#SourceDir}\.env.example"; DestDir: "{app}"; Components: app; DestName: ".env.example"
Source: "{#SourceDir}\package.json"; DestDir: "{app}"; Components: app

; Documentation
Source: "{#SourceDir}\docs\*"; DestDir: "{app}\docs"; Components: app; Flags: ignoreversion recursesubdirs createallsubdirs

; License and README
Source: "{#SourceDir}\LICENSE"; DestDir: "{app}"; Components: app
Source: "{#SourceDir}\README.md"; DestDir: "{app}"; Components: app
Source: "{#SourceDir}\CLAUDE.md"; DestDir: "{app}"; Components: app

; Scripts
Source: "{#SourceDir}\scripts\*"; DestDir: "{app}\scripts"; Components: graphrag; Flags: ignoreversion recursesubdirs createallsubdirs

; Installer resources
Source: "{#SourceDir}\installer\task.xml"; DestDir: "{app}\installer"; Components: graphrag

; ML Models (optional, large files)
Source: "{#SourceDir}\models\*"; DestDir: "{app}\models"; Components: models; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\n8n MCP Server"; Filename: "{app}\n8n-mcp.exe"; WorkingDir: "{app}"
Name: "{group}\Documentation"; Filename: "https://github.com/n8n-io/n8n-mcp"; Flags: useapppaths
Name: "{group}\Uninstall n8n MCP"; Filename: "{uninstallexe}"
Name: "{userdesktop}\n8n MCP Server"; Filename: "{app}\n8n-mcp.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional tasks:"; Flags: unchecked
Name: "registerclause"; Description: "Register with Claude Desktop"; GroupDescription: "Claude Desktop:"
Name: "registerwsh"; Description: "Register Windows Service (admin only)"; GroupDescription: "Windows Service:"; Flags: unchecked

[Registry]
; Add to PATH
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{old}{app}\runtime\node;{app}\runtime\python"; Flags: createvalueifdoesntexist

; Associate with n8n-mcp: URLs (optional, for future use)
Root: HKCR; Subkey: "n8n-mcp"; ValueType: string; ValueData: "URL:n8n-mcp Protocol"; Flags: uninsdeletekey
Root: HKCR; Subkey: "n8n-mcp"; ValueName: "URL Protocol"; ValueType: string; ValueData: ""
Root: HKCR; Subkey: "n8n-mcp\shell\open\command"; ValueType: string; ValueData: """{app}\n8n-mcp.exe"" ""%1"""

[Run]
; Run post-install setup
Filename: "{app}\scripts\post-install.ps1"; Components: app; Flags: runhidden
Filename: "{app}\scripts\register-claude.ps1"; Components: app; Flags: runhidden; Tasks: registerclause
Filename: "{app}\scripts\setup-auto-update-task.ps1"; Components: graphrag; Flags: runhidden
Filename: "{app}\scripts\setup-service.ps1"; Components: graphrag; Flags: runhidden; Tasks: registerwsh

[UninstallRun]
; Clean up before uninstalling
Filename: "{app}\scripts\pre-uninstall.ps1"; Flags: runhidden

[Code]
// Global variables for custom pages
var
  N8nDiscoveryPage: TInputQueryWizardPage;
  N8nUrlEdit: TEdit;
  N8nApiKeyEdit: TEdit;
  N8nAutoDiscoverCheck: TCheckBox;
  GraphBuilderPage: TInputQueryWizardPage;
  GraphBuilderCheckbox: TCheckBox;
  ConfigPage: TInputQueryWizardPage;
  GraphDirEdit: TEdit;

// Initialize custom pages
procedure InitializeWizard();
begin
  // Page 1: n8n Discovery
  N8nDiscoveryPage := CreateInputQueryWizardPage(wpSelectTasks,
    'n8n Instance Configuration',
    'Configure connection to your n8n instance',
    'n8n MCP Server needs to know where your n8n instance is located. It can auto-discover it or you can provide the URL manually.');

  N8nDiscoveryPage.Add('Auto-discover n8n instance (checked - fastest):', False);
  N8nAutoDiscoverCheck := N8nDiscoveryPage.CheckListBox.Items.Objects[0];

  N8nDiscoveryPage.Add('n8n URL (if not auto-discovered):', False);
  N8nUrlEdit := TEdit.Create(N8nDiscoveryPage);
  N8nUrlEdit.Text := 'http://localhost:5678';

  N8nDiscoveryPage.Add('n8n API Key (optional, for credentials):', False);
  N8nApiKeyEdit := TEdit.Create(N8nDiscoveryPage);
  N8nApiKeyEdit.PasswordChar := '*';

  // Page 2: Graph Initialization
  GraphBuilderPage := CreateInputQueryWizardPage(wpSelectTasks,
    'GraphRAG Initialization',
    'Build initial knowledge graph',
    'Would you like to build the initial GraphRAG knowledge graph now? This requires your n8n instance to be running and takes 2-5 minutes. You can skip this and rebuild it later.');

  GraphBuilderPage.Add('Build GraphRAG graph from n8n nodes now:', False);
  GraphBuilderCheckbox := GraphBuilderPage.CheckListBox.Items.Objects[0];
  GraphBuilderCheckbox.Checked := True;

  // Page 3: Configuration
  ConfigPage := CreateInputQueryWizardPage(wpSelectTasks,
    'Advanced Configuration',
    'Configure installation paths and options',
    'Customize installation directories and performance settings (optional).');

  ConfigPage.Add('Graph cache directory:', False);
  GraphDirEdit := TEdit.Create(ConfigPage);
  GraphDirEdit.Text := ExpandConstant('{%APPDATA%}\n8n-mcp\graph');
end;

// Validate inputs before installation
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  case CurPageID of
    N8nDiscoveryPage.ID:
      begin
        // Validate n8n URL if provided
        if Length(N8nUrlEdit.Text) > 0 then
        begin
          if Pos('http://', N8nUrlEdit.Text) <> 1 then
          begin
            if Pos('https://', N8nUrlEdit.Text) <> 1 then
            begin
              MsgBox('Please enter a valid n8n URL starting with http:// or https://', mbError, MB_OK);
              Result := False;
            end;
          end;
        end;
      end;
    GraphBuilderPage.ID:
      begin
        // Graph builder validation
        if GraphBuilderCheckbox.Checked then
        begin
          // User wants to build graph - will be done in post-install script
        end;
      end;
  end;
end;

// Save configuration to .env file
procedure SaveConfiguration();
var
  EnvFilePath: String;
  EnvContent: String;
begin
  EnvFilePath := ExpandConstant('{app}\.env');

  EnvContent := Format(
    'NODE_ENV=production' + #13#10 +
    'MCP_MODE=stdio' + #13#10 +
    'GRAPH_DIR=%s' + #13#10 +
    'GRAPH_PYTHON=%s\runtime\python\python.exe' + #13#10 +
    'METRICS_GRAPHRAG=false' + #13#10 +
    'DEBUG_MCP=false' + #13#10 +
    'BRIDGE_CACHE_MAX=100' + #13#10 +
    'MEM_GUARD_THRESHOLD_MB=512' + #13#10,
    [GraphDirEdit.Text, ExpandConstant('{app}')]
  );

  // Add n8n configuration if provided
  if N8nAutoDiscoverCheck.Checked then
  begin
    EnvContent := EnvContent + 'N8N_AUTODISCOVER=true' + #13#10;
  end
  else if Length(N8nUrlEdit.Text) > 0 then
  begin
    EnvContent := EnvContent + Format('N8N_API_URL=%s' + #13#10, [N8nUrlEdit.Text]);
  end;

  // Add API key if provided
  if Length(N8nApiKeyEdit.Text) > 0 then
  begin
    EnvContent := EnvContent + Format('N8N_API_KEY=%s' + #13#10, [N8nApiKeyEdit.Text]);
  end;

  // Write to .env file
  SaveStringToFile(EnvFilePath, EnvContent, False);
  Log('Configuration saved to: ' + EnvFilePath);
end;

// Called after installation completes
procedure CurStepChanged(CurStep: TSetupStep);
begin
  case CurStep of
    ssPostInstall:
      begin
        // Save user configuration
        SaveConfiguration();

        // Create graph directory
        CreateDir(GraphDirEdit.Text);

        Log('Installation completed successfully');
        Log('n8n MCP Server installed at: ' + ExpandConstant('{app}'));
        Log('Configuration saved to: ' + ExpandConstant('{app}\.env'));
        Log('Documentation available at: ' + ExpandConstant('{app}\docs'));
      end;
  end;
end;

// Uninstall logic
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  case CurUninstallStep of
    usUninstall:
      begin
        Log('Uninstalling n8n MCP Server');
        Log('Note: User data in %APPDATA%\n8n-mcp will be preserved');
      end;
    usPostUninstall:
      begin
        Log('Uninstall completed');
        Log('To remove user data and cache, manually delete: %APPDATA%\n8n-mcp');
      end;
  end;
end;

[Dirs]
Name: "{app}"; Permissions: users-full
Name: "{app}\dist"
Name: "{app}\data"
Name: "{%APPDATA%}\n8n-mcp"; Permissions: users-full
Name: "{%APPDATA%}\n8n-mcp\graph"; Permissions: users-full
Name: "{%APPDATA%}\n8n-mcp\logs"; Permissions: users-full

[Messages]
BeveledLabel=n8n MCP Server v3.0.0-beta
FinishedHeadingText=Installation Complete
FinishedLabelText=n8n MCP Server has been successfully installed!%n%nNext steps:%n1. Documentation: Read the guides in the docs folder%n2. Configuration: Edit %APPDATA%\n8n-mcp\.env if needed%n3. Graph Building: Run npm run rebuild if you want to rebuild%n4. Claude Desktop: The server is ready to use%n%nFor help, visit: https://github.com/n8n-io/n8n-mcp

[CustomMessages]
NameAndVersion=%1 version %2
AdditionalIcons=Additional &icons:
CreateDesktopIcon=Create a &desktop shortcut
CreateQuickLaunchIcon=Create a &Quick Launch icon
ProgramOnTheWeb=%1 on the Web
UninstallProgram=Uninstall %1
LaunchProgram=Launch &n8n MCP Server
AssocFileExtension=&Associate %1 with %2 file extension
AssocingFileExtension=Associating %1 with %2 file extension...
AutoStartProgramGroupDescription=Startup:
AutoStartProgram=Automatically launch n8n MCP Server on startup

; Installation information messages
InstallationInfo1=n8n MCP Server is a Model Context Protocol server for n8n automation platform.
InstallationInfo2=It provides AI assistants with access to n8n nodes and GraphRAG knowledge graphs.
InstallationInfo3=For documentation and support, visit: https://github.com/n8n-io/n8n-mcp
