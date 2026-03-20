/**
 * Filter cached extraction results to a specific topic and produce focused CSVs.
 * Usage: npx tsx src/filter.ts --topic "..." --output ./output-workshop3
 */

import { parseArgs } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeCSVs } from "./csv.js";
import { createOpenRouterProvider } from "./providers/openrouter.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOpenAIProvider } from "./providers/openai.js";
import type { LLMProvider, ParticipantStatements, DedupedStatement, SessionMeta } from "./types.js";

const FILTER_SYSTEM = `You are a strict filter for opinion statements. You must ONLY keep statements that are DIRECTLY about the specified topic. Remove anything that is about general governance, voting, delegation, or other topics — even if tangentially related.

Respond ONLY with a JSON array of the relevant statements. No markdown, no explanation. If none are relevant, return [].`;

function makeFilterPrompt(
  statements: Array<{ id: number; statement: string; topic: string; participant_id: string }>,
  filterTopic: string,
  filterContext: string
): string {
  return `Keep ONLY statements directly about: "${filterTopic}"

${filterContext}

EXCLUDE statements about:
- General voting mechanisms or token voting (unless specifically about funding votes)
- Delegation or representative governance (unless about grant committee delegation)
- Identity, reputation, or sybil resistance (unless about grant applicant verification)
- Legal structures, DAOs in general, governance fatigue
- Any other governance topic NOT directly about funding/grants/allocation

<statements>
${JSON.stringify(statements, null, 2)}
</statements>

Return ONLY the directly relevant statements as a JSON array (keep original fields).`;
}

const DEDUP_SYSTEM = `You are deduplicating opinion statements. Rules:
- Merge statements that say the SAME thing in different words
- Keep DISTINCT claims separate — do NOT over-merge
- Preserve specificity — "RPGF only rewards proven impact" and "grant evaluation lacks accountability" are DIFFERENT
- Each statement should be a clear, specific, votable claim
- Assign sequential IDs starting at 1

Respond ONLY with a JSON array. No markdown, no explanation.`;

function parseJSON<T>(raw: string): T {
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) { try { return JSON.parse(match[1].trim()); } catch {} }
  throw new Error("Failed to parse JSON from LLM response");
}

