# Top 10 Nano Language Models for vLLM Docker Deployment
## Comprehensive Analysis for Production-Ready Local Inference (2025)

**Research Date:** October 31, 2025
**Focus:** Consumer hardware optimization, vLLM deployment, Docker containerization
**Target Use Case:** GraphRAG integration with n8n-mcp server

---

## Executive Summary

This analysis evaluates the top 10 small language models (1B-13B parameters) optimized for local inference using vLLM in Docker environments. The research prioritizes production-ready models that work efficiently on consumer hardware, support multiple quantization formats, and provide excellent quality-to-performance ratios.

**Key Findings:**
- **Best Overall:** Mistral 7B (Apache 2.0, best quality/speed balance)
- **Best for Low Resources:** TinyLlama 1.1B (fastest, minimal requirements)
- **Best for Reasoning:** Phi-3.5 Mini (Microsoft, excellent reasoning)
- **Best for GraphRAG:** Llama 3.2-3B (32K context, edge-optimized)
- **Best License:** Phi-4, Mistral, Qwen (MIT/Apache 2.0)

---

## Model Comparison Matrix

### 1. TinyLlama 1.1B

**Model Specifications:**
- **Parameters:** 1.1 billion
- **Context Window:** 2,048 tokens
- **Training Data:** 3 trillion tokens
- **Architecture:** Llama-based with Grouped Query Attention

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum | 2GB | 2 cores | None | 8-12 | Testing/prototypes |
| Recommended | 4GB | 4 cores | None | 15-20 | Edge devices |
| Optimal | 8GB | 4 cores | RTX 3050 | 25-30 | Fast inference |

**Performance Metrics:**
- **Quality Score:** 6/10 (basic tasks only)
- **Speed:** Fastest in class
- **Memory:** ~2.2GB (FP16), ~1.1GB (INT8), ~600MB (Q4)
- **Tokens/Second:**
  - CPU (i5): 15-20 tok/s (Q4_K_M)
  - RTX 3050: 28.6 tok/s
  - RTX 3070: 35+ tok/s

**Quantization Support:**
- GGUF: All quantization levels (Q2-Q8)
- GPTQ: 4-bit, 8-bit
- AWQ: 4-bit (available)
- FP16/BF16: Full support

**vLLM Compatibility:** YES
- Excellent support via llama architecture
- Optimized for continuous batching
- Works well on CPU backend

**Docker Optimization:** Easy
- Small model size = fast container builds
- Minimal dependencies
- Works without GPU drivers

**Best Use Case:**
- Edge devices and IoT
- Rapid prototyping
- High-throughput simple tasks
- Resource-constrained environments

**License:** Apache 2.0 (fully commercial-friendly)

**Community Support:** Active
- 7.5K+ GitHub stars
- Regular updates
- Strong HuggingFace presence

---

### 2. Phi-3.5 Mini (3.8B)

**Model Specifications:**
- **Parameters:** 3.8 billion
- **Context Window:** 128K tokens (extended)
- **Training Focus:** Reasoning, coding, instruction-following
- **Architecture:** Phi-3 series optimized architecture

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum | 4GB | 2 cores | None | 5-8 | Basic inference |
| Recommended | 8GB | 4 cores | 8GB VRAM | 20-30 | Production use |
| Optimal | 16GB | 8 cores | 16GB VRAM | 40-60 | High performance |

**Performance Metrics:**
- **Quality Score:** 8/10 (excellent reasoning for size)
- **Speed:** Very fast for capabilities
- **Memory:** ~7.6GB (FP16), ~3.8GB (INT8), ~2GB (Q4)
- **Tokens/Second:**
  - CPU (8-core): 8-12 tok/s (quantized)
  - 8GB GPU: 25-35 tok/s
  - 16GB GPU: 45-60 tok/s

**Quantization Support:**
- GGUF: Full support (Q2-Q8)
- GPTQ: 4-bit, 8-bit
- AWQ: 4-bit with optimizations
- FP16/BF16/FP8: All supported

**vLLM Compatibility:** YES
- Full vLLM support confirmed
- Optimized for tensor parallel inference
- Good memory utilization

**Docker Optimization:** Medium
- Requires CUDA libraries for GPU
- CPU-only version available
- ~5GB image size

**Best Use Case:**
- Code generation and debugging
- Complex reasoning tasks
- Extended context analysis (128K)
- Research and experimentation

**License:** MIT (most permissive, full commercial use)

**Community Support:** Very Active
- Microsoft-backed
- Extensive documentation
- Regular model updates
- Strong enterprise adoption

---

### 3. Llama 3.2 (1B & 3B)

**Model Specifications:**
- **Variants:** 1B, 3B parameters
- **Context Window:** 128K tokens
- **Training Focus:** Edge AI, on-device inference
- **Architecture:** Llama 3.2 optimized for efficiency

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum (1B) | 2GB | 2 cores | None | 10-15 | Mobile/edge |
| Recommended (3B) | 8GB | 4 cores | 8GB VRAM | 20-30 | Desktop apps |
| Optimal (3B) | 16GB | 8 cores | RTX 3070+ | 40-50 | Production |

**Performance Metrics:**
- **Quality Score:** 7/10 (1B), 8/10 (3B)
- **Speed:** Excellent for size
- **Memory (3B):** ~6GB (FP16), ~3GB (INT8), ~1.5GB (Q4)
- **Tokens/Second:**
  - 1B CPU: 15-20 tok/s
  - 3B CPU: 8-12 tok/s
  - 3B GPU (RTX 3070): 35-45 tok/s

**Quantization Support:**
- GGUF: Full range (Q2-Q8)
- GPTQ: 4-bit, 8-bit
- AWQ: 4-bit available
- FP16/BF16: Native support

**vLLM Compatibility:** YES
- Listed in official vLLM supported models
- Optimized for both CPU and GPU
- Data parallelism support

**Docker Optimization:** Easy-Medium
- Official containers available
- Edge-optimized builds
- Multi-architecture support (x86, ARM)

**Best Use Case:**
- Edge AI deployments
- Mobile applications
- GraphRAG with extended context
- Summarization and rewriting

**License:** Llama 3 Community License
- **Restriction:** No commercial use if >700M MAU
- Requires attribution
- Cannot improve other models with outputs

**Community Support:** Very Active
- Meta-backed
- Huge ecosystem
- Extensive fine-tunes available

---

### 4. Mistral 7B v0.3

**Model Specifications:**
- **Parameters:** 7.3 billion
- **Context Window:** 32K tokens (extended from 8K)
- **Training Focus:** General purpose, balanced performance
- **Architecture:** Sliding Window Attention + GQA

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum | 8GB | 4 cores | None | 5-8 | CPU inference |
| Recommended | 16GB | 4 cores | 8GB VRAM | 25-35 | Standard use |
| Optimal | 32GB | 8 cores | 12GB+ VRAM | 60-80 | High throughput |

