import { GraphPopulationService } from "../services/graph-population-service";
import { logger } from "../utils/logger";

async function testGraphPopulation() {
  try {
    logger.info("Starting Graph Population Test...");

    const service = new GraphPopulationService();

    // Test with force=true to ensure we process something
    // In a real test we might want to mock the dependencies, but here we want to see if it runs
    const stats = await service.populate(true);

    console.log("Population Stats:", JSON.stringify(stats, null, 2));

    if (stats.errors.length > 0) {
      console.error("Errors encountered:", stats.errors);
      process.exit(1);
    }

    console.log("Test passed!");
    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testGraphPopulation();
