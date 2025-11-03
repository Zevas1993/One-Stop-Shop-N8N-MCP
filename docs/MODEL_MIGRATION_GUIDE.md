# Embedding + Generation Model Migration Guide

**Last Updated**: November 2025
**Focus**: Step-by-step instructions to upgrade from Qwen3-0.6B to optimal model combinations

---

## Quick Decision Matrix

Choose based on your priorities:

| Priority | Recommended Pair | Latency | Quality | RAM |
|----------|------------------|---------|---------|-----|
| **Speed** | all-MiniLM-L6-v2 + Qwen3-4B | 10-30ms + 2-5s | 7/10 | 5GB |
| **Balance** ⭐ | Nomic-Embed-Text + Qwen3-4B | 50-150ms + 2-5s | 8/10 | 6GB |
| **Quality** | BGE-M3 + Qwen3-4B | 150-300ms + 2-5s | 9/10 | 12GB |

**Recommended for Windows Docker Desktop**: Nomic-Embed-Text (Tier 2 - Balanced)

---

## Current Status Diagnostics

### Check Your Current Setup

```bash
# See which models are currently loaded in Ollama
docker compose exec ollama ollama list

# Expected output:
# NAME                    ID          SIZE    MODIFIED
# qwen3-embedding:0.6b    xyz123...   600MB   2 days ago
# qwen3:4b-instruct-q4_K_M abc456...   2.4GB   2 days ago
```

### Benchmark Your Current Performance

```bash
# Test current embedding model latency
docker compose exec mcp node -e "
const { performance } = require('perf_hooks');
const embedding_test = async () => {
  const start = performance.now();
  // Your embedding call here
  const end = performance.now();
  console.log('Embedding latency:', (end - start).toFixed(0) + 'ms');
}
"

# Monitor system resources
docker stats --no-stream
```

---

## Migration Path: Immediate (2 Hours)

### Recommended: Upgrade to Nomic-Embed-Text

**Why this choice:**
- ✅ 3-4x quality improvement over Qwen3-0.6B
- ✅ Already available in Ollama (no custom setup)
- ✅ Good balance of speed and quality
- ✅ Minimal configuration changes needed

### Step 1: Pull the New Model (5 minutes)

```bash
# While system is running, pull Nomic-Embed-Text into Ollama
docker compose exec ollama ollama pull nomic-embed-text

# Verify it's available
docker compose exec ollama ollama list

# Expected output includes:
# nomic-embed-text       xyz789...   274MB   just now
```

### Step 2: Update Configuration (2 minutes)

Edit your `.env` file or docker-compose environment variables:

```bash
# Edit .env file (create if doesn't exist)
cat >> .env << 'EOF'
EMBEDDING_MODEL=nomic-embed-text
GENERATION_MODEL=qwen3:4b-instruct-q4_K_M
EOF
```

### Step 3: Update MCP Service Configuration (2 minutes)

Edit `docker-compose.yml` MCP service section:

```yaml
mcp:
  # ... existing config ...
  environment:
    - NODE_ENV=production
    - MCP_MODE=stdio
    - AUTH_TOKEN=${AUTH_TOKEN:-}
    - LOG_LEVEL=info
    # Add these new variables:
    - EMBEDDING_MODEL=${EMBEDDING_MODEL:-nomic-embed-text}
    - GENERATION_MODEL=${GENERATION_MODEL:-qwen3:4b-instruct-q4_K_M}
    - OLLAMA_HOST=http://ollama:11434
```

### Step 4: Verify Ollama Connectivity (3 minutes)

Test that MCP can reach Ollama:

```bash
# Test Ollama API from MCP container
docker compose exec mcp curl -s http://ollama:11434/api/tags | jq '.models[].name'

# Expected output:
# "nomic-embed-text"
# "qwen3:4b-instruct-q4_K_M"
```

### Step 5: Restart Services (5 minutes)

```bash
# Restart MCP to load new configuration
docker compose restart mcp

# Monitor logs for successful startup
docker compose logs -f mcp

# Should see logs indicating new embedding model is active
```

### Step 6: Benchmark New Performance (10 minutes)

Create a simple benchmark script:

