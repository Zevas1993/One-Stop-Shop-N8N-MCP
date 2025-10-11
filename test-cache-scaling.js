// Quick test to verify cache scaling logic
const os = require('os');

function calculateAdaptiveMemoryLimit(configLimit) {
  const totalMemoryMB = os.totalmem() / 1024 / 1024;
  const totalMemoryGB = totalMemoryMB / 1024;
  const freeMemoryMB = os.freemem() / 1024 / 1024;

  if (configLimit) {
    console.log(`[Cache] Using configured memory limit: ${configLimit}MB`);
    return configLimit;
  }

  // Automated percentage-based scaling that increases with available RAM
  let percentage;
  let adaptiveLimit;

  if (totalMemoryGB < 2) {
    percentage = 0.005;  // 0.5% for < 2GB
    adaptiveLimit = Math.max(10, Math.floor(totalMemoryMB * percentage));
  } else if (totalMemoryGB < 4) {
    percentage = 0.01;   // 1% for 2-4GB
    adaptiveLimit = Math.floor(totalMemoryMB * percentage);
  } else if (totalMemoryGB < 8) {
    percentage = 0.02;   // 2% for 4-8GB
    adaptiveLimit = Math.floor(totalMemoryMB * percentage);
  } else if (totalMemoryGB < 16) {
    percentage = 0.03;   // 3% for 8-16GB
    adaptiveLimit = Math.floor(totalMemoryMB * percentage);
  } else if (totalMemoryGB < 32) {
    percentage = 0.05;   // 5% for 16-32GB
    adaptiveLimit = Math.floor(totalMemoryMB * percentage);
  } else if (totalMemoryGB < 64) {
    percentage = 0.07;   // 7% for 32-64GB
    adaptiveLimit = Math.floor(totalMemoryMB * percentage);
  } else if (totalMemoryGB < 128) {
    percentage = 0.10;   // 10% for 64-128GB
    adaptiveLimit = Math.floor(totalMemoryMB * percentage);
  } else {
    percentage = 0.12;   // 12% for 128GB+
    adaptiveLimit = Math.floor(totalMemoryMB * percentage);
  }

  console.log(`[Cache] Auto-scaled to ${adaptiveLimit}MB (${(percentage * 100).toFixed(1)}% of ${totalMemoryGB.toFixed(1)}GB RAM, ${freeMemoryMB.toFixed(0)}MB currently free)`);
  return adaptiveLimit;
}

// Test the function
const limit = calculateAdaptiveMemoryLimit();
console.log(`\n✅ Final cache limit: ${limit}MB`);
console.log(`📊 System: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)}GB total RAM`);
console.log(`💾 Free: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)}GB free RAM`);
