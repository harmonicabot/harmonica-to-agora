import { parseArgs } from "node:util";
import { fetchSession } from "./fetch.js";
import { synthesizeAll, deduplicateStatements } from "./synthesize.js";
import { writeCSVs } from "./csv.js";
import { createOpenRouterProvider } from "./providers/openrouter.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOpenAIProvider } from "./providers/openai.js";
import type { LLMProvider } from "./types.js";

const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "meta-llama/llama-4-scout",
  anthropic: "claude-sonnet-4-6",
  openai: "llama3.2",
};

function getProvider(name: string, model: string, apiKey: string, apiUrl?: string): LLMProvider {
  switch (name) {
    case "openrouter":
      return createOpenRouterProvider(model, apiKey);
    case "anthropic":
      return createAnthropicProvider(model, apiKey);
    case "openai":
      return createOpenAIProvider(model, apiKey, apiUrl);
    default:
      throw new Error(`Unknown provider: ${name}. Use: openrouter, anthropic, openai`);
  }
}

function getApiKey(providerName: string, cliKey?: string): string {
  if (cliKey) return cliKey;
  const envMap: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };
  const envVar = envMap[providerName];
  const key = envVar ? process.env[envVar] : undefined;
  if (!key && providerName !== "openai") {
    throw new Error(`Missing API key. Set ${envVar} or use --llm-key`);
  }
  return key || "";
}

async function main() {
  const { values } = parseArgs({
    options: {
      session: { type: "string", short: "s" },
      provider: { type: "string", default: "openrouter" },
      model: { type: "string" },
      "api-url": { type: "string" },
      output: { type: "string", default: "./output" },
      "harmonica-key": { type: "string" },
      "llm-key": { type: "string" },
      "no-cache": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  if (values.help || !values.session) {
    console.log(`
harmonica-to-agora — Synthesize Harmonica sessions into Agora/Polis CSVs

Usage: npx tsx src/index.ts --session <id> [options]

Required:
  --session, -s <id>      Harmonica session ID

LLM Config:
  --provider <name>       openrouter | anthropic | openai (default: openrouter)
  --model <name>          Model ID (default: per-provider)
  --api-url <url>         Base URL for openai provider

Output:
  --output <dir>          Output directory (default: ./output)
  --no-cache              Force re-run, ignore cached extractions

Auth (also via env vars):
  --harmonica-key <key>   HARMONICA_API_KEY
  --llm-key <key>         OPENROUTER_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY
`);
    process.exit(values.help ? 0 : 1);
  }

  const providerName = values.provider!;
  const model = values.model || DEFAULT_MODELS[providerName] || "gpt-4o-mini";
  const llmKey = getApiKey(providerName, values["llm-key"]);
  const harmonicaKey = values["harmonica-key"] || process.env.HARMONICA_API_KEY;

  if (!harmonicaKey) {
    console.error("Missing Harmonica API key. Set HARMONICA_API_KEY or use --harmonica-key");
    process.exit(1);
  }

  const provider = getProvider(providerName, model, llmKey, values["api-url"]);
  const outputDir = values.output!;
  const useCache = !values["no-cache"];

  // Step 1: Fetch
  console.log(`Fetching session ${values.session}...`);
  const { meta, participants } = await fetchSession(values.session!, harmonicaKey);
  console.log(`${meta.title} — ${participants.length} participants\n`);

  // Step 2-3: Synthesize per participant
  console.log("Synthesizing statements...");
  const { all, skipped } = await synthesizeAll(participants, provider, outputDir, useCache);

  const totalStatements = all.reduce((sum, ps) => sum + ps.statements.length, 0);
  console.log(`\nExtracted ${totalStatements} statements from ${all.length} participants`);
  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.join(", ")}`);
  }

  // Step 4: Deduplicate
  console.log("\nDeduplicating...");
  const deduped = await deduplicateStatements(all, provider);
  console.log(`${totalStatements} → ${deduped.length} unique statements`);

  // Step 5: Write CSVs
  console.log(`\nWriting CSVs to ${outputDir}/`);
  writeCSVs(deduped, meta, outputDir);

  console.log(`\nDone! ${deduped.length} statements ready for Agora import.`);
  console.log(`Files: summary.csv, comments.csv, votes.csv`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