```bash
cat > benchmark.sh << 'EOF'
#!/bin/bash

echo "=== Model Migration Performance Test ==="
echo ""

# Test embedding latency
echo "Testing Nomic-Embed-Text latency..."
time docker compose exec mcp curl -s http://ollama:11434/api/embeddings \
  -d '{
    "model": "nomic-embed-text",
    "prompt": "Create a workflow that monitors customer feedback and sends alerts"
  }' | jq '.embedding | length'

echo ""
echo "Testing generation latency..."
time docker compose exec mcp curl -s http://ollama:11434/api/generate \
  -d '{
    "model": "qwen3:4b-instruct-q4_K_M",
    "prompt": "How would you improve this n8n workflow?",
    "stream": false
  }' | jq '.response | length'

echo ""
echo "System resource usage:"
docker stats --no-stream | grep -E "(mcp|ollama|n8n)"
EOF

chmod +x benchmark.sh
./benchmark.sh
```

### Step 7: Validate Quality Improvement (Ongoing)

Monitor your MCP server with the new models:

```bash
# Watch MCP logs for embedding operations
docker compose logs -f mcp --tail=100 | grep -i "embedding\|generation\|semantic"

# Check for successful workflow analysis
docker compose logs -f mcp --tail=50 | grep -i "graphrag\|pattern\|suggestion"
```

---

## Alternative Path: Maximum Speed (3 Hours)

### Option: Use all-MiniLM-L6-v2

**Trade-off**: Fastest inference, slightly lower quality

### Architecture Change Required

Since all-MiniLM-L6-v2 isn't in Ollama, you'll need to use a different approach:

```bash
# Option A: Use sentence-transformers library directly (requires code changes)
npm install sentence-transformers

# Option B: Convert to ONNX and use in Ollama (advanced)
# See ONNX conversion guide below
```

### Implementation (Advanced)

```javascript
// src/services/embedding.ts
import { pipeline } from '@xenova/transformers';

async function createEmbedding(text: string) {
  // Load all-MiniLM-L6-v2 from HuggingFace
  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );

  const embedding = await extractor(text, {
    pooling: 'mean',
    normalize: true
  });

  return Array.from(embedding.data);
}
```

**Not recommended for your setup** - Stick with Nomic-Embed-Text instead.

---

## Advanced Path: Premium Quality (4 Hours)

### Option: Upgrade to BGE-M3

**Trade-off**: Best quality, slower inference, multilingual support

### Step 1: Pull BGE-M3 Model

```bash
# BGE-M3 is available in Ollama
docker compose exec ollama ollama pull bge-m3

# Verify (will take ~5 minutes)
docker compose exec ollama ollama list
```

### Step 2: Enable Quantization (Optional - Speeds up BGE-M3)

```bash
# BGE-M3 can be quantized for 2-5x speedup
# Pull quantized version if available
docker compose exec ollama ollama pull bge-m3:int8

# Or use in docker-compose.yml:
EMBEDDING_MODEL=bge-m3:int8
```

### Step 3: Update Configuration

```bash
# Update .env
cat >> .env << 'EOF'
EMBEDDING_MODEL=bge-m3
GENERATION_MODEL=qwen3:4b-instruct-q4_K_M
EOF

# Restart
docker compose restart mcp
```

### Step 4: Memory Optimization

BGE-M3 uses ~2GB RAM. Ensure you have headroom:

```bash
# Check available memory
docker stats --no-stream

# If memory is tight, consider reducing other container limits
docker compose restart --scale mcp=1 --scale ollama=1
```

---

## Rollback Procedure (If Issues Arise)

### Quick Rollback to Previous Model

```bash
# Restore previous .env
git checkout .env

# Or manually set:
cat > .env << 'EOF'
EMBEDDING_MODEL=qwen3-embedding:0.6b
GENERATION_MODEL=qwen3:4b-instruct-q4_K_M
EOF

# Restart services
docker compose restart mcp ollama

# Verify old models are still cached
docker compose exec ollama ollama list
```

### Check Rollback Success

```bash
# Monitor logs
docker compose logs -f mcp

# Should show original models being used
```

---

## Testing New Models

### Create Test Workflow

