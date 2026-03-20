import type { LLMProvider } from "../types.js";

export function createOpenRouterProvider(model: string, apiKey: string): LLMProvider {
  return {
    async complete(prompt: string, systemPrompt: string): Promise<string> {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
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
        throw new Error(`OpenRouter ${res.status}: ${body}`);
      }
      const data = await res.json();
      return data.choices[0].message.content;
    },
  };
}
