/**
 * LLM Adapter
 *
 * Wraps the LLMRouter to provide a simple, unified interface for agents.
 * Replaces direct VLLMClient usage.
 */

import {
  getLLMRouter,
  LLMRouter,
  GenerateOptions,
  ChatMessage,
} from "./llm-router";

export interface LLMAdapterInterface {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: GenerateOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  isAvailable(): boolean;
}

export class LLMAdapter implements LLMAdapterInterface {
  private router: LLMRouter;

  constructor() {
    this.router = getLLMRouter();
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const result = await this.router.generate(prompt, options);
    return result.text;
  }

  async chat(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    const result = await this.router.chat(messages, options);
    return result.text;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.router.embed(text);
    return result.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results = await this.router.embedBatch(texts);
    return results.map((r) => r.embedding);
  }

  isAvailable(): boolean {
    return this.router.isAvailable();
  }
}

export function createLLMAdapter(): LLMAdapterInterface {
  return new LLMAdapter();
}