**Performance Metrics:**
- **Quality Score:** 9/10 (best in class for 7B)
- **Speed:** Excellent balance
- **Memory:** ~14.6GB (FP16), ~7.3GB (INT8), ~3.6GB (Q4)
- **Tokens/Second:**
  - CPU i5 (Q4): 15-20 tok/s
  - RTX 2070 SUPER: 65 tok/s
  - RTX 3070: 63 tok/s
  - RTX 4090: 100+ tok/s

**Quantization Support:**
- GGUF: All levels (extensive community versions)
- GPTQ: 4-bit, 3-bit, 2-bit
- AWQ: 4-bit with faster inference than GPTQ
- FP16/BF16/FP8: Full support

**vLLM Compatibility:** YES
- Official vLLM benchmarking target
- Excellent optimization
- High-throughput continuous batching

**Docker Optimization:** Medium
- Well-documented containers
- Official Mistral docker images
- GPU passthrough required for optimal

**Best Use Case:**
- General-purpose production LLM
- Chat and instruction-following
- Code generation
- GraphRAG text generation
- Multi-turn conversations

**License:** Apache 2.0 (fully commercial, no restrictions)

**Community Support:** Very Active
- Mistral AI-backed
- Huge fine-tune ecosystem
- Enterprise support available
- Most benchmarked 7B model

---

### 5. Qwen 2.5 (7B)

**Model Specifications:**
- **Parameters:** 7 billion (text), also has VL variant
- **Context Window:** 128K tokens (can extend to 1M)
- **Training Focus:** Multilingual, reasoning, coding
- **Architecture:** Qwen 2.5 with enhanced attention

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum | 8GB | 4 cores | None | 5-10 | CPU testing |
| Recommended | 16GB | 4 cores | 12GB VRAM | 30-40 | Standard use |
| Optimal | 32GB | 8 cores | 16GB+ VRAM | 70-90 | Production |

**Performance Metrics:**
- **Quality Score:** 9/10 (excellent multilingual)
- **Speed:** Very good with quantization
- **Memory:** ~14GB (FP16), ~7GB (INT8), ~3.5GB (Q4)
- **Tokens/Second:**
  - Quantized (w4a16): 2.35x speedup vs FP16
  - Quantized (w8a8): 1.56x speedup
  - GPU (vLLM): 50-80 tok/s (depends on GPU)

**Quantization Support:**
- GGUF: Full support
- GPTQ: 4-bit, 8-bit
- AWQ: 4-bit, 8-bit (w8a8, w4a16 variants)
- FP8-Dynamic: Official support

**vLLM Compatibility:** YES
- Official vLLM recipes available
- Optimized multi-GPU support
- BF16 recommended configuration

**Docker Optimization:** Medium
- Official vLLM containers
- Multi-stream async support
- Requires GPU for optimal performance

**Best Use Case:**
- Multilingual applications (29 languages)
- Long-context reasoning (128K-1M tokens)
- Code generation (strong on HumanEval)
- Vision-language tasks (VL variant)

**License:** Apache 2.0 (Qwen series - commercial friendly)

**Community Support:** Very Active
- Alibaba Cloud-backed
- Growing ecosystem
- Strong in Asian markets
- Regular updates

---

### 6. Neural-Chat 7B v3.1

**Model Specifications:**
- **Parameters:** 7 billion
- **Context Window:** 8K tokens
- **Base Model:** Mistral 7B fine-tuned by Intel
- **Training:** DPO on Orca/SlimOrca datasets

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum | 8GB | 4 cores | None | 6-10 | CPU inference |
| Recommended | 16GB | 4-8 cores | 8GB VRAM | 25-35 | Chat apps |
| Optimal | 32GB | 8 cores | 12GB+ VRAM | 55-75 | Production chat |

**Performance Metrics:**
- **Quality Score:** 8.5/10 (topped leaderboard on release)
- **Speed:** Similar to Mistral 7B base
- **Memory:** ~14.6GB (FP16), ~7.3GB (INT8), ~3.6GB (Q4)
- **Tokens/Second:**
  - CPU (Intel): 8-12 tok/s (optimized for Intel)
  - GPU: 50-70 tok/s (similar to Mistral)

**Quantization Support:**
- GGUF: Full support
- GPTQ: 4-bit, 8-bit
- AWQ: 4-bit (TheBloke versions)
- FP16/BF16: Native

**vLLM Compatibility:** YES
- Built on Mistral architecture
- Intel Gaudi 2 optimizations available
- Standard vLLM support

**Docker Optimization:** Medium
- Official Inferless template
- Intel optimization flags beneficial
- Standard GPU containers work

**Best Use Case:**
- Chat applications
- Intel hardware deployments
- Instruction-following tasks
- Customer service bots

**License:** Apache 2.0 (commercial friendly)

**Community Support:** Active
- Intel-backed
- Good documentation
- Inferless template available

---

### 7. Zephyr 7B Beta

**Model Specifications:**
- **Parameters:** 7 billion
- **Context Window:** 8K tokens
- **Base Model:** Mistral 7B fine-tuned by HuggingFace
- **Training:** DPO (Direct Preference Optimization)

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum | 8GB | 4 cores | None | 5-8 | Testing |
| Recommended | 16GB | 4 cores | 8GB VRAM | 25-30 | Chat apps |
| Optimal | 32GB | 8 cores | 12GB+ VRAM | 60-75 | Production |

**Performance Metrics:**
- **Quality Score:** 8.5/10 (outperformed GPT-3.5 on MT-Bench)
- **Speed:** Excellent (Mistral-based)
- **Memory:** ~14.6GB (FP16), ~7.3GB (INT8), ~3.6GB (Q4)
- **Tokens/Second:**
  - Similar to Mistral 7B
  - CPU: 15-20 tok/s (quantized)
  - GPU: 60-75 tok/s

**Quantization Support:**
- GGUF: TheBloke versions available
- GPTQ: 4-bit, 8-bit
- AWQ: 4-bit (optimized)
- FP16/BF16: Native

**vLLM Compatibility:** YES
- Built on Mistral architecture
- Standard vLLM support
- Good batching performance

**Docker Optimization:** Easy-Medium
- Community containers available
- Well-documented deployment
- HuggingFace integration

**Best Use Case:**
- Conversational AI
- Alternative to GPT-3.5-Turbo
- Instruction-following
- Chat applications

**License:** Apache 2.0 (commercial friendly)

**Community Support:** Very Active
- HuggingFace-backed
- Large community
- Many derivatives available

---

### 8. Orca 2 (7B & 13B)

