import { existsSync, readFileSync, watch } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { logger } from "../utils/logger";

/**
 * Lightweight n8n Version Monitor
 *
 * Automatically detects when local n8n packages are updated and triggers database rebuild.
 * Uses native Node.js fs.watch (no external dependencies).
 */
export class N8nVersionMonitor {
  private n8nPackages = [
    "n8n",
    "n8n-core",
    "n8n-workflow",
    "@n8n/n8n-nodes-langchain",
  ];

  private lastKnownVersions: Map<string, string> = new Map();
  private isRebuilding = false;
  private watcherActive = false;

  constructor() {
    this.loadLastKnownVersions();
  }

  /**
   * Check if n8n version has changed since last database build
   */
  async checkForUpdates(): Promise<{ hasUpdates: boolean; changes: string[] }> {
    const changes: string[] = [];

    for (const packageName of this.n8nPackages) {
      try {
        const currentVersion = this.getInstalledVersion(packageName);
        const lastVersion = this.lastKnownVersions.get(packageName);

        if (currentVersion && currentVersion !== lastVersion) {
          changes.push(
            `${packageName}: ${lastVersion || "none"} → ${currentVersion}`
          );
          logger.info(
            `📦 Detected ${packageName} version change: ${
              lastVersion || "none"
            } → ${currentVersion}`
          );
        }
      } catch (error) {
        // Package not installed (might be in devDependencies and not installed yet)
        logger.debug(`Package ${packageName} not found (likely devDependency)`);
      }
    }

    return {
      hasUpdates: changes.length > 0,
      changes,
    };
  }

  /**
   * Start monitoring n8n package.json files for changes
   */
  startMonitoring(autoRebuild: boolean = true): void {
    if (this.watcherActive) {
      logger.debug("Version monitor already active");
      return;
    }

    logger.info("🔍 Starting n8n version monitor (lightweight fs.watch)");

    // Watch node_modules for package.json changes
    const packagesToWatch = this.n8nPackages
      .map((pkg) => {
        const packagePath = this.getPackagePath(pkg);
        return packagePath ? join(packagePath, "package.json") : null;
      })
      .filter((p) => p !== null) as string[];

    packagesToWatch.forEach((packageJsonPath) => {
      if (existsSync(packageJsonPath)) {
        try {
          watch(packageJsonPath, (eventType) => {
            if (eventType === "change") {
              logger.info(
                `📝 Detected package.json change: ${packageJsonPath}`
              );
              if (autoRebuild) {
                this.triggerRebuild();
              }
            }
          });
          logger.debug(`👁️  Watching: ${packageJsonPath}`);
        } catch (error) {
          logger.warn(`Failed to watch ${packageJsonPath}:`, error);
        }
      }
    });

    this.watcherActive = true;
  }

  /**
   * Trigger automatic database rebuild
   */
  public async triggerRebuild(): Promise<void> {
    if (this.isRebuilding) {
      logger.debug("Rebuild already in progress, skipping...");
      return;
    }

    this.isRebuilding = true;
    logger.info(
      "🔄 Triggering automatic database rebuild due to n8n update..."
    );

    try {
      // Wait a bit for npm to finish updating files
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Run rebuild in background (don't block)
      // Use ts-node to run the rebuild script directly from source
      execSync("npx ts-node src/scripts/rebuild.ts", {
        stdio: "inherit",
        cwd: process.cwd(),
      });

      // Update stored versions
      this.saveCurrentVersions();

      logger.info("✅ Automatic rebuild completed successfully");
    } catch (error) {
      logger.error("❌ Automatic rebuild failed:", error);
    } finally {
      this.isRebuilding = false;
    }
  }

  /**
   * Get installed version of an n8n package
   */
  private getInstalledVersion(packageName: string): string | null {
    try {
      const packagePath = this.getPackagePath(packageName);
      if (!packagePath) return null;

      const packageJsonPath = join(packagePath, "package.json");
      if (!existsSync(packageJsonPath)) return null;

      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      return packageJson.version || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get path to installed package
   */
  private getPackagePath(packageName: string): string | null {
    try {
      // Try devDependencies location
      const devPath = join(process.cwd(), "node_modules", packageName);
      if (existsSync(devPath)) return devPath;

      // Try scoped package
      if (packageName.startsWith("@")) {
        const [scope, name] = packageName.split("/");
        const scopedPath = join(process.cwd(), "node_modules", scope, name);
        if (existsSync(scopedPath)) return scopedPath;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Load last known versions from version file
   */
  private loadLastKnownVersions(): void {
    try {
      const versionFilePath = join(process.cwd(), "data", ".n8n-versions");
      if (existsSync(versionFilePath)) {
        const data = readFileSync(versionFilePath, "utf-8");
        const versions = JSON.parse(data);
        this.lastKnownVersions = new Map(Object.entries(versions));
        logger.debug("📋 Loaded last known n8n versions");
      }
    } catch (error) {
      logger.debug("No previous version file found (first run)");
    }
  }

  /**
   * Save current versions to version file
   */
  private saveCurrentVersions(): void {
    try {
      const versions: Record<string, string> = {};
      this.n8nPackages.forEach((pkg) => {
        const version = this.getInstalledVersion(pkg);
        if (version) {
          versions[pkg] = version;
          this.lastKnownVersions.set(pkg, version);
        }
      });

      const versionFilePath = join(process.cwd(), "data", ".n8n-versions");
      const { writeFileSync, mkdirSync } = require("fs");

      // Ensure data directory exists
      const dataDir = join(process.cwd(), "data");
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      writeFileSync(versionFilePath, JSON.stringify(versions, null, 2));
      logger.debug("💾 Saved current n8n versions");
    } catch (error) {
      logger.warn("Failed to save version file:", error);
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    this.watcherActive = false;
    logger.info("⏹️  Stopped n8n version monitor");
  }
}
