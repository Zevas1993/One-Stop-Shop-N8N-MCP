try {
  const {
    SSEServerTransport,
  } = require("@modelcontextprotocol/sdk/server/sse.js");
  console.log("SSEServerTransport is available");
} catch (error) {
  console.error("SSEServerTransport is NOT available:", error.message);
}
