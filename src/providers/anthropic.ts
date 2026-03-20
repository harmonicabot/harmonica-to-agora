import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider } from "../types.js";

export function createAnthropicProvider(model: string, apiKey: string): LLMProvider {
  const client = new Anthropic({ apiKey });
  return {
    async complete(prompt: string, systemPrompt: string): Promise<string> {
      const res = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });
      const block = res.content[0];
      if (block.type !== "text") throw new Error("Unexpected response type");
      return block.text;
    },
  };
}