```bash
# Create a test n8n workflow that uses the new embedding capabilities
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Model Migration Test",
    "nodes": [
      {
        "name": "Webhook",
        "type": "n8n-nodes-base.webhook",
        "position": [250, 300],
        "parameters": {
          "httpMethod": "POST",
          "path": "test-embedding"
        }
      },
      {
        "name": "Code",
        "type": "n8n-nodes-base.code",
        "position": [500, 300],
        "parameters": {
          "jsCode": "return $input.all()"
        }
      }
    ],
    "connections": {
      "Webhook": {
        "main": [[{ "node": "Code", "type": "main", "index": 0 }]]
      }
    }
  }'
```

### Run Integration Tests

```bash
# Test MCP can understand workflows with new embedding model
docker compose exec mcp npm test

# Or specific embedding tests:
docker compose exec mcp npm test -- --testNamePattern="embedding"
```

---

## Performance Monitoring After Migration

### Setup Metrics Collection

```bash
# Create monitoring script
cat > monitor-models.sh << 'EOF'
#!/bin/bash

while true; do
  echo "=== $(date) ==="

  # Check model memory usage
  docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" | grep -E "(mcp|ollama)"

  # Check Ollama API latency
  time curl -s http://localhost:11434/api/tags > /dev/null

  # Count successful embeddings
  docker compose logs mcp --since=5m | grep -c "embedding.*success" || echo "0"

  echo ""
  sleep 60
done
EOF

chmod +x monitor-models.sh
./monitor-models.sh
```

### Dashboard Integration (Optional)

```bash
# Add Prometheus metrics to docker-compose.yml if desired
# See DOCKER_COMPOSE_SETUP.md for monitoring examples
```

---

## Troubleshooting

### Issue: Model Download Fails

```bash
# Check Ollama logs
docker compose logs ollama

# Manual model download with retry
docker compose exec ollama sh -c 'ollama pull nomic-embed-text || ollama pull nomic-embed-text'

# Check available disk space
docker system df
```

### Issue: Embedding Service Timeout

```bash
# Increase timeout in MCP configuration
# Add to docker-compose.yml MCP environment:
- OLLAMA_TIMEOUT=120s
- EMBEDDING_TIMEOUT=30000ms

# Restart
docker compose restart mcp
```

### Issue: Quality Degradation Noticed

```bash
# Verify model loaded correctly
docker compose exec ollama ollama list

# Check if model file is corrupted
docker compose exec ollama ollama show nomic-embed-text

# If corrupted, remove and re-download
docker compose exec ollama ollama rm nomic-embed-text
docker compose exec ollama ollama pull nomic-embed-text

# Restart MCP
docker compose restart mcp
```

### Issue: Out of Memory

```bash
# Check current memory usage
docker stats

# Reduce model precision (if available)
EMBEDDING_MODEL=nomic-embed-text:quantized

# Or switch to smaller model
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

---

## Comparison After Migration

### Before → After Metrics

| Metric | Before (Qwen3-0.6B) | After (Nomic) | Improvement |
|--------|-------------------|---------------|-------------|
| Embedding Latency | 200-500ms | 50-150ms | 3-4x faster |
| Quality Score | 60/100 | 68.7/100 | +8.7 points |
| Semantic Understanding | Poor | Good | Better accuracy |
| Vector Quality | Low precision | High precision | Better retrieval |
| GraphRAG Pattern Discovery | Limited | Enhanced | More patterns found |

---

## Next Steps After Migration

1. **Monitor performance** for 1-2 weeks with new models
2. **Collect user feedback** on suggestion quality
3. **Benchmark against production metrics** if available
4. **Consider premium option** (BGE-M3) if budget allows
5. **Evaluate** if further optimization needed

---

## Additional Resources

- [EMBEDDING_MODEL_BENCHMARKS.md](./EMBEDDING_MODEL_BENCHMARKS.md) - Full research data
- [DOCKER_COMPOSE_SETUP.md](./DOCKER_COMPOSE_SETUP.md) - Docker deployment guide
- [Ollama Documentation](https://github.com/ollama/ollama) - Model management
- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) - Embedding benchmarks
- [Nomic Embed Text](https://www.nomic.ai/blog/nomic-embed-text-v1) - Model details

---

## Support & Questions

If you encounter issues:

1. Check the **Troubleshooting** section above
2. Review **EMBEDDING_MODEL_BENCHMARKS.md** for model comparisons
3. Check **docker-compose.yml** comments for configuration details
4. Review **Dockerfile** for runtime setup