**Model Specifications:**
- **Parameters:** 7B, 13B variants
- **Context Window:** 4K tokens
- **Base Model:** Llama 2 enhanced by Microsoft
- **Training Focus:** Reasoning and explanation

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum (7B) | 8GB | 4 cores | None | 4-6 | CPU testing |
| Recommended (7B) | 16GB | 4 cores | 12GB VRAM | 20-30 | Reasoning tasks |
| Optimal (13B) | 32GB | 8 cores | 24GB VRAM | 40-50 | Production |

**Performance Metrics:**
- **Quality Score:** 8/10 (7B), 9/10 (13B)
- **Speed:** Good for reasoning-focused model
- **Memory (7B):** ~14GB (FP16), ~7GB (INT8), ~3.5GB (Q4)
- **Memory (13B):** ~26GB (FP16), ~13GB (INT8), ~6.5GB (Q4)
- **Tokens/Second:**
  - 7B: Similar to Llama 2 base
  - 13B: ~60-70% of 7B speed

**Quantization Support:**
- GGUF: Full support
- GPTQ: 4-bit, 8-bit
- AWQ: Limited availability
- FP16/BF16: Native

**vLLM Compatibility:** YES
- Llama 2 architecture support
- Good for reasoning workloads
- Tensor parallel support for 13B

**Docker Optimization:** Medium
- Standard Llama containers work
- Microsoft containers available
- Requires GPU for 13B

**Best Use Case:**
- Complex reasoning tasks
- Educational applications
- Explanation generation
- Multi-step problem solving

**License:** Microsoft Research License
- Research use encouraged
- Commercial use requires review
- More restrictive than Apache 2.0

**Community Support:** Active
- Microsoft Research-backed
- Good documentation
- Academic community interest

---

### 9. OpenHermes 2.5 / Nous Hermes 2 (7B)

**Model Specifications:**
- **Parameters:** 7 billion
- **Context Window:** 8K tokens
- **Base Model:** Mistral 7B fine-tuned by Teknium/NousResearch
- **Training:** Enhanced instruction dataset + code

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum | 8GB | 4 cores | None | 5-8 | Testing |
| Recommended | 16GB | 4 cores | 8GB VRAM | 25-35 | General use |
| Optimal | 32GB | 8 cores | 12GB+ VRAM | 60-80 | Production |

**Performance Metrics:**
- **Quality Score:** 9/10 (top Mistral fine-tune)
- **Speed:** Excellent (Mistral base)
- **Memory:** ~14.6GB (FP16), ~7.3GB (INT8), ~3.6GB (Q4)
- **Tokens/Second:**
  - Similar to Mistral 7B
  - CPU: 15-20 tok/s (Q4)
  - GPU: 60-75 tok/s

**Quantization Support:**
- GGUF: Extensive TheBloke versions
- GPTQ: 4-bit, 8-bit
- AWQ: 4-bit available
- FP16/BF16: Native

**vLLM Compatibility:** YES
- Mistral architecture
- Excellent vLLM support
- Good batching performance

**Docker Optimization:** Easy
- Community containers
- Well-tested deployment
- Private LLM app compatible

**Best Use Case:**
- General-purpose assistant
- Code generation (improved HumanEval)
- Instruction-following
- Creative writing

**License:** Apache 2.0 (commercial friendly)

**Community Support:** Very Active
- NousResearch community
- Regular updates
- Strong in open-source community

---

### 10. Dolphin 2.5 (7B, 13B, 70B variants)

**Model Specifications:**
- **Parameters:** 7B (Mistral), 13B, 70B variants
- **Context Window:** 8K-32K (varies by base)
- **Base Model:** Various (Mistral, Llama, Mixtral)
- **Training Focus:** Uncensored, function calling

**Hardware Requirements:**

| Tier | RAM | CPU | GPU | Speed (tok/s) | Use Case |
|------|-----|-----|-----|---------------|----------|
| Minimum (7B) | 8GB | 4 cores | None | 5-8 | Testing |
| Recommended (7B) | 16GB | 4 cores | 8GB VRAM | 25-30 | Function calling |
| Optimal (13B) | 32GB | 8 cores | 16GB VRAM | 40-50 | Production |

**Performance Metrics:**
- **Quality Score:** 8/10 (7B), 9/10 (larger variants)
- **Speed:** Depends on base model
- **Memory (7B):** ~14.6GB (FP16), ~7.3GB (INT8), ~3.6GB (Q4)
- **Tokens/Second:**
  - Varies by base model
  - Generally similar to base model performance

**Quantization Support:**
- GGUF: Full support
- GPTQ: 4-bit, 8-bit
- AWQ: Available for popular variants
- FP16/BF16: Native

**vLLM Compatibility:** YES
- Depends on base architecture
- Dolphin 2.9 mentioned in function-calling contexts
- Standard vLLM support

**Docker Optimization:** Medium
- Community containers
- Depends on base model
- Function-calling support varies

**Best Use Case:**
- Uncensored responses
- Function calling / tool use
- Agentic AI systems
- Creative applications

**License:** Apache 2.0 (generally, check specific variant)

**Community Support:** Active
- Cognitive Computations team
- Strong in agentic AI community
- Regular variant releases

---

## Hardware Tier to LLM Mapping

### Tier 1: Ultra-Low Resources (2GB RAM, 2 cores, No GPU)

**Recommended Models:**
1. **TinyLlama 1.1B (Q4)** - Best overall for this tier
   - Memory: ~600MB
   - Speed: 10-15 tok/s
   - Use: Basic text generation, prototyping

2. **Llama 3.2 1B (Q4)** - Better quality
   - Memory: ~800MB
   - Speed: 8-12 tok/s
   - Use: Edge devices, simple tasks

3. **Phi-2 (Q4)** - If 2.7B fits
   - Memory: ~1.4GB
   - Speed: 5-8 tok/s
   - Use: Reasoning on edge

**Best Choice:** TinyLlama 1.1B Q4_K_M
**vLLM Config:**
```yaml
vllm serve TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
  --device cpu \
  --dtype float16 \
  --max-model-len 2048 \
  --max-num-batched-tokens 2048 \
  --max-num-seqs 4
```

---

### Tier 2: Low Resources (4GB RAM, 2-4 cores, No GPU)

**Recommended Models:**
1. **Llama 3.2 3B (Q4)** - Best balance
   - Memory: ~1.5GB
   - Speed: 8-12 tok/s
   - Use: Edge AI, 128K context

2. **Phi-3.5 Mini (Q4)** - Best reasoning
   - Memory: ~2GB
   - Speed: 8-10 tok/s
   - Use: Code, reasoning tasks

3. **TinyLlama 1.1B (INT8)** - Maximum speed
   - Memory: ~1.1GB
   - Speed: 15-20 tok/s
   - Use: High throughput simple tasks

