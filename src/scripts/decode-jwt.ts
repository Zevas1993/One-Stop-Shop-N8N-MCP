import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.N8N_API_KEY;

if (!token) {
  console.log("No token found in .env");
  process.exit(1);
}

try {
  const parts = token.split(".");
  if (parts.length !== 3) {
    console.log("Invalid JWT format");
    process.exit(1);
  }

  const payload = Buffer.from(parts[1], "base64").toString("utf-8");
  console.log("JWT Payload:", JSON.stringify(JSON.parse(payload), null, 2));
} catch (e) {
  console.log("Error decoding JWT:", e);
}
