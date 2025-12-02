import { N8nVersionMonitor } from "../services/n8n-version-monitor";
import { logger } from "../utils/logger";

async function verify() {
  console.log("Verifying N8nVersionMonitor...");
  const monitor = new N8nVersionMonitor();

  console.log("Checking for updates...");
  const result = await monitor.checkForUpdates();

  console.log("Has updates:", result.hasUpdates);
  console.log("Changes:", result.changes);

  if (result.hasUpdates) {
    console.log("SUCCESS: Version change detected.");
  } else {
    console.log(
      "NOTE: No version change detected (database might be up to date)."
    );
  }
}

verify().catch(console.error);