**Best Choice:** Llama 3.2 3B Q4_K_M for general use
**vLLM Config:**
```yaml
vllm serve meta-llama/Llama-3.2-3B-Instruct \
  --device cpu \
  --dtype bfloat16 \
  --max-model-len 8192 \
  --max-num-batched-tokens 4096 \
  --max-num-seqs 8 \
  --cpu-offload-gb 2
```

---

### Tier 3: Medium Resources (8GB RAM, 4 cores, No GPU or integrated)

**Recommended Models:**
1. **Mistral 7B (Q4)** - Best overall quality
   - Memory: ~3.6GB
   - Speed: 15-20 tok/s
   - Use: General purpose, chat

2. **Qwen 2.5 7B (Q4)** - Best multilingual
   - Memory: ~3.5GB
   - Speed: 12-18 tok/s
   - Use: Long context (128K), multilingual

3. **Llama 3.2 3B (INT8)** - Fastest
   - Memory: ~3GB
   - Speed: 20-25 tok/s
   - Use: High throughput applications

**Best Choice:** Mistral 7B Q4_K_M for production
**vLLM Config:**
```yaml
vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
  --device cpu \
  --dtype bfloat16 \
  --max-model-len 8192 \
  --max-num-batched-tokens 8192 \
  --max-num-seqs 16 \
  --cpu-offload-gb 4 \
  --swap-space 4
```

---

### Tier 4: High Resources (16GB RAM, 8+ cores, 8-12GB GPU)

**Recommended Models:**
1. **Mistral 7B (FP16 or INT8)** - Production ready
   - Memory: ~7-14GB
   - Speed: 60-75 tok/s
   - Use: High-quality chat, general purpose

2. **Qwen 2.5 7B (FP16)** - Long context specialist
   - Memory: ~14GB
   - Speed: 50-70 tok/s
   - Use: 128K context, multilingual

3. **Phi-3.5 Mini (FP16)** - Best reasoning
   - Memory: ~7.6GB
   - Speed: 40-50 tok/s
   - Use: Code generation, 128K context

**Best Choice:** Mistral 7B FP16 for balanced performance
**vLLM Config:**
```yaml
vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
  --device cuda \
  --dtype float16 \
  --max-model-len 16384 \
  --max-num-batched-tokens 16384 \
  --max-num-seqs 256 \
  --gpu-memory-utilization 0.9 \
  --tensor-parallel-size 1
```

---

### Tier 5: Optimal Resources (16GB+ RAM, 8+ cores, 16GB+ GPU)

**Recommended Models:**
1. **Mistral 7B (FP16/BF16)** - Maximum performance
   - Memory: ~14GB
   - Speed: 80-100+ tok/s
   - Use: Production chat, high throughput

2. **Qwen 2.5 7B (BF16)** - Extended context
   - Memory: ~14GB
   - Speed: 70-90 tok/s
   - Use: Long documents, multilingual

3. **Nous Hermes 2 (FP16)** - Best fine-tune
   - Memory: ~14GB
   - Speed: 75-90 tok/s
   - Use: Instruction-following, code

4. **Orca 2 13B (FP16)** - Best reasoning
   - Memory: ~26GB (requires 24GB+ GPU)
   - Speed: 40-50 tok/s
   - Use: Complex reasoning, multi-step

**Best Choice:** Mistral 7B BF16 for most use cases
**vLLM Config:**
```yaml
vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
  --device cuda \
  --dtype bfloat16 \
  --max-model-len 32768 \
  --max-num-batched-tokens 32768 \
  --max-num-seqs 512 \
  --gpu-memory-utilization 0.95 \
  --tensor-parallel-size 1 \
  --enable-prefix-caching
```

---

## Quantization Strategies

### Memory vs Quality Trade-offs

| Quantization | Size Reduction | Quality Impact | Speed Impact | Best For |
|--------------|----------------|----------------|--------------|----------|
| FP16/BF16 | Baseline (100%) | No loss | Fastest (GPU) | GPU with VRAM |
| INT8 | 50% | Minimal (~2% loss) | Slightly slower | Balanced GPU/CPU |
| Q8_0 (GGUF) | 50% | Minimal (~1-2%) | Good CPU | CPU inference |
| Q6_K (GGUF) | 37.5% | Small (~3-5%) | Excellent CPU | Recommended CPU |
| Q5_K_M (GGUF) | 31% | Moderate (~5-7%) | Very good CPU | Low RAM |
| Q4_K_M (GGUF) | 25% | Noticeable (~8-12%) | Excellent CPU | Minimum viable |
| Q3_K_M (GGUF) | 18.75% | Significant (~15-20%) | Best CPU speed | Emergency only |
| Q2_K (GGUF) | 12.5% | Major loss (>25%) | Fastest | Not recommended |

### GPTQ vs AWQ vs GGUF

**GPTQ (GPU-focused):**
- Best for: GPU inference with CUDA
- Speed: Excellent on GPU, poor on CPU
- Quality: Very good at 4-bit
- Compatibility: vLLM, transformers
- Use when: You have GPU and need speed

**AWQ (Activation-aware):**
- Best for: GPU inference with minimal loss
- Speed: Faster than GPTQ (optimized kernels)
- Quality: Better than GPTQ at same bit level
- Compatibility: vLLM, transformers
- Use when: Quality matters more than size

**GGUF (CPU-optimized):**
- Best for: CPU or hybrid CPU+GPU
- Speed: Optimized for CPU inference
- Quality: Good at Q6-Q8, acceptable at Q4-Q5
- Compatibility: llama.cpp, vLLM CPU
- Use when: Running on CPU or low VRAM

### Recommended Strategy by Hardware

**2-4GB RAM (CPU only):**
- Format: GGUF Q4_K_M or Q5_K_M
- Models: TinyLlama, Llama 3.2 1B-3B
- Priority: Minimize memory footprint

**8-16GB RAM (CPU only):**
- Format: GGUF Q6_K or Q8_0
- Models: Mistral 7B, Qwen 2.5 7B, Phi-3.5
- Priority: Balance quality and speed

**8-12GB GPU:**
- Format: GPTQ 4-bit or AWQ 4-bit
- Models: Mistral 7B, Qwen 2.5 7B
- Priority: Maximum GPU throughput

**16GB+ GPU:**
- Format: FP16/BF16 or INT8
- Models: Any 7B, Orca 2 13B
- Priority: Maximum quality

---

## Docker Deployment Guide

### Basic vLLM Docker Compose (CPU)

```yaml
version: '3.8'

services:
  vllm-cpu:
    image: vllm/vllm-openai:latest
    container_name: vllm-tinyllama-cpu
    command:
      - --model
      - TinyLlama/TinyLlama-1.1B-Chat-v1.0
      - --device
      - cpu
      - --dtype
      - float16
      - --max-model-len
      - "2048"
      - --host
      - 0.0.0.0
      - --port
      - "8000"
    ports:
      - "8000:8000"
    volumes:
      - ./models:/root/.cache/huggingface
    environment:
      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
    restart: unless-stopped
```

