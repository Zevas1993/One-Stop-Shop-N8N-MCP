# GitHub Actions Status

This repository has several GitHub Actions workflows. Some have been temporarily disabled to prevent failing builds that cause email alerts.

## 🟢 Active Workflows

### docker-build.yml
- **Status**: Active
- **Triggers**: Push to main, tags, PRs
- **Purpose**: Builds and pushes Docker images to GitHub Container Registry
- **Requirements**: None - uses GITHUB_TOKEN

### docker-build-fast.yml  
- **Status**: Active
- **Triggers**: Manual dispatch, PRs touching Docker files
- **Purpose**: Fast AMD64-only Docker builds for testing
- **Requirements**: None - uses GITHUB_TOKEN

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

- ✅ Docker builds work properly
- ✅ No failing workflows causing email alerts
- ✅ Manual workflows available for advanced features
- ✅ All secrets are optional - core functionality works without them

This configuration prioritizes **reliability** over **automation** to prevent the email alert spam you were experiencing.