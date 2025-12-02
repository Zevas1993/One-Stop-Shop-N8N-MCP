const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const envBackupPath = path.join(rootDir, ".env.backup");
const nodeModulesPath = path.join(rootDir, "node_modules");
const packageLockPath = path.join(rootDir, "package-lock.json");

console.log("🚀 Starting n8n Clean Reinstall Fix...");

// 1. Backup .env
if (fs.existsSync(envPath)) {
  console.log(`\n📦 Backing up .env to .env.backup...`);
  fs.copyFileSync(envPath, envBackupPath);
  console.log("✅ Backup complete.");
} else {
  console.log("\n⚠️ .env file not found, skipping backup.");
}

// 2. Clean
console.log("\n🧹 Cleaning up old dependencies...");
try {
  if (fs.existsSync(nodeModulesPath)) {
    console.log("   Removing node_modules (this may take a moment)...");
    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
  }
  if (fs.existsSync(packageLockPath)) {
    console.log("   Removing package-lock.json...");
    fs.rmSync(packageLockPath);
  }
  console.log("✅ Cleanup complete.");
} catch (error) {
  console.error("❌ Cleanup failed:", error.message);
  process.exit(1);
}

// 3. Install
console.log("\n📥 Installing dependencies (npm install)...");
try {
  execSync("npm install", { cwd: rootDir, stdio: "inherit" });
  console.log("✅ Installation complete.");
} catch (error) {
  console.error("❌ Installation failed:", error.message);
  process.exit(1);
}

// 4. Verify
console.log("\n🔍 Verifying n8n version...");
try {
  const output = execSync("npx n8n --version", {
    cwd: rootDir,
    encoding: "utf8",
  });
  console.log(`✅ n8n version: ${output.trim()}`);
  console.log(
    "\n✨ Fix completed successfully! You can now try running n8n again."
  );
} catch (error) {
  console.error("❌ Verification failed:", error.message);
  console.log("\n⚠️  Note: n8n might still work, but version check failed.");
}