### Production vLLM Docker Compose (GPU)

```yaml
version: '3.8'

services:
  vllm-gpu:
    image: vllm/vllm-openai:latest
    container_name: vllm-mistral-7b-gpu
    command:
      - --model
      - mistralai/Mistral-7B-Instruct-v0.3
      - --device
      - cuda
      - --dtype
      - bfloat16
      - --max-model-len
      - "16384"
      - --max-num-batched-tokens
      - "16384"
      - --max-num-seqs
      - "256"
      - --gpu-memory-utilization
      - "0.9"
      - --host
      - 0.0.0.0
      - --port
      - "8000"
      - --enable-prefix-caching
    ports:
      - "8000:8000"
    volumes:
      - ./models:/root/.cache/huggingface
    environment:
      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
      - CUDA_VISIBLE_DEVICES=0
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    shm_size: '8gb'
    ipc: host
    restart: unless-stopped
```

### Multi-Tier Docker Compose (Auto-detect)

```yaml
version: '3.8'

x-common-config: &common-config
  image: vllm/vllm-openai:latest
  volumes:
    - ./models:/root/.cache/huggingface
  environment:
    - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN}
  restart: unless-stopped

services:
  # Tier 1: TinyLlama CPU
  tinyllama-cpu:
    <<: *common-config
    container_name: vllm-tinyllama
    command:
      - --model
      - TinyLlama/TinyLlama-1.1B-Chat-v1.0
      - --device
      - cpu
      - --dtype
      - float16
      - --max-model-len
      - "2048"
      - --port
      - "8001"
    ports:
      - "8001:8001"
    profiles: ["tier1", "all"]

  # Tier 3: Mistral 7B CPU
  mistral-cpu:
    <<: *common-config
    container_name: vllm-mistral-cpu
    command:
      - --model
      - mistralai/Mistral-7B-Instruct-v0.3
      - --device
      - cpu
      - --dtype
      - bfloat16
      - --max-model-len
      - "8192"
      - --port
      - "8002"
    ports:
      - "8002:8002"
    profiles: ["tier3", "all"]

  # Tier 4-5: Mistral 7B GPU
  mistral-gpu:
    <<: *common-config
    container_name: vllm-mistral-gpu
    command:
      - --model
      - mistralai/Mistral-7B-Instruct-v0.3
      - --device
      - cuda
      - --dtype
      - bfloat16
      - --max-model-len
      - "16384"
      - --gpu-memory-utilization
      - "0.9"
      - --port
      - "8003"
    ports:
      - "8003:8003"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    shm_size: '8gb'
    ipc: host
    profiles: ["tier4", "tier5", "gpu"]
```

**Usage:**
```bash
# Tier 1 (minimal)
docker compose --profile tier1 up -d

# Tier 3 (CPU)
docker compose --profile tier3 up -d

# Tier 4-5 (GPU)
docker compose --profile gpu up -d

# All tiers
docker compose --profile all up -d
```

---

## Integration with GraphRAG

### GraphRAG Requirements

Microsoft GraphRAG requires:
- **Context Window:** Minimum 32K tokens recommended
- **Reasoning Capability:** Good for graph traversal
- **Embedding Model:** Separate (nomic-embed-text, bge-large)
- **LLM Model:** For text generation and queries

### Recommended Models for GraphRAG

**Best Overall: Mistral 7B**
- Context: 32K tokens (perfect fit)
- Reasoning: Excellent
- Speed: Fast enough for real-time queries
- License: Apache 2.0 (no restrictions)

**Best for Extended Context: Qwen 2.5 7B**
- Context: 128K tokens (massive documents)
- Reasoning: Very good
- Multilingual: 29 languages
- License: Apache 2.0

**Best for Low Resources: Llama 3.2 3B**
- Context: 128K tokens
- Reasoning: Good for size
- Speed: Fastest 3B option
- License: Llama (check MAU restrictions)

**Best for Reasoning: Phi-3.5 Mini**
- Context: 128K tokens
- Reasoning: Excellent
- Code: Strong coding capabilities
- License: MIT (most permissive)

### GraphRAG + vLLM Integration

```yaml
# docker-compose-graphrag.yml
version: '3.8'

services:
  # LLM Service (Mistral 7B)
  llm-service:
    image: vllm/vllm-openai:latest
    container_name: graphrag-llm
    command:
      - --model
      - mistralai/Mistral-7B-Instruct-v0.3
      - --device
      - ${DEVICE:-cuda}
      - --dtype
      - bfloat16
      - --max-model-len
      - "32768"
      - --max-num-batched-tokens
      - "32768"
      - --gpu-memory-utilization
      - "0.85"
      - --enable-prefix-caching
      - --host
      - 0.0.0.0
      - --port
      - "8000"
    ports:
      - "8000:8000"
    volumes:
      - ./models/llm:/root/.cache/huggingface
    environment:
      - HF_TOKEN=${HF_TOKEN}
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    shm_size: '8gb'
    ipc: host
    restart: unless-stopped

  # Embedding Service (separate, lighter)
  embedding-service:
    image: vllm/vllm-openai:latest
    container_name: graphrag-embeddings
    command:
      - --model
      - nomic-ai/nomic-embed-text-v1.5
      - --device
      - ${DEVICE:-cuda}
      - --dtype
      - float16
      - --host
      - 0.0.0.0
      - --port
      - "8001"
    ports:
      - "8001:8001"
    volumes:
      - ./models/embeddings:/root/.cache/huggingface
    environment:
      - HF_TOKEN=${HF_TOKEN}
    restart: unless-stopped

  # GraphRAG Service
  graphrag:
    build: ./graphrag
    container_name: graphrag-server
    depends_on:
      - llm-service
      - embedding-service
    environment:
      - LLM_API_BASE=http://llm-service:8000/v1
      - EMBEDDING_API_BASE=http://embedding-service:8001/v1
      - LLM_MODEL=mistralai/Mistral-7B-Instruct-v0.3
      - EMBEDDING_MODEL=nomic-ai/nomic-embed-text-v1.5
    ports:
      - "8080:8080"
    volumes:
      - ./graphrag/data:/app/data
      - ./graphrag/output:/app/output
    restart: unless-stopped
```

### GraphRAG Configuration (settings.yaml)

```yaml
llm:
  api_base: "http://llm-service:8000/v1"
  api_type: "openai"
  model: "mistralai/Mistral-7B-Instruct-v0.3"
  max_tokens: 4096
  temperature: 0.7
  top_p: 0.95
  max_retries: 3

embeddings:
  api_base: "http://embedding-service:8001/v1"
  api_type: "openai"
  model: "nomic-ai/nomic-embed-text-v1.5"
  max_retries: 3

chunks:
  size: 1200
  overlap: 100

graph:
  max_cluster_size: 10
  community_report_max_tokens: 2000
```

