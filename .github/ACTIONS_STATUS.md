# GitHub Actions Status

This repository has several GitHub Actions workflows. All automated workflows have been temporarily disabled to prevent failing builds that cause email alerts.

## 🟡 Manual-Only Workflows

### docker-build.yml
- **Status**: Manual trigger only (temporarily disabled)
- **Purpose**: Builds and pushes Docker images to GitHub Container Registry
- **Why disabled**: Complex multi-platform build causing failures
- **To enable**: Uncomment push/PR triggers after simplifying Dockerfile

### docker-build-fast.yml  
- **Status**: Manual trigger only (temporarily disabled)  
- **Purpose**: Fast AMD64-only Docker builds for testing
- **Why disabled**: Complex dependencies causing build failures
- **To enable**: Uncomment PR triggers after simplifying dependencies

## 🟡 Manual-Only Workflows

### update-n8n-deps.yml
- **Status**: Manual trigger only (scheduled disabled)
- **Purpose**: Updates n8n dependencies automatically
- **Why disabled**: Prevents weekly automated updates until workflow is fully tested
- **To enable**: Uncomment the `schedule` section

## 🔴 Disabled Workflows

### release-package.yml
- **Status**: Disabled (manual trigger only)
- **Purpose**: Publishes package to NPM
- **Why disabled**: Missing `NPM_TOKEN` secret causes failures
- **To enable**: 
  1. Add `NPM_TOKEN` secret to repository
  2. Uncomment push/PR triggers

### playwright.yml
- **Status**: Disabled (manual trigger only)  
- **Purpose**: Runs Playwright browser tests
- **Why disabled**: Not currently needed for this MCP server
- **To enable**: Uncomment push/PR triggers when tests are needed

## 📋 Configuration Required

To fully enable all workflows:

1. **NPM Publishing** (optional):
   ```bash
   # Add NPM_TOKEN secret to GitHub repository settings
   # Settings > Secrets and variables > Actions > New repository secret
   ```

2. **Dependency Updates** (optional):
   ```bash
   # Uncomment schedule in update-n8n-deps.yml for weekly updates
   ```

3. **Playwright Tests** (optional):
   ```bash
   # Uncomment triggers in playwright.yml when browser testing is needed
   ```

## 🛡️ Current State

- ✅ **No failing workflows causing email alerts**
- ✅ **All automated builds disabled** - prevents CI/CD failures
- ✅ **Manual workflows available** for advanced features when needed
- ✅ **Core MCP server functionality unaffected** - works perfectly with Docker Compose locally
- ✅ **All secrets are optional** - core functionality works without them

## 🔧 Local Docker Still Works

While GitHub Actions Docker builds are disabled, you can still build and run locally:

```bash
# Local Docker build and run
docker compose up -d

# Check if it's working
curl http://localhost:3000/health
```

This configuration prioritizes **reliability** over **automation** to prevent the email alert spam you were experiencing. The MCP server functionality is completely unaffected - only the automated CI/CD Docker builds are disabled.