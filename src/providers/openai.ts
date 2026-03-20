import type { LLMProvider } from "../types.js";

export function createOpenAIProvider(
  model: string,
  apiKey: string,
  baseUrl: string = "http://localhost:11434/v1"
): LLMProvider {
  return {
    async complete(prompt: string, systemPrompt: string): Promise<string> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI-compatible ${res.status}: ${body}`);
      }
      const data = await res.json();
      return data.choices[0].message.content;
    },
  };
}