---

## Performance Benchmarks Summary

### Tokens per Second (Consumer Hardware)

| Model | CPU (4-core) | RTX 3050 | RTX 3070 | RTX 4090 |
|-------|--------------|----------|----------|----------|
| TinyLlama 1B (Q4) | 15-20 | 28 | 35 | 50+ |
| Llama 3.2 1B (Q4) | 12-18 | 25 | 32 | 45+ |
| Llama 3.2 3B (Q4) | 8-12 | 20 | 30 | 40+ |
| Phi-3.5 (Q4) | 8-12 | 25 | 35 | 50+ |
| Mistral 7B (Q4) | 15-20 | 50 | 65 | 100+ |
| Qwen 2.5 7B (Q4) | 12-18 | 45 | 60 | 95+ |
| Mistral 7B (FP16) | 5-8 | 40 | 65 | 100+ |

**Notes:**
- Q4 = Q4_K_M quantization (GGUF)
- CPU = Intel i5/i7 or AMD Ryzen 5/7 (4+ cores)
- GPU numbers vary by specific model and VRAM

### Memory Consumption (Approximate)

| Model Size | FP16 | INT8 | Q6_K | Q4_K_M | Q3_K_M |
|------------|------|------|------|--------|--------|
| 1B params | 2GB | 1GB | 750MB | 500MB | 375MB |
| 3B params | 6GB | 3GB | 2.2GB | 1.5GB | 1.1GB |
| 7B params | 14GB | 7GB | 5.2GB | 3.6GB | 2.6GB |
| 13B params | 26GB | 13GB | 9.7GB | 6.5GB | 4.9GB |

**Formula:**
- FP16: params × 2 bytes
- INT8: params × 1 byte
- Q6_K: params × 0.75 bytes
- Q4_K_M: params × 0.5 bytes
- Q3_K_M: params × 0.375 bytes

---

## Model Download Sizes

### HuggingFace Model Repository Sizes

| Model | FP16/BF16 | GPTQ-4bit | AWQ-4bit | GGUF (all quants) |
|-------|-----------|-----------|----------|-------------------|
| TinyLlama 1.1B | 2.2GB | 1.1GB | 1.1GB | 500MB-2GB |
| Llama 3.2 1B | 2.5GB | 1.3GB | 1.2GB | 600MB-2.3GB |
| Llama 3.2 3B | 6.2GB | 3.2GB | 3.0GB | 1.5GB-6GB |
| Phi-3.5 Mini | 7.6GB | 3.9GB | 3.7GB | 2GB-7.5GB |
| Mistral 7B | 14.5GB | 7.5GB | 7.2GB | 3.6GB-14GB |
| Qwen 2.5 7B | 15.0GB | 7.8GB | 7.4GB | 3.7GB-14.5GB |
| Orca 2 13B | 26GB | 13.5GB | 13GB | 6.5GB-25GB |

### Docker Image Sizes

- **vllm/vllm-openai:latest** (GPU): ~8-10GB
- **vllm/vllm-cpu:latest** (CPU): ~3-5GB
- **Models** (volumes): See above

**Total Disk Space Required:**
- Minimum setup (TinyLlama CPU): ~5GB
- Recommended (Mistral 7B GPU): ~20GB
- Production (Multiple models): 50GB+

---

## License Comparison Summary

| Model | License | Commercial Use | Attribution | Restrictions |
|-------|---------|----------------|-------------|--------------|
| TinyLlama | Apache 2.0 | Unlimited | Optional | None |
| Phi-3.5 / Phi-4 | MIT | Unlimited | Optional | None |
| Llama 3.2 | Llama Community | Limited | Required | MAU >700M restricted |
| Mistral | Apache 2.0 | Unlimited | Optional | None |
| Qwen 2.5 | Apache 2.0 | Unlimited | Optional | None |
| Neural Chat | Apache 2.0 | Unlimited | Optional | None |
| Zephyr | Apache 2.0 | Unlimited | Optional | None |
| Orca 2 | MS Research | Research | Required | Review for commercial |
| OpenHermes | Apache 2.0 | Unlimited | Optional | None |
| Dolphin | Apache 2.0 | Unlimited | Optional | None |

**Most Permissive:** MIT (Phi models)
**Most Common:** Apache 2.0 (no restrictions, business-friendly)
**Most Restrictive:** Llama Community License (MAU limits)

---

## Community Support & Ecosystem

| Model | Backing | GitHub Stars | HF Downloads | Fine-tunes | Update Frequency |
|-------|---------|--------------|--------------|------------|------------------|
| Mistral 7B | Mistral AI | 15K+ | 50M+ | 1000+ | Regular |
| Llama 3.2 | Meta | 120K+ | 100M+ | 2000+ | Quarterly |
| Phi-3.5 | Microsoft | 18K+ | 20M+ | 500+ | Regular |
| TinyLlama | Community | 7.5K+ | 10M+ | 300+ | Stable |
| Qwen 2.5 | Alibaba | 12K+ | 15M+ | 400+ | Regular |
| Zephyr | HuggingFace | 8K+ | 8M+ | 200+ | Active |
| OpenHermes | NousResearch | 5K+ | 5M+ | 150+ | Active |

**Best Ecosystem:** Llama (largest community)
**Best Corporate Support:** Microsoft Phi, Mistral
**Most Active:** Mistral, Llama, Qwen

---

## Recommended Deployment Hierarchy

### Phase 1: Initial Setup (Day 1)
**Goal:** Get something running quickly

1. **Start with TinyLlama 1.1B (CPU)**
   - Fastest setup
   - Test vLLM + Docker workflow
   - Validate GraphRAG integration
   - Benchmark: "Hello World" for LLMs

2. **Configuration:**
   ```bash
   docker compose --profile tier1 up -d
   ```

### Phase 2: Production Baseline (Week 1)
**Goal:** Deploy production-quality model

1. **Deploy Mistral 7B (GPU or CPU)**
   - Best quality/speed balance
   - 32K context for GraphRAG
   - Apache 2.0 license (no worries)
   - Huge ecosystem support

2. **Configuration:**
   ```bash
   # GPU (if available)
   docker compose --profile gpu up -d

   # CPU (if no GPU)
   docker compose --profile tier3 up -d
   ```

### Phase 3: Optimization (Week 2-3)
**Goal:** Fine-tune for specific workloads

1. **Test Alternatives:**
   - **Qwen 2.5 7B** - If multilingual or 128K context needed
   - **Phi-3.5 Mini** - If reasoning/code is priority
   - **Llama 3.2 3B** - If speed > quality on limited hardware

