import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "../../.env");

const content = `# ============================================
# n8n MCP Server Configuration
# ============================================
MCP_MODE=full
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
AUTH_TOKEN=your-secure-token-here
USE_FIXED_HTTP=true

# ============================================
# Dual Nano LLM Configuration (REAL MODELS)
# Using Ollama for inference - Already installed
# ============================================

# Embedding Model: Nomic-Embed-Text (Best available in Ollama)
# Excellent multilingual embeddings, 274MB, lightweight
# Running via Ollama on port 11434
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_BASE_URL=http://localhost:11434
EMBEDDING_SERVER_PORT=11434

# Generation Model: Nemotron Nano 4B (TRUE NANO - 4.8GB)
# Excellent tool calling, instruction-tuned for agentic tasks
# Nvidia's optimized nano model - perfect for n8n workflows
GENERATION_MODEL=avil/nvidia-llama-3.1-nemotron-nano-4b-v1.1-thinking
GENERATION_BASE_URL=http://localhost:11434
GENERATION_SERVER_PORT=11434

# Ollama Configuration
# Ollama is running locally with auto-inference
OLLAMA_HOST=http://localhost:11434
GENERATION_DTYPE=float16
GENERATION_MAX_TOKENS=2048
GENERATION_ENFORCE_EAGER=false

# Database Configuration
NODE_DB_PATH=/app/data/nodes.db
REBUILD_ON_START=false

# ============================================
# n8n API Configuration (connects to your local n8n)
# ============================================
N8N_API_URL=http://localhost:5678
N8N_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyNjRmZjY5Ni04MzkyLTRkZjEtYjQ0My04OTIwNzcwZjIzN2QiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzQ5NDkwMjM2fQ.GcqGgIM5rDZEwLnvvsYuWmIvjZ_ppn9qr4Kem_KRw7Q

# Authentication for n8n browser access
N8N_USERNAME=chrisboyd1993@gmail.com
N8N_PASSWORD=AlastorB2024!@#
`;

fs.writeFileSync(envPath, content);
console.log("✅ .env updated successfully");
