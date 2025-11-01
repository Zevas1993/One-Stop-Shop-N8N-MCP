# Comprehensive Nano LLM & Embedding Models Research (October 2025)

**Research Date:** October 31, 2025
**Focus:** Models under 4B parameters for GraphRAG, multi-agent systems, and edge deployment

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Embedding Models (< 500M Parameters)](#embedding-models--500m-parameters)
3. [Nano LLMs for Generation (1B-4B Range)](#nano-llms-for-generation-1b-4b-range)
4. [Hardware Tier Recommendations](#hardware-tier-recommendations)
5. [Best Pairing Recommendations](#best-pairing-recommendations)
6. [vLLM Compatibility & Deployment](#vllm-compatibility--deployment)
7. [License Comparison](#license-comparison)
8. [GraphRAG-Specific Recommendations](#graphrag-specific-recommendations)

---

## Executive Summary

### Key Findings (October 2025)

**Top Embedding Models:**
- **EmbeddingGemma 308M** - SOTA for on-device, #1 MTEB ranking under 500M parameters
- **Nomic-Embed-Text v1.5** - Best accuracy, 8K context, multiple quantization options
- **BGE-small-en-v1.5** - Excellent balance, 384 dimensions, 512 token context
- **all-MiniLM-L6-v2** - Fastest, 22M parameters, ideal for speed-critical applications

**Top Nano LLMs:**
- **Llama 3.2 1B/3B** - Best overall, 128K context, quantized versions 2-4x faster
- **Nemotron Nano 4B** - Best reasoning, 128K context, controllable System 1/2 reasoning
- **DeepSeek-R1-Distill-Qwen 1.5B/7B** - Best reasoning capability, beats GPT-4o on math
- **Phi-3.5 Mini 3.8B** - Best for resource-constrained, 128K context, FP8 quantization
- **Qwen 2.5 1B/3B** - Excellent vision-language capabilities, vLLM optimized
- **SmolLM 1.7B** - Best training corpus quality, strong reasoning for size

**Critical Insight:** The landscape has shifted dramatically with quantized models achieving 2-4x speedups and 56% size reductions while maintaining quality.

---

## Embedding Models (< 500M Parameters)

### 1. EmbeddingGemma 308M (Google) - **RECOMMENDED for GraphRAG**

**Specifications:**
- **Parameters:** 308 million (T5Gemma-based architecture)
- **Dimensions:** 768 (with MRL support for 512, 256, 128)
- **Context Length:** 2,048 tokens
- **Languages:** 100+ languages (multilingual)
- **License:** Apache 2.0

**Performance:**
- #1 MTEB ranking for models under 500M parameters
- Rivals models nearly 2x its size
- Excellent for cross-lingual retrieval and semantic search

**Quantization:**
- Runs on < 200MB RAM with quantization
- Low latency: < 22ms on EdgeTPU

**Hardware Requirements:**
- **2GB Tier:** ✅ Fully supported with quantization (~200MB)
- **4GB Tier:** ✅ Optimal performance
- **8GB+ Tier:** ✅ Can run multiple instances

**Use Cases:**
- On-device RAG applications
- Knowledge graph query embeddings
- Semantic routing in multi-agent systems
- Mobile/edge deployment

**Deployment:**
```python
# Via Sentence Transformers
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('google/embeddinggemma-300m')
```

**Verdict:** **Best choice for GraphRAG knowledge graph operations** - Optimal balance of size, quality, and multilingual support.

---

### 2. Nomic-Embed-Text v1.5 - **RECOMMENDED for High Accuracy**

**Specifications:**
- **Parameters:** ~138M (estimated from model size)
- **Dimensions:** 768
- **Context Length:** 8,192 tokens (extended context)
- **Languages:** English-focused
- **License:** Apache 2.0

**Performance:**
- Surpasses OpenAI text-embedding-ada-002 and text-embedding-3-small
- Excellent for short and long context tasks
- Superior RAG performance

**Quantization Options (GGUF):**
- **F32:** 262 MiB (full precision, MSE 6.08e-11)
- **F16:** ~131 MiB
- **Q8_0:** ~70 MiB
- **Q4_K_M:** ~48 MiB (recommended balance)
- **Q2_K:** ~30 MiB (minimum viable)

**Hardware Requirements:**
- **2GB Tier:** ⚠️ Only with Q2_K/Q4_K quantization
- **4GB Tier:** ✅ Recommended (Q4_K_M or higher)
- **8GB+ Tier:** ✅ Optimal (F32/F16 for best quality)

**Use Cases:**
- RAG applications requiring high accuracy
- Long-document semantic search
- Applications tolerating English-only

**Deployment:**
```bash
# Via Ollama
ollama pull nomic-embed-text:v1.5

# Via llama.cpp (GGUF)
# Compatible with commit 4524290e8+ (2/15/2024)
```

**Verdict:** **Best for accuracy-critical applications** - Extended 8K context is ideal for long documents.

---

### 3. BGE-small-en-v1.5 (BAAI) - **RECOMMENDED for Balanced Performance**

**Specifications:**
- **Parameters:** ~33M (estimated)
- **Dimensions:** 384
- **Context Length:** 512 tokens
- **Languages:** English
- **License:** MIT

**Performance:**
- Part of BAAI's FlagEmbedding series
- Improved retrieval without instruction prefix requirement
- Similarity distribution in [0.6, 1] range (contrastive learning, temp=0.01)

**Quantization:**
- Standard transformer quantization available
- Lightweight even at full precision

**Hardware Requirements:**
- **2GB Tier:** ✅ Fully supported
- **4GB Tier:** ✅ Optimal
- **8GB+ Tier:** ✅ Can run many instances

**Use Cases:**
- General-purpose embeddings
- Retrieval systems
- Semantic search
- Document clustering

**Deployment:**
```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('BAAI/bge-small-en-v1.5')
```

**Verdict:** **Best balanced option** - Small, efficient, widely compatible.

---

### 4. all-MiniLM-L6-v2 (Sentence Transformers) - **RECOMMENDED for Speed**

**Specifications:**
- **Parameters:** 22.7 million
- **Dimensions:** 384
- **Context Length:** 256 word pieces (128 token training)
- **Languages:** English
- **License:** Apache 2.0

**Architecture:**
- 6 transformer layers
- Built on MiniLM-L6-H384-uncased
- Contrastive learning on 1B+ sentence pairs

**Training Details:**
- TPU v3-8 hardware
- Batch size: 1,024
- 100k steps
- AdamW optimizer (lr=2e-5)

**Performance:**
- Millisecond inference time
- Ideal for real-time applications
- Best speed-to-quality ratio for size

**Hardware Requirements:**
- **2GB Tier:** ✅ Fully supported (~80MB)
- **4GB Tier:** ✅ Optimal
- **8GB+ Tier:** ✅ Multiple instances possible

**Use Cases:**
- Real-time semantic search
- Speed-critical applications
- Mobile/edge deployment
- High-throughput embedding generation

**Deployment:**
```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
```

**Verdict:** **Best for speed** - Only 22M parameters, millisecond inference, perfect for high-throughput needs.

---

### 5. E5-small-v2 (Microsoft) - **Recommended Alternative**

**Specifications:**
- **Parameters:** ~33M (12 layers)
- **Dimensions:** 384
- **Context Length:** 512 tokens
- **Languages:** English only
- **License:** MIT

**Features:**
- Requires "query:" or "passage:" prefix
- L2 normalized embeddings
- Weakly-supervised contrastive pre-training
- Excellent for messy data and short queries

**Hardware Requirements:**
- **2GB Tier:** ✅ Fully supported
- **4GB Tier:** ✅ Optimal
- **8GB+ Tier:** ✅ Can run multiple instances

**Use Cases:**
- Passage retrieval
- Question answering
- Content recommendation
- Asymmetric and symmetric tasks

**Verdict:** **Solid Microsoft alternative** - Good for Microsoft ecosystem integration.

---

### Embedding Models Comparison Table

| Model | Params | Dims | Context | VRAM (Quant) | Speed | Quality | License | Best For |
|-------|--------|------|---------|--------------|-------|---------|---------|----------|
| **EmbeddingGemma** | 308M | 768 | 2K | 200MB | Fast | ⭐⭐⭐⭐⭐ | Apache 2.0 | GraphRAG, Multilingual |
| **Nomic-Embed v1.5** | ~138M | 768 | 8K | 48-262MB | Medium | ⭐⭐⭐⭐⭐ | Apache 2.0 | Long docs, Accuracy |
| **BGE-small-en-v1.5** | ~33M | 384 | 512 | <50MB | Fast | ⭐⭐⭐⭐ | MIT | Balanced use |
| **all-MiniLM-L6-v2** | 22M | 384 | 256 | 80MB | ⚡ Fastest | ⭐⭐⭐⭐ | Apache 2.0 | Speed critical |
| **E5-small-v2** | ~33M | 384 | 512 | <50MB | Fast | ⭐⭐⭐⭐ | MIT | MS ecosystem |

---

## Nano LLMs for Generation (1B-4B Range)

### 1. Llama 3.2 1B/3B (Meta) - **RECOMMENDED Overall**

**Specifications:**

**Llama 3.2 1B:**
- **Parameters:** 1.23 billion
- **Context Length:** 128K tokens
- **Architecture:** Decoder-only transformer
- **Languages:** Multilingual

**Llama 3.2 3B:**
- **Parameters:** 3 billion
- **Context Length:** 128K tokens
- **Architecture:** Decoder-only transformer
- **Languages:** Multilingual

**Quantization Methods:**
- **QAT+LoRA:** Prioritizes accuracy
- **SpinQuant:** Prioritizes portability
- **Quantization Scheme:**
  - Weights: 4-bit groupwise (group size 32) for all transformer blocks
  - Activations: 8-bit per-token dynamic quantization
  - Classification layer: 8-bit per-channel
  - Embedding: 8-bit per-channel

**Performance Improvements:**
- **2-4x speedup** in inference
- **56% reduction** in model size (BF16 → quantized)
- **41% reduction** in memory usage

**Hardware Requirements:**
- **2GB Tier:** ⚠️ 1B model only, heavily quantized (Q4_K)
- **4GB Tier:** ✅ 1B optimal, 3B with Q4 quantization
- **8GB Tier:** ✅ 3B optimal performance
- **16GB Tier:** ✅ Both models, multiple instances possible

**Deployment:**
- **Day-one support:** Qualcomm, MediaTek hardware
- **Optimized for:** Arm processors
- **Target devices:** Phones, tablets, edge devices, smart glasses

**vLLM Compatibility:** ✅ Full support

**License:** Llama 3.2 Community License (permissive for most use cases)

**Use Cases:**
- Edge AI applications
- Mobile deployment
- Multi-agent systems
- RAG on resource-constrained devices

**Verdict:** **Best overall nano LLM** - Industry-leading 128K context, extensive quantization support, massive ecosystem.

---

### 2. Nemotron Nano 4B (NVIDIA) - **RECOMMENDED for Reasoning**

**Model:** Llama 3.1 Nemotron Nano 4B v1.1

**Specifications:**
- **Parameters:** 4 billion
- **Context Length:** 128K tokens
- **Architecture:** Derived from Llama 3.1 8B via LLM compression
- **Base Model:** nvidia/Llama-3.1-Minitron-4B-Width-Base

**Key Features:**
- **Controllable System 1/System 2 reasoning**
- **50% greater throughput** vs 8B models
- **Higher accuracy** than SOTA models up to 8B
- Tool calling support with parser in HF repo

**Training:**
- Compressed using width pruning from Llama 3.1 8B
- Optimized for edge deployment

**vLLM Support:**
- **Minimum version:** vLLM v0.6.6+
- **Recommended params:** `--max-model-len 131072 --tensor-parallel-size 1 --gpu-memory-utilization 0.95`
- **Tool calling:** Built-in Jinja chat template

**Hardware Requirements:**
- **2GB Tier:** ❌ Not recommended
- **4GB Tier:** ⚠️ Heavily quantized only (Q4)
- **8GB Tier:** ✅ Recommended minimum (Q4_K_M)
- **16GB Tier:** ✅ Optimal (FP16/INT8)
- **GPU:** NVIDIA Jetson, RTX GPUs optimal

**License:** Llama 3.1 Community License

**Use Cases:**
- Reasoning-heavy tasks
- Scientific applications
- Edge AI with NVIDIA hardware
- Multi-agent systems requiring controllable reasoning

**Verdict:** **Best for reasoning tasks** - Unique System 1/2 reasoning modes, 50% faster than 8B alternatives.

---

### 3. DeepSeek-R1-Distill-Qwen 1.5B/7B - **RECOMMENDED for Advanced Reasoning**

**Available Variants:**
- **1.5B** (DeepSeek-R1-Distill-Qwen-1.5B)
- **7B** (DeepSeek-R1-Distill-Qwen-7B)
- Also: 8B, 14B, 32B, 70B variants

**Specifications:**
- **Base Models:** Qwen 2.5 series
- **Fine-tuning Data:** 800k curated samples from DeepSeek-R1
  - 600k reasoning samples
  - 200k non-reasoning samples
- **Reasoning Format:** `<think>...</think>` tokens for chain-of-thought

**Performance Benchmarks:**

**1.5B Model:**
- **AIME 2024:** 28.9% (beats GPT-4o and Claude 3.5 Sonnet)
- **MATH-500:** 83.9%

**7B Model:**
- **AIME 2024:** 55.5% (surpasses QwQ-32B-Preview)
- Comparable to OpenAI o1-mini on reasoning benchmarks

**Distillation Approach:**
- Fine-tunes smaller dense models (Llama3, Qwen2.5)
- Uses high-quality generations from 671B DeepSeek-R1
- Stream-of-consciousness reasoning style

**Hardware Requirements:**

**1.5B Variant:**
- **2GB Tier:** ⚠️ Heavily quantized (Q4_K)
- **4GB Tier:** ✅ Recommended (Q4_K_M to Q8)
- **8GB+ Tier:** ✅ Optimal (FP16)

**7B Variant:**
- **4GB Tier:** ❌ Not viable
- **8GB Tier:** ⚠️ Heavily quantized (Q4_K)
- **16GB Tier:** ✅ Recommended (Q8/FP16)

**vLLM Compatibility:** ✅ Full support (Qwen architecture)

**License:** Apache 2.0 (via Qwen)

**Use Cases:**
- Mathematical reasoning
- Scientific problem-solving
- Complex multi-step reasoning
- Educational applications
- Coding challenges

**Verdict:** **Best reasoning capability** - Beats GPT-4o on math benchmarks at 1.5B, incredible value.

---

### 4. Phi-3.5 Mini 3.8B (Microsoft) - **RECOMMENDED for Constrained Resources**

**Specifications:**
- **Parameters:** 3.8 billion
- **Architecture:** Dense decoder-only Transformer
- **Context Length:** 128K tokens
- **Training:** 3.4T tokens on 512 H100-80G GPUs (10 days, June-Aug 2024)

**Quantization:**
- **FP8:** 50% reduction in size and memory (available in vLLM ≥ 0.5.1)
- **AWQ:** 4-bit quantization for edge deployment
- **GGUF:** Multiple quantization levels available

**vLLM Deployment:**
- Supported in vLLM, Transformers + TGI, Ollama
- Optimal GPU memory utilization
- Fast token generation

**Hardware Requirements:**
- **2GB Tier:** ❌ Not viable
- **4GB Tier:** ⚠️ With aggressive quantization (Q4)
- **8GB Tier:** ✅ Recommended (FP8/Q8)
- **16GB Tier:** ✅ Optimal (FP16)
- **GPU:** 8-16GB VRAM ideal

**License:** MIT

**Use Cases:**
- Edge deployment on 8-16GB GPUs
- Resource-constrained environments
- Quick inference needs
- Microsoft ecosystem integration

**Verdict:** **Best for Microsoft ecosystem** - Strong performance, excellent quantization options, MIT license.

---

### 5. Qwen 2.5 1B/3B - **RECOMMENDED for Multimodal**

**Available Models:**
- **Qwen2.5-VL-1B** (text + vision)
- **Qwen2.5-VL-3B** (text + vision, outperforms previous 7B)
- **Qwen2.5-VL-7B** (larger variant)

**Specifications (3B):**
- **Parameters:** 3 billion (vision-language)
- **Architecture:** Multimodal transformer
- **Capabilities:**
  - Object recognition
  - Text/chart/diagram analysis
  - Visual agent (computer/phone use)
  - Video understanding (1+ hours)
  - Temporal video segment pinpointing

**Quantization:**
- **AWQ:** Available in 3B, 7B, 72B sizes
- Optimized for fast inference

**vLLM Support:**
- ✅ Full support via SGLang and vLLM
- Optimized for low latency and memory usage

**Hardware Requirements:**
- **2GB Tier:** ❌ Not viable
- **4GB Tier:** ⚠️ 1B variant only, heavily quantized
- **8GB Tier:** ✅ 3B recommended (AWQ)
- **16GB+ Tier:** ✅ Optimal for all variants

**License:** Apache 2.0 (Qwen license)

**Use Cases:**
- Vision-language tasks
- Document understanding
- Visual agents
- Video analysis
- Multimodal RAG

**Verdict:** **Best for vision-language** - Leading multimodal capabilities at 3B, video understanding.

---

### 6. SmolLM 1.7B (Hugging Face) - **RECOMMENDED for Training Quality**

**Available Sizes:**
- **135M** (ultra-lightweight)
- **360M** (lightweight)
- **1.7B** (full featured)

**Specifications (1.7B):**
- **Parameters:** 1.7 billion
- **Training Data:** New high-quality curated dataset
  - Synthetic textbooks
  - Educational content
  - Code samples
- **Training Approach:** From-scratch training (not distilled/pruned)

**Performance:**
- Outperforms other models in same size category
- Strong common sense reasoning
- Excellent world knowledge for size
- High-quality training corpus shows clear benefits

**Hardware Requirements:**
- **2GB Tier:** ⚠️ With quantization (Q4)
- **4GB Tier:** ✅ Recommended (Q8/FP16)
- **8GB+ Tier:** ✅ Optimal

**vLLM Compatibility:** ✅ Supported

**License:** Apache 2.0

**Use Cases:**
- Educational applications
- Common sense reasoning
- Code generation
- General-purpose nano LLM

**Verdict:** **Best training corpus quality** - From-scratch training with curated data yields excellent results.

---

### 7. Gemma 2B/3 270M (Google) - **RECOMMENDED for Google Ecosystem**

**Available Variants:**

**Gemma 2B:**
- **Parameters:** 2 billion
- **Architecture:** Decoder-only transformer
- **Context Length:** 8,192 tokens
- **Attention:** Multi-Query Attention (MQA) with single KV head
- **Training:** Knowledge distillation from larger models

**Gemma 3 270M:**
- **Parameters:** 270 million
- **Purpose:** Hyper-efficient task-specific fine-tuning
- **Release:** August 2025
- **Focus:** Compact edge deployment

**Quantization:**
- **QAT (Quantization-Aware Training):** Gemma 3 models optimized during training
- **Standard quantization:** Q8_0, Q4_K_M, Q2_K, IQ2 variants available
- **Recommended:** Q4_K_M for balanced quality/size

**Hardware Requirements:**

**2B Variant:**
- **2GB Tier:** ⚠️ With Q4 quantization
- **4GB Tier:** ✅ Recommended (Q4_K_M/Q8)
- **8GB+ Tier:** ✅ Optimal

**270M Variant:**
- **2GB Tier:** ✅ Fully supported
- **4GB+ Tier:** ✅ Optimal, can run multiple instances

**vLLM Compatibility:** ✅ Supported

**License:** Gemma Terms of Use (permissive, commercial-friendly)

**Use Cases:**
- Google Cloud integration
- Mobile devices
- Consumer-grade GPUs (with QAT models)
- Task-specific fine-tuning (270M)

**Verdict:** **Best for Google ecosystem** - QAT optimization is innovative, strong distillation performance.

---

### 8. TinyLlama 1.1B - **Legacy Option**

**Specifications:**
- **Parameters:** 1.1 billion
- **Training:** 3 trillion tokens
- **Context Length:** 2,048 tokens
- **Training Time:** 90 days on 16x A100-40G GPUs (launched Sept 2023)

**Quantization Options:**
- **Q2_K:** 2.5625 bits per weight (block scales/mins quantized to 4-bit)
- **Q3_K:** 3.4375 bits per weight (scales quantized to 6-bit)
- **Q4_K:** Super-blocks with 8 blocks, 32 weights per block
- **AWQ:** 4-bit quantization (637MB weight size)

**Hardware Requirements:**
- **2GB Tier:** ✅ With Q4 quantization
- **4GB+ Tier:** ✅ Optimal

**vLLM Compatibility:** ✅ Supported

**License:** Apache 2.0

**Verdict:** **Legacy but proven** - Superseded by Llama 3.2 1B, but widely supported and tested.

---

### 9. Minitron 4B (NVIDIA) - **Alternative via Pruning**

**Specifications:**
- **Parameters:** 4 billion
- **Derivation:** Pruned from Nemotron-4 15B + continued training with distillation
- **Training:** 94 billion tokens (40x fewer than training from scratch)
- **Cost Savings:** 1.8x for training full model family

**Performance:**
- **MMLU:** Up to 16% improvement vs training from scratch
- **Comparison:** Comparable to Mistral 7B, Gemma 7B, Llama-3 8B
- **Advantage:** State-of-the-art compression technique results

**Approach:**
- Pruning + distillation (not from-scratch training)
- Efficient model family derivation

**Hardware Requirements:**
- **4GB Tier:** ⚠️ With quantization
- **8GB Tier:** ✅ Recommended
- **16GB+ Tier:** ✅ Optimal

**vLLM Compatibility:** ✅ Supported

**License:** NVIDIA Open Model License (check for commercial use)

**Verdict:** **Excellent compression technique** - Demonstrates value of pruning/distillation over from-scratch training.

---

### 10. OLMo 1B/7B (Allen Institute for AI) - **RECOMMENDED for Full Openness**

**Variants:**
- **OLMo-1B** (1 billion parameters)
- **OLMo-7B** (7 billion parameters)
- **OLMoE-1B-7B** (Mixture-of-Experts, 1B active / 7B total, January 2025)

**Specifications:**
- **Architecture:** Decoder-only transformer
- **Training:** 2+ trillion tokens (for 7B scale variants)
- **Complete Release Package:**
  - Model weights
  - Pre-training data
  - Training code
  - Training metrics
  - Training logs
  - Inference code

**License:** Apache 2.0 (100% open-source)

**Unique Value Proposition:**
- **Only truly open LLM** - Everything released under Apache 2.0
- Complete transparency: data, code, metrics, logs all public
- Enables full reproducibility

**Hardware Requirements:**

**1B Variant:**
- **2GB Tier:** ⚠️ With Q4 quantization
- **4GB Tier:** ✅ Recommended
- **8GB+ Tier:** ✅ Optimal

**7B Variant:**
- **8GB Tier:** ⚠️ With Q4 quantization
- **16GB Tier:** ✅ Recommended

**vLLM Compatibility:** ✅ Supported

**Use Cases:**
- Research requiring full transparency
- Academic applications
- Organizations needing complete data provenance
- Commercial use with clear licensing

**Verdict:** **Best for full openness** - Only model with complete data/code/metrics release, ideal for research.

---

### Nano LLM Comparison Table

| Model | Params | Context | Quantized Size | Speed | Quality | Reasoning | License | Best For |
|-------|--------|---------|----------------|-------|---------|-----------|---------|----------|
| **Llama 3.2 1B** | 1.2B | 128K | ~700MB (Q4) | ⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Llama 3.2 | General use |
| **Llama 3.2 3B** | 3B | 128K | ~2GB (Q4) | ⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Llama 3.2 | Best overall |
| **Nemotron Nano 4B** | 4B | 128K | ~2.5GB (Q4) | ⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Llama 3.1 | Reasoning |
| **DeepSeek-R1 1.5B** | 1.5B | ? | ~900MB (Q4) | ⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Apache 2.0 | Math/reasoning |
| **DeepSeek-R1 7B** | 7B | ? | ~4GB (Q4) | ⚡⚡ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Apache 2.0 | Advanced reasoning |
| **Phi-3.5 Mini** | 3.8B | 128K | ~2.2GB (FP8) | ⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | MIT | MS ecosystem |
| **Qwen 2.5 3B-VL** | 3B | ? | ~2GB (AWQ) | ⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Apache 2.0 | Vision-language |
| **SmolLM 1.7B** | 1.7B | ? | ~1GB (Q4) | ⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Apache 2.0 | Quality corpus |
| **Gemma 2B** | 2B | 8K | ~1.2GB (Q4) | ⚡⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Gemma TOU | Google ecosystem |
| **TinyLlama** | 1.1B | 2K | ~637MB (Q4) | ⚡⚡⚡ | ⭐⭐⭐ | ⭐⭐ | Apache 2.0 | Legacy/proven |
| **Minitron 4B** | 4B | ? | ~2.5GB (Q4) | ⚡⚡ | ⭐⭐⭐⭐ | ⭐⭐⭐ | NVIDIA | Compression demo |
| **OLMo 1B** | 1B | ? | ~600MB (Q4) | ⚡⚡⚡ | ⭐⭐⭐ | ⭐⭐⭐ | Apache 2.0 | Full openness |

---

## Hardware Tier Recommendations

### 2GB RAM Tier (Edge/Mobile Devices)

**Embedding Model:**
- **Primary:** EmbeddingGemma 308M (~200MB quantized) ✅
- **Alternative:** all-MiniLM-L6-v2 (80MB) ✅
- **Budget:** BGE-small-en-v1.5 (<50MB) ✅

**Generation LLM:**
- **Primary:** Llama 3.2 1B (Q4_K quantization ~700MB) ⚠️
- **Alternative:** Gemma 3 270M (fully supported) ✅
- **Stretch:** TinyLlama 1.1B (Q4 ~637MB) ✅

**Combined System (2GB):**
- EmbeddingGemma (200MB) + Gemma 3 270M (300MB) = **~500MB total** ✅
- Leaves 1.5GB for OS and applications

**Verdict:** Viable for basic RAG but tight. Recommend 4GB minimum for production.

---

### 4GB RAM Tier (Budget Laptops/Devices)

**Embedding Model:**
- **Primary:** EmbeddingGemma 308M (full quality) ✅
- **Alternative:** Nomic-Embed-Text v1.5 (Q4_K_M ~48MB) ✅
- **Speed option:** all-MiniLM-L6-v2 (80MB) ✅

**Generation LLM:**
- **Primary:** Llama 3.2 1B (Q8 ~1.2GB) or 3B (Q4 ~2GB) ✅
- **Alternative:** DeepSeek-R1-Distill-Qwen 1.5B (Q4_K_M ~900MB) ✅
- **Third option:** SmolLM 1.7B (Q4 ~1GB) ✅

**Combined System (4GB):**
- **Option 1:** EmbeddingGemma (200MB) + Llama 3.2 3B Q4 (2GB) = **2.2GB** ✅
- **Option 2:** Nomic-Embed v1.5 Q4 (48MB) + Llama 3.2 3B Q4 (2GB) = **2GB** ✅
- **Option 3:** all-MiniLM (80MB) + DeepSeek-R1 1.5B Q4 (900MB) = **980MB** ✅

**Verdict:** Sweet spot for nano LLM deployment. Excellent performance possible.

---

### 8GB RAM Tier (Standard Laptops/Workstations)

**Embedding Model:**
- **Primary:** Nomic-Embed-Text v1.5 (F16 ~131MB) for best quality ✅
- **Alternative:** EmbeddingGemma 308M (unquantized) ✅
- **Multiple instances:** Can run 2-3 embedding models simultaneously

**Generation LLM:**
- **Primary:** Llama 3.2 3B (Q8/FP16 ~3-6GB) ✅
- **Alternative:** Nemotron Nano 4B (Q4_K_M ~2.5GB) ✅
- **Reasoning:** DeepSeek-R1 7B (Q4 ~4GB) ⚠️
- **Microsoft:** Phi-3.5 Mini (FP8 ~2.2GB) ✅

**Combined System (8GB):**
- **Option 1:** Nomic-Embed F16 (131MB) + Nemotron Nano 4B Q4 (2.5GB) = **2.6GB** ✅
- **Option 2:** EmbeddingGemma (200MB) + Llama 3.2 3B FP16 (6GB) = **6.2GB** ✅
- **Option 3:** Nomic-Embed (131MB) + DeepSeek-R1 7B Q4 (4GB) = **4.1GB** ✅

**Verdict:** Optimal tier for quality nano LLM work. Can run larger models with quantization.

---

### 16GB RAM Tier (High-End Laptops/Workstations)

**Embedding Model:**
- **Primary:** Nomic-Embed-Text v1.5 (F32 ~262MB) for maximum quality ✅
- **Alternative:** EmbeddingGemma 308M (unquantized) + others simultaneously ✅
- **Multiple models:** Run 5-10 embedding models concurrently

**Generation LLM:**
- **Primary:** Llama 3.2 3B (FP16 full precision ~6GB) ✅
- **Alternative:** Nemotron Nano 4B (FP16 ~8GB) ✅
- **Reasoning:** DeepSeek-R1 7B (FP16 ~14GB) ✅
- **Multiple instances:** Can run 2x 3B models or 1x 7B + embeddings

**Combined System (16GB):**
- **Option 1:** Nomic-Embed F32 (262MB) + Nemotron Nano 4B FP16 (8GB) = **8.3GB** ✅
- **Option 2:** Multiple embeddings (500MB) + DeepSeek-R1 7B FP16 (14GB) = **14.5GB** ✅
- **Option 3:** EmbeddingGemma (200MB) + 2x Llama 3.2 3B (12GB) = **12.2GB** ✅

**Verdict:** Excellent tier for multi-model deployments and full-precision inference.

---

### 16GB+ GPU Tier (GPU-Accelerated Workstations)

**Embedding Model:**
- **Any model** at full precision with batching
- **Multiple models** running in parallel
- **High throughput:** Process thousands of embeddings/second

**Generation LLM:**
- **Primary:** Multiple Llama 3.2 3B instances ✅
- **Alternative:** Multiple Nemotron Nano 4B instances ✅
- **Reasoning:** Multiple DeepSeek-R1 7B instances ✅
- **Vision:** Qwen 2.5 VL models with full precision ✅

**vLLM Optimization:**
- Tensor parallelism enabled
- High GPU memory utilization (0.95)
- KV cache optimization
- Continuous batching
- PagedAttention

**Combined System (16GB+ GPU):**
- **Production:** 3-5x nano LLM instances + multiple embedding models
- **Batch inference:** Process hundreds of requests concurrently
- **Multi-agent:** Run 10+ specialized nano agents simultaneously

**Verdict:** Production-grade deployment with extensive multi-agent capabilities.

---

## Best Pairing Recommendations

### For GraphRAG Knowledge Graph Operations

**Tier 1 - Budget (4GB):**
```
Embedding: EmbeddingGemma 308M (200MB)
Generation: Llama 3.2 1B Q8 (1.2GB)
Total: ~1.4GB
Use case: Basic knowledge graph queries, semantic routing
```

**Tier 2 - Balanced (8GB):**
```
Embedding: Nomic-Embed-Text v1.5 F16 (131MB)
Generation: Llama 3.2 3B Q8 (3GB)
Total: ~3.1GB
Use case: Standard GraphRAG operations, multi-hop queries
```

**Tier 3 - Optimal (16GB):**
```
Embedding: Nomic-Embed-Text v1.5 F32 (262MB)
Generation: Nemotron Nano 4B FP16 (8GB)
Total: ~8.3GB
Use case: Complex reasoning over knowledge graphs
```

**Tier 4 - Production (16GB+ GPU):**
```
Embedding: Multiple (EmbeddingGemma + Nomic-Embed + BGE)
Generation: 2x Nemotron Nano 4B + Llama 3.2 3B
Total: Variable (vLLM managed)
Use case: High-throughput GraphRAG API service
```

---

### For Multi-Agent Reasoning Systems

**2-Nano-LLM Architecture (8GB):**

**Option 1 - Balanced:**
```
Coordinator: Llama 3.2 3B Q8 (3GB) - handles routing and orchestration
Worker: DeepSeek-R1-Distill 1.5B Q8 (1.5GB) - specialized reasoning
Embedding: EmbeddingGemma 308M (200MB)
Total: ~4.7GB
```

**Option 2 - Reasoning-Heavy:**
```
Coordinator: Nemotron Nano 4B Q4 (2.5GB) - System 1/2 reasoning
Worker: DeepSeek-R1-Distill 1.5B Q8 (1.5GB) - math/code reasoning
Embedding: all-MiniLM-L6-v2 (80MB) - speed for routing
Total: ~4.1GB
```

**Option 3 - Speed-Focused:**
```
Coordinator: Llama 3.2 1B Q8 (1.2GB) - fast routing
Worker: SmolLM 1.7B Q8 (2GB) - quality reasoning
Embedding: all-MiniLM-L6-v2 (80MB) - millisecond routing
Total: ~3.3GB
```

---

### For Multi-Agent Systems (16GB GPU)

**5-Agent Architecture:**
```
Router Agent: Llama 3.2 1B FP16 (2GB) - semantic routing
Reasoning Agent: Nemotron Nano 4B FP16 (8GB) - complex reasoning
Code Agent: DeepSeek-R1 7B Q8 (8GB) - code generation
Vision Agent: Qwen 2.5 VL 3B AWQ (2GB) - visual understanding
Summarization Agent: SmolLM 1.7B Q8 (2GB) - summarization

Embeddings:
- EmbeddingGemma 308M (200MB) - primary
- all-MiniLM-L6-v2 (80MB) - fast routing
- Nomic-Embed v1.5 Q4 (48MB) - long context

Total vLLM managed: ~15GB with KV cache optimization
```

---

### For Document Processing & RAG

**Standard RAG (4GB):**
```
Embedding: Nomic-Embed-Text v1.5 Q4 (48MB) - 8K context for long docs
Generation: Llama 3.2 3B Q4 (2GB)
Total: ~2GB
Strength: Long document handling (8K embedding context)
```

**Multilingual RAG (8GB):**
```
Embedding: EmbeddingGemma 308M (200MB) - 100+ languages
Generation: Llama 3.2 3B Q8 (3GB)
Total: ~3.2GB
Strength: Multilingual support, broad language coverage
```

**High-Quality RAG (16GB):**
```
Embedding: Nomic-Embed-Text v1.5 F32 (262MB) - maximum quality
Generation: Nemotron Nano 4B FP16 (8GB) - controllable reasoning
Total: ~8.3GB
Strength: Best-in-class quality for critical applications
```

---

## vLLM Compatibility & Deployment

### vLLM V1 (January 2025 Release)

**Major Improvements:**
- **1.7x speedup** over V0
- **Clean code architecture**
- **Optimized execution loop**
- **Zero-overhead prefix caching**
- **Enhanced multimodal support**
- **Now under PyTorch Foundation** (May 2025)

### Nano Model Support

**Fully Compatible Models:**
- ✅ Llama 3.2 1B/3B
- ✅ Llama 3.1 Nemotron Nano 4B (v0.6.6+)
- ✅ DeepSeek-R1-Distill series (Qwen architecture)
- ✅ Phi-3.5 Mini (with FP8 support v0.5.1+)
- ✅ Qwen 2.5 series (via SGLang/vLLM)
- ✅ SmolLM 1.7B
- ✅ Gemma 2B
- ✅ TinyLlama 1.1B
- ✅ Minitron 4B
- ✅ OLMo 1B/7B

**Example vLLM Commands:**

**Nemotron Nano 4B:**
```bash
vllm serve nvidia/Llama-3.1-Nemotron-Nano-4B-v1.1 \
  --max-model-len 131072 \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization 0.95
```

**Llama 3.2 3B:**
```bash
vllm serve meta-llama/Llama-3.2-3B-Instruct \
  --max-model-len 131072 \
  --gpu-memory-utilization 0.9
```

**DeepSeek-R1 7B:**
```bash
vllm serve deepseek-ai/DeepSeek-R1-Distill-Qwen-7B \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.9
```

### Docker Deployment

**Official vLLM Image:**
```bash
docker pull vllm/vllm-openai:latest

docker run --gpus all \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8000:8000 \
  --ipc=host \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-3.2-3B-Instruct \
  --max-model-len 131072
```

**CPU-Only Docker (for development):**
```bash
docker pull vllm/vllm-openai:cpu-latest

docker run \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8000:8000 \
  vllm/vllm-openai:cpu-latest \
  --model meta-llama/Llama-3.2-1B-Instruct
```

### Nano-vLLM Alternative (Lightweight)

**For learning/edge deployment:**
- **nano-vLLM:** Lightweight vLLM in ~1,200 lines of Python
- **Performance:** Near-parity with full vLLM for offline inference
- **Use case:** Edge devices, learning, simplified deployment
- **Streaming:** ✅ Supported
- **Released:** June 2025 (DeepSeek researchers)

```python
# Example nano-vLLM usage
from nano_vllm import Engine

engine = Engine(model_path="meta-llama/Llama-3.2-1B-Instruct")
for token in engine.generate("Hello world", stream=True):
    print(token, end="", flush=True)
```

---

## Streaming & Real-Time Inference

### NanoLLM Framework (NVIDIA Jetson)

**Features:**
- Optimized for quantized LLMs
- Token streaming for real-time inference
- Multimodality support
- Speech services integration
- Vector databases with RAG
- Web frontends

**StreamingResponse Iterator:**
```python
from nano_llm import NanoLLM

model = NanoLLM.from_pretrained("meta-llama/Llama-3.2-1B-Instruct")

for token in model.generate("Write a story", stream=True):
    print(token, end="", flush=True)
```

**Supported Platforms:**
- NVIDIA Jetson Orin Nano
- NVIDIA Jetson AGX Orin
- NVIDIA RTX GPUs
- Other NVIDIA embedded platforms

### NanoVLM (Vision-Language)

**Features:**
- Continuous streaming (Live Llava mode)
- Real-time video understanding
- 4-bit AWQ quantization
- Interactive use cases

**Example Applications:**
- Real-time visual agents
- Live video analysis
- Interactive AR/VR assistants
- Robotics vision systems

---

## License Comparison

### Permissive Open-Source Licenses

**Apache 2.0** (Most Permissive for Commercial):
- ✅ **Models:** Nomic-Embed v1.5, DeepSeek-R1-Distill series, SmolLM, OLMo, E5, Qwen 2.5, all-MiniLM-L6-v2, EmbeddingGemma, TinyLlama
- ✅ **Commercial use:** Unrestricted
- ✅ **Modifications:** Must document changes
- ✅ **Patent grant:** Explicit patent protection
- ✅ **Trademark:** No rights to trademarks/logos
- ⚠️ **Attribution:** Must retain copyright notices

**MIT** (Simplest Permissive):
- ✅ **Models:** Phi-3.5 Mini, BGE-small-en-v1.5, E5-small-v2
- ✅ **Commercial use:** Unrestricted
- ✅ **Modifications:** No documentation required
- ✅ **Simplicity:** Shortest, simplest license
- ⚠️ **No patent grant:** Unlike Apache 2.0
- ⚠️ **Attribution:** Must retain copyright notices

### Conditional Open Licenses

**Llama 3.2 Community License:**
- ✅ **Models:** Llama 3.2 1B/3B, Llama 3.1 Nemotron Nano 4B
- ✅ **Commercial use:** Generally permitted
- ⚠️ **Service restrictions:** If >700M MAU, must request Meta license
- ⚠️ **Not OSI-approved:** Custom Meta license
- ✅ **Derivatives:** Can fine-tune and distribute

**Gemma Terms of Use:**
- ✅ **Models:** Gemma 2B, Gemma 3 270M
- ✅ **Commercial use:** Permitted
- ⚠️ **Not OSI-approved:** Google-specific terms
- ✅ **Research-friendly:** Designed for research use

**NVIDIA Open Model License:**
- ✅ **Models:** Minitron 4B (standalone)
- ⚠️ **Check specifics:** Review for commercial terms
- ⚠️ **Derivative restrictions:** May have limitations

### License Selection Guide

**For Maximum Freedom:**
- Choose **MIT** (Phi-3.5 Mini, BGE-small) or **Apache 2.0** (most others)
- Simplest legal requirements
- No service restrictions

**For Patent Protection:**
- Choose **Apache 2.0** models
- Explicit patent grant protects users
- Better for commercial products

**For Cutting-Edge Performance:**
- Accept **Llama 3.2 License** (best overall models)
- Minimal restrictions for most use cases
- Only matters if service exceeds 700M MAU

**For Complete Transparency:**
- Choose **OLMo** (Apache 2.0 + full data release)
- Only model with complete provenance
- Ideal for auditable systems

---

## GraphRAG-Specific Recommendations

### Best Embedding Models for GraphRAG

**Knowledge Graph Construction:**
1. **EmbeddingGemma 308M** - Best MTEB score, multilingual, good for entity linking
2. **Nomic-Embed-Text v1.5** - 8K context ideal for long entity descriptions
3. **BGE-small-en-v1.5** - Fast entity embedding for large graphs

**Graph Query Embedding:**
1. **EmbeddingGemma 308M** - Best quality for semantic graph traversal
2. **all-MiniLM-L6-v2** - Fastest for high-frequency queries
3. **Nomic-Embed-Text v1.5** - Best for complex multi-hop query embeddings

**Semantic Routing:**
1. **all-MiniLM-L6-v2** - Millisecond routing decisions
2. **EmbeddingGemma 308M** - Higher quality when speed less critical

### Best LLMs for GraphRAG

**Graph Reasoning:**
1. **Nemotron Nano 4B** - Controllable System 1/2 reasoning for graph traversal
2. **DeepSeek-R1-Distill 7B** - Best complex reasoning over knowledge graphs
3. **Llama 3.2 3B** - Best general-purpose graph reasoning

**Entity Extraction:**
1. **Llama 3.2 3B** - Best instruction-following for structured extraction
2. **Phi-3.5 Mini** - Fast extraction with good accuracy
3. **SmolLM 1.7B** - Good for simple entity extraction

**Graph Summarization:**
1. **Llama 3.2 3B** - Best summarization quality
2. **SmolLM 1.7B** - Fast summarization
3. **Gemma 2B** - Efficient summarization

### nano-GraphRAG Configuration

Based on the nano-graphrag implementation:

**Dual LLM Setup:**
```python
# Great LLM for planning and response
primary_llm = "meta-llama/Llama-3.2-3B-Instruct"  # or Nemotron Nano 4B

# Cheap LLM for summarization
summary_llm = "meta-llama/Llama-3.2-1B-Instruct"  # or SmolLM 1.7B

# Embedding function (replace OpenAI)
from sentence_transformers import SentenceTransformer
embedding_model = SentenceTransformer('google/embeddinggemma-300m')
```

**Recommended Pairings:**

**Budget (4GB):**
```
Primary: Llama 3.2 1B Q8 (1.2GB)
Summary: Gemma 3 270M (300MB)
Embedding: all-MiniLM-L6-v2 (80MB)
Total: ~1.6GB
```

**Balanced (8GB):**
```
Primary: Llama 3.2 3B Q8 (3GB)
Summary: Llama 3.2 1B Q8 (1.2GB)
Embedding: EmbeddingGemma 308M (200MB)
Total: ~4.4GB
```

**Optimal (16GB):**
```
Primary: Nemotron Nano 4B FP16 (8GB)
Summary: SmolLM 1.7B FP16 (3.4GB)
Embedding: Nomic-Embed v1.5 F32 (262MB)
Total: ~11.7GB
```

---

## CPU Inference Optimization

### Best Models for CPU Inference

**Embedding Models:**
1. **all-MiniLM-L6-v2** - Optimized for CPU, <10ms with QInt8
2. **BGE-small-en-v1.5** - Fast CPU inference
3. **E5-small-v2** - Good CPU performance with IPEX

**Generation LLMs:**
1. **Llama 3.2 1B** - Best CPU performance in 1B class
2. **Gemma 3 270M** - Fastest CPU inference
3. **TinyLlama 1.1B** - Proven CPU performance

### Optimization Techniques

**Intel Optimum:**
- AVX-512 acceleration
- VNNI (Vector Neural Network Instructions)
- AMX (Advanced Matrix Extensions)
- Up to 4.5x speedup for embeddings

**Quantization:**
- **INT8:** 4x memory reduction, <5% quality loss
- **QInt8:** <10ms latency for 500M parameter models
- **Q4_K_M:** Best balance for nano LLMs

**Batching:**
- Highly effective on CPU backends
- Combine with dynamic shapes
- Tune batch size to hardware

**Example Performance:**
- **e5-large-v2 (500M) QInt8 ONNX:** 10ms on CPU (faster than API call!)
- **all-MiniLM-L6-v2 QInt8:** <5ms on modern Intel CPU

---

## Quality vs Speed Tradeoffs

### Embedding Models

**Speed Priority:**
- **all-MiniLM-L6-v2** - Fastest (22M params)
- **Tradeoff:** Slightly lower quality than larger models
- **Use case:** High-throughput, real-time applications

**Balanced:**
- **EmbeddingGemma 308M** - Excellent speed + quality
- **BGE-small-en-v1.5** - Fast with good quality
- **Tradeoff:** Medium resource usage

**Quality Priority:**
- **Nomic-Embed-Text v1.5** - Best accuracy, 8K context
- **Tradeoff:** Slower inference, larger model
- **Use case:** Critical applications, long documents

### Generation LLMs

**Speed Priority (1-2B):**
- **Llama 3.2 1B** (Q4) - 56% smaller, 2-4x faster
- **Gemma 3 270M** - Fastest generation
- **TinyLlama 1.1B** - Fast inference
- **Tradeoff:** Lower reasoning capability

**Balanced (1.5-3B):**
- **Llama 3.2 3B** (Q4) - Best overall value
- **SmolLM 1.7B** - Good quality for size
- **DeepSeek-R1 1.5B** - Best reasoning at 1.5B
- **Tradeoff:** Moderate resource usage

**Quality Priority (3-4B):**
- **Nemotron Nano 4B** - Best reasoning, controllable
- **Phi-3.5 Mini 3.8B** - High quality generation
- **DeepSeek-R1 7B** (Q4) - Best reasoning overall
- **Tradeoff:** Slower, more resources

### Quantization Impact

**Q4_K (4-bit):**
- **Speed:** 2-4x faster
- **Size:** 56% reduction
- **Quality:** ~5-10% degradation
- **Recommendation:** Best for most use cases

**Q8_0 (8-bit):**
- **Speed:** 1.5-2x faster
- **Size:** 50% reduction
- **Quality:** <5% degradation
- **Recommendation:** When quality matters more

**INT8 (8-bit integer):**
- **Speed:** 4x memory reduction
- **Quality:** Best quality-to-memory ratio
- **Recommendation:** Production deployments

**FP8 (8-bit float):**
- **Speed:** 50% size/memory reduction
- **Quality:** Minimal degradation (Phi-3.5)
- **Recommendation:** When vLLM v0.5.1+ available

---

## Final Recommendations by Use Case

### 1. Production GraphRAG Service (16GB+ GPU)

**Architecture:**
```
Embeddings:
- EmbeddingGemma 308M (knowledge graph)
- Nomic-Embed v1.5 F32 (long context queries)
- all-MiniLM-L6-v2 (fast routing)

Generation:
- Nemotron Nano 4B FP16 (primary reasoning)
- Llama 3.2 3B FP16 (fallback/secondary)
- Llama 3.2 1B FP16 (summarization)

Total: ~15GB managed by vLLM
vLLM config: Tensor parallelism, KV cache, continuous batching
```

### 2. Edge GraphRAG Device (4GB)

**Architecture:**
```
Embedding: EmbeddingGemma 308M Q8 (200MB)
Primary: Llama 3.2 3B Q4 (2GB)
Summary: Llama 3.2 1B Q4 (700MB)

Total: ~2.9GB
Deployment: Docker + vLLM CPU mode or NanoLLM
```

### 3. Multi-Agent Reasoning System (16GB)

**Architecture:**
```
Router: Llama 3.2 1B FP16 (fast semantic routing)
Orchestrator: Nemotron Nano 4B FP16 (System 1/2 reasoning)
Math/Code: DeepSeek-R1 7B Q8 (specialized reasoning)
Vision: Qwen 2.5 VL 3B AWQ (visual understanding)
Writer: SmolLM 1.7B FP16 (content generation)

Embeddings:
- EmbeddingGemma 308M (primary)
- all-MiniLM-L6-v2 (routing)

Total: ~15GB with vLLM optimization
```

### 4. Mobile/IoT RAG (2GB)

**Architecture:**
```
Embedding: all-MiniLM-L6-v2 (80MB) - fastest
Generation: Gemma 3 270M (300MB) - smallest viable

Total: ~380MB
Deployment: TensorFlow Lite, ONNX Runtime
Platform: Android, iOS, embedded Linux
```

### 5. Research/Academic (Full Transparency)

**Architecture:**
```
Embedding: Nomic-Embed v1.5 F32 (Apache 2.0)
Generation: OLMo 7B (Apache 2.0, full data release)

Total: ~14GB
License: 100% Apache 2.0 with complete provenance
Use case: Reproducible research, academic papers
```

### 6. Commercial SaaS (Lowest Licensing Risk)

**Architecture:**
```
Embedding: Nomic-Embed v1.5 (Apache 2.0)
Generation: DeepSeek-R1-Distill 7B (Apache 2.0)
Alternative: Phi-3.5 Mini 3.8B (MIT)

Total: ~14GB (DeepSeek) or ~8GB (Phi)
License: Pure Apache 2.0 or MIT, no restrictions
Use case: Commercial products, SaaS platforms
```

---

## Benchmark Summary

### MTEB Leaderboard (Embeddings, October 2025)

1. **NV-Embed-v2** (7B) - 72.31 (not nano, reference only)
2. **EmbeddingGemma 308M** - Highest score <500M parameters
3. **Nomic-Embed-Text v1.5** - Beats OpenAI ada-002 and 3-small
4. **BGE-small-en-v1.5** - Strong performer in class
5. **all-MiniLM-L6-v2** - Best speed-to-quality ratio

### Reasoning Benchmarks (Nano LLMs)

**AIME 2024 (Math Reasoning):**
1. DeepSeek-R1-Distill 7B - 55.5%
2. DeepSeek-R1-Distill 1.5B - 28.9% (beats GPT-4o!)
3. Nemotron Nano 4B - [competitive but not specified]

**MATH-500:**
1. DeepSeek-R1-Distill 1.5B - 83.9%
2. Nemotron Nano 4B - [competitive]
3. Llama 3.2 3B - [strong performance]

**MMLU (General Knowledge):**
1. Nemotron Nano 4B - [strong, comparable to Mistral 7B]
2. Minitron 4B - 16% better than training from scratch
3. Llama 3.2 3B - [competitive]
4. Phi-3.5 Mini 3.8B - [solid performance]

---

## Key Insights for October 2025

### Major Trends

1. **Quantization Revolution:**
   - 2-4x speedups with 56% size reduction now standard
   - QAT (Quantization-Aware Training) emerging (Gemma 3)
   - FP8 becoming viable (Phi-3.5)

2. **Context Length Explosion:**
   - 128K context now standard for nano LLMs
   - Llama 3.2, Nemotron Nano, Phi-3.5 all support 128K
   - Enables new use cases for small models

3. **Reasoning Breakthrough:**
   - DeepSeek-R1 distillation brings o1-class reasoning to 1.5B
   - System 1/System 2 controllable reasoning (Nemotron)
   - Nano models now compete on complex reasoning

4. **Embedding Quality:**
   - EmbeddingGemma sets new SOTA for <500M params
   - 8K context embeddings now available (Nomic-Embed)
   - Multilingual embeddings (100+ languages) at 308M params

5. **Hardware Optimization:**
   - CPU inference now viable (<10ms for embeddings)
   - Edge deployment ready (phones, tablets, IoT)
   - vLLM V1 brings 1.7x speedup

6. **License Clarity:**
   - Apache 2.0 and MIT dominate open models
   - Full transparency: OLMo releases everything
   - Commercial-friendly options abundant

### What Changed Since 2024

**New in 2025:**
- ✅ Llama 3.2 quantized variants (major upgrade)
- ✅ DeepSeek-R1 distilled models (reasoning revolution)
- ✅ Nemotron Nano 4B (NVIDIA entry)
- ✅ EmbeddingGemma 308M (Google embedding model)
- ✅ vLLM V1 with 1.7x speedup
- ✅ OLMoE 1B-7B MoE variant
- ✅ Qwen 2.5 VL multimodal models
- ✅ Gemma 3 270M ultra-compact model

**Deprecated/Superseded:**
- ⚠️ TinyLlama 1.1B (replaced by Llama 3.2 1B)
- ⚠️ Older Gemma variants (replaced by Gemma 2/3)
- ⚠️ 2K context models (replaced by 128K)

---

## Glossary

**Terms:**
- **MTEB:** Massive Text Embedding Benchmark - standard for embedding evaluation
- **QAT:** Quantization-Aware Training - quantization during training for better results
- **MRL:** Matryoshka Representation Learning - flexible embedding dimensions
- **AWQ:** Activation-aware Weight Quantization - 4-bit quantization method
- **GGUF:** GPT-Generated Unified Format - quantized model format for llama.cpp
- **KV Cache:** Key-Value cache for transformer attention - speeds up inference
- **System 1/System 2:** Fast intuitive vs slow deliberate reasoning (Kahneman)
- **CoT:** Chain-of-Thought - reasoning step-by-step
- **RAG:** Retrieval-Augmented Generation
- **GraphRAG:** Graph-based RAG using knowledge graphs
- **vLLM:** Fast LLM inference engine with PagedAttention
- **FTS:** Full-Text Search
- **VRAM:** Video RAM (GPU memory)

---

## References

### Research Papers
- Llama 3 Technical Report (Meta AI, 2024)
- DeepSeek-R1 Paper (DeepSeek AI, 2025)
- Phi-3 Technical Report (Microsoft, 2024)
- Minitron: Compact Language Models via Pruning and Knowledge Distillation (NVIDIA, 2024)

### Model Repositories
- Hugging Face Model Hub
- NVIDIA NGC Catalog
- Google AI Model Garden
- Meta Llama Models

### Benchmarks
- MTEB Leaderboard: https://huggingface.co/spaces/mteb/leaderboard
- Artificial Analysis LLM Leaderboard
- HELM Benchmark Suite

### Tools
- vLLM: https://github.com/vllm-project/vllm
- Sentence Transformers: https://www.sbert.net/
- llama.cpp: https://github.com/ggerganov/llama.cpp
- Ollama: https://ollama.ai/

---

**Document Status:** Complete
**Last Updated:** October 31, 2025
**Author:** Research compiled from web sources
**Purpose:** Inform nano LLM and embedding model selection for GraphRAG and multi-agent systems