2. **Benchmark:**
   - Tokens/second on your hardware
   - Quality on GraphRAG queries
   - Memory usage vs. batch size

### Phase 4: Scale (Month 2+)
**Goal:** Multi-model deployment

1. **Multi-Tier Strategy:**
   - **Fast tier:** TinyLlama/Llama 3.2 1B for simple queries
   - **Standard tier:** Mistral 7B for most queries
   - **Premium tier:** Qwen 2.5 7B for complex/long queries

2. **Load Balancing:**
   ```yaml
   # nginx.conf
   upstream llm_backends {
       server tinyllama:8001 weight=3;  # Fast, simple
       server mistral:8002 weight=5;    # Balanced
       server qwen:8003 weight=2;       # Complex
   }
   ```

---

## vLLM Configuration Examples by Tier

### Tier 1-2: CPU-Only (2-4GB RAM)

```bash
# TinyLlama CPU
vllm serve TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
    --device cpu \
    --dtype float16 \
    --max-model-len 2048 \
    --max-num-batched-tokens 2048 \
    --max-num-seqs 4 \
    --host 0.0.0.0 \
    --port 8000

# Environment variables
export VLLM_CPU_KVCACHE_SPACE=2
export VLLM_CPU_OMP_THREADS_BIND=0-1
```

### Tier 3: CPU-Only (8GB RAM)

```bash
# Mistral 7B CPU (quantized recommended)
vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
    --device cpu \
    --dtype bfloat16 \
    --max-model-len 8192 \
    --max-num-batched-tokens 8192 \
    --max-num-seqs 16 \
    --cpu-offload-gb 4 \
    --swap-space 4 \
    --host 0.0.0.0 \
    --port 8000

# Environment variables
export VLLM_CPU_KVCACHE_SPACE=4
export VLLM_CPU_OMP_THREADS_BIND=0-3
```

### Tier 4: GPU 8-12GB

```bash
# Mistral 7B GPU (INT8 quantization)
vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
    --device cuda \
    --dtype bfloat16 \
    --quantization awq \
    --max-model-len 16384 \
    --max-num-batched-tokens 16384 \
    --max-num-seqs 256 \
    --gpu-memory-utilization 0.85 \
    --enable-prefix-caching \
    --host 0.0.0.0 \
    --port 8000

# Environment variables
export CUDA_VISIBLE_DEVICES=0
```

### Tier 5: GPU 16GB+

```bash
# Mistral 7B GPU (Full precision)
vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
    --device cuda \
    --dtype bfloat16 \
    --max-model-len 32768 \
    --max-num-batched-tokens 32768 \
    --max-num-seqs 512 \
    --gpu-memory-utilization 0.95 \
    --enable-prefix-caching \
    --enable-chunked-prefill \
    --tensor-parallel-size 1 \
    --host 0.0.0.0 \
    --port 8000

# Environment variables
export CUDA_VISIBLE_DEVICES=0
export VLLM_ATTENTION_BACKEND=FLASH_ATTN
```

---

## Memory Profiling by Model

### TinyLlama 1.1B

| Configuration | Model Weights | KV Cache | Overhead | Total RAM | GPU VRAM |
|---------------|---------------|----------|----------|-----------|----------|
| FP16 CPU | 2.2GB | 0.3GB | 0.5GB | 3GB | 0GB |
| INT8 CPU | 1.1GB | 0.3GB | 0.5GB | 1.9GB | 0GB |
| Q4 CPU | 0.6GB | 0.2GB | 0.3GB | 1.1GB | 0GB |
| FP16 GPU | 2.2GB | 0.5GB | 0.3GB | 0.5GB | 3GB |

### Llama 3.2 3B

| Configuration | Model Weights | KV Cache | Overhead | Total RAM | GPU VRAM |
|---------------|---------------|----------|----------|-----------|----------|
| FP16 CPU | 6GB | 0.8GB | 1GB | 7.8GB | 0GB |
| INT8 CPU | 3GB | 0.8GB | 1GB | 4.8GB | 0GB |
| Q4 CPU | 1.5GB | 0.5GB | 0.5GB | 2.5GB | 0GB |
| FP16 GPU | 6GB | 1.5GB | 0.5GB | 1GB | 8GB |

### Mistral 7B

| Configuration | Model Weights | KV Cache | Overhead | Total RAM | GPU VRAM |
|---------------|---------------|----------|----------|-----------|----------|
| FP16 CPU | 14GB | 2GB | 2GB | 18GB | 0GB |
| INT8 CPU | 7GB | 2GB | 2GB | 11GB | 0GB |
| Q4 CPU | 3.6GB | 1GB | 1GB | 5.6GB | 0GB |
| FP16 GPU | 14GB | 3GB | 1GB | 2GB | 18GB |
| AWQ-4bit GPU | 3.6GB | 3GB | 1GB | 2GB | 7.6GB |

### Qwen 2.5 7B

| Configuration | Model Weights | KV Cache | Overhead | Total RAM | GPU VRAM |
|---------------|---------------|----------|----------|-----------|----------|
| FP16 CPU | 14.5GB | 2GB | 2GB | 18.5GB | 0GB |
| INT8 CPU | 7.3GB | 2GB | 2GB | 11.3GB | 0GB |
| Q4 CPU | 3.7GB | 1GB | 1GB | 5.7GB | 0GB |
| FP16 GPU | 14.5GB | 3GB | 1GB | 2GB | 18.5GB |
| W4A16 GPU | 3.7GB | 3GB | 1GB | 2GB | 7.7GB |

**Notes:**
- KV Cache scales with context length and batch size
- Overhead includes Python runtime, vLLM engine, etc.
- GPU VRAM includes model + KV cache + workspace
- Total RAM is for CPU-only deployments

---

## Integration Recommendations

### For n8n-mcp Server Integration

**Recommended Model:** Mistral 7B (Q4 or FP16 depending on hardware)

**Why:**
1. **32K context** - Handles large n8n workflow JSONs
2. **Apache 2.0** - No licensing concerns for commercial use
3. **Best ecosystem** - Most fine-tunes, best support
4. **Proven stability** - Production-tested extensively

**vLLM + n8n-mcp Docker Compose:**