async function main() {
  const { values } = parseArgs({
    options: {
      topic: { type: "string", short: "t" },
      context: { type: "string", short: "c" },
      "cache-dir": { type: "string", default: "./output/.cache" },
      output: { type: "string", default: "./output-workshop3" },
      provider: { type: "string", default: "openrouter" },
      model: { type: "string" },
      "api-url": { type: "string" },
      "llm-key": { type: "string" },
      "session-title": { type: "string", default: "gov/acc — Agentic Allocation" },
    },
    strict: true,
  });

  const topic = values.topic || "Grant System Dysfunction & Capital Misallocation";
  const filterContext = values.context || `Context: This is for a workshop on "Agentic Allocation" — using AI agents to improve public goods funding. Relevant topics ONLY: grant systems, retroactive funding (RPGF), capital allocation, treasury management, funding accountability, grant evaluation criteria, contributor compensation tied to grants, incentive design for funding, resource distribution mechanisms.`;
  const cacheDir = values["cache-dir"]!;
  const outputDir = values.output!;

  // Resolve provider
  const providerName = values.provider!;
  const defaultModels: Record<string, string> = {
    openrouter: "meta-llama/llama-4-scout",
    anthropic: "claude-sonnet-4-6",
    openai: "llama3.2",
  };
  const model = values.model || defaultModels[providerName] || "gpt-4o-mini";
  const envMap: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };
  const apiKey = values["llm-key"] || process.env[envMap[providerName]] || "";

  let provider: LLMProvider;
  switch (providerName) {
    case "openrouter": provider = createOpenRouterProvider(model, apiKey); break;
    case "anthropic": provider = createAnthropicProvider(model, apiKey); break;
    case "openai": provider = createOpenAIProvider(model, apiKey, values["api-url"]); break;
    default: throw new Error(`Unknown provider: ${providerName}`);
  }

  // Load all cached extractions
  console.log(`Loading cached extractions from ${cacheDir}...`);
  const files = readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
  const allStatements: Array<{ id: number; statement: string; topic: string; participant_id: string }> = [];
  let globalId = 1;

  for (const file of files) {
    const data: ParticipantStatements = JSON.parse(readFileSync(join(cacheDir, file), "utf-8"));
    for (const s of data.statements) {
      allStatements.push({
        id: globalId++,
        statement: s.statement,
        topic: s.topic,
        participant_id: data.participant_id,
      });
    }
  }

  console.log(`Loaded ${allStatements.length} total statements from ${files.length} participants`);
  console.log(`Filtering for topic: "${topic}"\n`);

  // Filter in batches of 50
  const BATCH_SIZE = 50;
  const filtered: Array<{ id: number; statement: string; topic: string; participant_id: string }> = [];

  for (let i = 0; i < allStatements.length; i += BATCH_SIZE) {
    const batch = allStatements.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allStatements.length / BATCH_SIZE);
    process.stdout.write(`  Filtering batch ${batchNum}/${totalBatches}... `);

    const raw = await provider.complete(makeFilterPrompt(batch, topic, filterContext), FILTER_SYSTEM);
    try {
      const result = parseJSON<typeof batch>(raw);
      filtered.push(...result);
      process.stdout.write(`${result.length}/${batch.length} relevant\n`);
    } catch {
      process.stdout.write(`FAILED to parse, skipping batch\n`);
    }
  }

  console.log(`\nFiltered: ${allStatements.length} → ${filtered.length} relevant statements`);

  if (filtered.length === 0) {
    console.log("No relevant statements found. Exiting.");
    process.exit(0);
  }

  // Deduplicate the filtered set
  console.log("\nDeduplicating...");
  const dedupInput = filtered.map((s) => ({
    statement: s.statement,
    topic: s.topic,
    participant_id: s.participant_id,
  }));

  let deduped: DedupedStatement[];
  if (dedupInput.length <= BATCH_SIZE) {
    const dedupPrompt = `Deduplicate these opinion statements. Keep distinct claims SEPARATE — only merge near-identical wording.\n\n<statements>\n${JSON.stringify(dedupInput, null, 2)}\n</statements>\n\nReturn: [{"id": 1, "statement": "...", "topic": "...", "author_ids": ["..."]}, ...]`;
    const raw = await provider.complete(dedupPrompt, DEDUP_SYSTEM);
    deduped = parseJSON<DedupedStatement[]>(raw);
  } else {
    let intermediate: DedupedStatement[] = [];
    const totalBatches = Math.ceil(dedupInput.length / BATCH_SIZE);
    for (let i = 0; i < dedupInput.length; i += BATCH_SIZE) {
      const batch = dedupInput.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      process.stdout.write(`  Dedup batch ${batchNum}/${totalBatches}... `);
      const prompt = `Deduplicate. Keep distinct claims SEPARATE.\n<statements>\n${JSON.stringify(batch, null, 2)}\n</statements>\nReturn: [{"id": 1, "statement": "...", "topic": "...", "author_ids": ["..."]}, ...]`;
      const raw = await provider.complete(prompt, DEDUP_SYSTEM);
      const result = parseJSON<DedupedStatement[]>(raw);
      intermediate.push(...result);
      process.stdout.write(`${batch.length} → ${result.length}\n`);
    }
    // Final merge
    process.stdout.write(`  Final merge (${intermediate.length})... `);
    const finalPrompt = `Deduplicate. Keep distinct claims SEPARATE.\n<statements>\n${JSON.stringify(intermediate.map(s => ({ statement: s.statement, topic: s.topic, participant_id: s.author_ids[0] })), null, 2)}\n</statements>\nReturn: [{"id": 1, "statement": "...", "topic": "...", "author_ids": ["..."]}, ...]`;
    const raw = await provider.complete(finalPrompt, DEDUP_SYSTEM);
    deduped = parseJSON<DedupedStatement[]>(raw);
    process.stdout.write(`→ ${deduped.length}\n`);
  }

  console.log(`${filtered.length} → ${deduped.length} unique statements`);

  // Write CSVs
  const meta: SessionMeta = {
    title: values["session-title"]!,
    description: `Focused subset of gov/acc Phase 1 responses on: ${topic}. For Workshop #3 — Agentic Allocation.`,
    participant_count: new Set(filtered.map((s) => s.participant_id)).size,
    created_at: new Date().toISOString(),
  };

  console.log(`\nWriting CSVs to ${outputDir}/`);
  writeCSVs(deduped, meta, outputDir);
  console.log(`\nDone! ${deduped.length} statements for the Agentic Allocation workshop.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