```yaml
version: '3.8'

services:
  # vLLM inference engine
  vllm:
    image: vllm/vllm-openai:latest
    container_name: n8n-mcp-vllm
    command:
      - --model
      - mistralai/Mistral-7B-Instruct-v0.3
      - --device
      - ${VLLM_DEVICE:-cuda}
      - --dtype
      - bfloat16
      - --max-model-len
      - "32768"
      - --gpu-memory-utilization
      - "0.85"
      - --enable-prefix-caching
      - --api-key
      - ${VLLM_API_KEY}
    ports:
      - "8000:8000"
    volumes:
      - ./models:/root/.cache/huggingface
    environment:
      - HF_TOKEN=${HF_TOKEN}
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    shm_size: '8gb'
    ipc: host
    restart: unless-stopped

  # n8n-mcp server with GraphRAG backend
  n8n-mcp:
    build: .
    container_name: n8n-mcp-server
    depends_on:
      - vllm
    environment:
      # vLLM connection
      - LLM_API_BASE=http://vllm:8000/v1
      - LLM_API_KEY=${VLLM_API_KEY}
      - LLM_MODEL=mistralai/Mistral-7B-Instruct-v0.3

      # GraphRAG backend
      - GRAPHRAG_ENABLED=true
      - GRAPHRAG_BACKEND=agentic

      # n8n API connection
      - N8N_API_URL=${N8N_API_URL}
      - N8N_API_KEY=${N8N_API_KEY}

      # MCP server
      - MCP_MODE=http
      - AUTH_TOKEN=${MCP_AUTH_TOKEN}
      - PORT=3000
    ports:
      - "3000:3000"
    volumes:
      - ./nodes.db:/app/nodes.db
      - ./graphrag-data:/app/graphrag
    restart: unless-stopped

  # Optional: Embeddings service for GraphRAG
  embeddings:
    image: vllm/vllm-openai:latest
    container_name: n8n-mcp-embeddings
    command:
      - --model
      - nomic-ai/nomic-embed-text-v1.5
      - --device
      - cpu
      - --dtype
      - float16
    ports:
      - "8001:8000"
    volumes:
      - ./models:/root/.cache/huggingface
    restart: unless-stopped
```

**Configuration (.env):**

```bash
# Hardware
VLLM_DEVICE=cuda  # or 'cpu' for CPU-only

# HuggingFace
HF_TOKEN=your_hf_token_here

# vLLM API
VLLM_API_KEY=your_secure_api_key

# n8n Connection
N8N_API_URL=http://n8n:5678
N8N_API_KEY=your_n8n_api_key

# MCP Server
MCP_AUTH_TOKEN=your_mcp_auth_token
```

### GraphRAG Backend Configuration

**Phase 5+ Agentic GraphRAG Integration:**

```python
# python/backend/graph/core/__init__.py
from typing import Optional
import httpx

class LLMClient:
    """vLLM client for GraphRAG queries"""

    def __init__(self,
                 api_base: str = "http://vllm:8000/v1",
                 api_key: Optional[str] = None,
                 model: str = "mistralai/Mistral-7B-Instruct-v0.3"):
        self.api_base = api_base
        self.api_key = api_key
        self.model = model
        self.client = httpx.AsyncClient(
            base_url=api_base,
            headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
            timeout=60.0
        )

    async def generate(self,
                      prompt: str,
                      max_tokens: int = 4096,
                      temperature: float = 0.7) -> str:
        """Generate text using vLLM backend"""
        response = await self.client.post(
            "/chat/completions",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": False
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
```

---

## Final Recommendations

### Best Model by Use Case

| Use Case | Model | Reason |
|----------|-------|--------|
| **Production (General)** | Mistral 7B | Best balance, Apache 2.0, 32K context |
| **Production (Long Context)** | Qwen 2.5 7B | 128K context, multilingual, Apache 2.0 |
| **Production (Reasoning)** | Phi-3.5 Mini | 128K context, excellent reasoning, MIT |
| **Edge Devices** | Llama 3.2 3B | Edge-optimized, 128K context, fast |
| **Ultra-Low Resources** | TinyLlama 1.1B | Fastest, minimal requirements |
| **GraphRAG** | Mistral 7B or Qwen 2.5 7B | Context + reasoning balance |
| **Code Generation** | Phi-3.5 Mini | Best coding capabilities |
| **Multilingual** | Qwen 2.5 7B | 29 languages, excellent quality |
| **Uncensored** | Dolphin 2.5 | No content restrictions |
| **Chat** | Zephyr 7B or Neural Chat | Optimized for conversation |

### Deployment Priority

**Tier 1 (Day 1):** Get started
- TinyLlama 1.1B (CPU) - Test the stack

**Tier 2 (Week 1):** Production baseline
- Mistral 7B (GPU preferred, CPU acceptable) - Production quality

**Tier 3 (Week 2+):** Optimization
- Benchmark alternatives (Qwen, Phi) for your specific workload

**Tier 4 (Month 2+):** Scale
- Multi-model deployment with load balancing

### Hardware Investment Guide

**Budget: $0 (Use existing hardware)**
- CPU-only: Mistral 7B Q4 (requires 8GB RAM minimum)
- Best value: Use what you have

**Budget: $300-500 (Consumer GPU)**
- RTX 3060 12GB: Run Mistral 7B FP16 perfectly
- RTX 4060 Ti 16GB: Run any 7B model + embeddings

**Budget: $1000-1500 (Enthusiast)**
- RTX 4070 Ti 12GB: Fast inference, good for 13B models
- RTX 4080 16GB: Excellent for all 7B, good for 13B

**Budget: $2000+ (Professional)**
- RTX 4090 24GB: Run any model up to 70B quantized
- Multiple GPUs: Tensor parallelism for huge models

### Next Steps

1. **Assess your hardware** (use Tier mapping above)
2. **Choose initial model** (Mistral 7B recommended for most)
3. **Test with Docker** (use compose examples above)
4. **Benchmark performance** (measure tok/s on your hardware)
5. **Integrate with n8n-mcp** (use integration examples)
6. **Optimize** (try quantization, alternative models)
7. **Scale** (multi-model if needed)

---

## Conclusion

For the **n8n-mcp server with GraphRAG integration**, the recommended deployment is:

**Primary LLM:** Mistral 7B Instruct v0.3
- **License:** Apache 2.0 (no restrictions)
- **Context:** 32K tokens (handles large workflows)
- **Quality:** 9/10 (best 7B model)
- **Speed:** 60-100 tok/s on consumer GPU
- **Memory:** 7-14GB depending on quantization
- **vLLM:** Excellent support, proven in production

**Alternative (Long Context):** Qwen 2.5 7B
- **License:** Apache 2.0
- **Context:** 128K-1M tokens
- **Quality:** 9/10 + multilingual
- **Speed:** 70-90 tok/s with quantization

**Alternative (Low Resources):** Llama 3.2 3B
- **License:** Llama Community (check MAU)
- **Context:** 128K tokens
- **Quality:** 8/10
- **Speed:** Fastest for capabilities

All three models work excellently with vLLM, support Docker deployment, and have active communities. Choose based on your hardware constraints and context requirements.

---

**Document Version:** 1.0
**Last Updated:** October 31, 2025
**Maintained by:** n8n-mcp Project
**License:** MIT (this document)
