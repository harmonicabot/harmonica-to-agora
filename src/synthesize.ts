import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  LLMProvider,
  HarmonicaParticipant,
  ExtractedStatement,
  ParticipantStatements,
  DedupedStatement,
} from "./types.js";
import {
  EXTRACTION_SYSTEM,
  makeExtractionPrompt,
  DEDUP_SYSTEM,
  makeDedupPrompt,
} from "./prompt.js";
import { getParticipantText } from "./fetch.js";

function parseJSON<T>(raw: string): T {
  // Try direct parse
  try {
    return JSON.parse(raw);
  } catch {}
  // Try extracting from markdown code block
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }
  throw new Error("Failed to parse JSON from LLM response");
}

async function callWithRetry(
  provider: LLMProvider,
  prompt: string,
  systemPrompt: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await provider.complete(prompt, systemPrompt);
      // Validate it's parseable JSON
      parseJSON(result);
      return result;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(3, attempt) * 1000; // 1s, 3s, 9s
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

export async function synthesizeAll(
  participants: HarmonicaParticipant[],
  provider: LLMProvider,
  outputDir: string,
  useCache: boolean = true
): Promise<{ all: ParticipantStatements[]; skipped: string[] }> {
  const cacheDir = join(outputDir, ".cache");
  if (useCache) {
    mkdirSync(cacheDir, { recursive: true });
  }

  const results: ParticipantStatements[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const label = `[${i + 1}/${participants.length}] ${p.display_name || p.participant_id}`;

    // Check cache
    const cachePath = join(cacheDir, `${p.participant_id}.json`);
    if (useCache && existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
      results.push(cached);
      process.stdout.write(`${label}... cached (${cached.statements.length} statements)\n`);
      continue;
    }

    const text = getParticipantText(p);
    if (!text.trim()) {
      process.stdout.write(`${label}... skipped (no messages)\n`);
      continue;
    }

    try {
      process.stdout.write(`${label}... `);
      const raw = await callWithRetry(provider, makeExtractionPrompt(text), EXTRACTION_SYSTEM);
      const statements = parseJSON<ExtractedStatement[]>(raw);

      const result: ParticipantStatements = {
        participant_id: p.participant_id,
        display_name: p.display_name,
        statements,
      };
      results.push(result);

      if (useCache) {
        writeFileSync(cachePath, JSON.stringify(result, null, 2));
      }

      process.stdout.write(`${statements.length} statements\n`);
    } catch (err) {
      process.stdout.write(`FAILED (${(err as Error).message})\n`);
      skipped.push(p.display_name || p.participant_id);
    }
  }

  return { all: results, skipped };
}

export async function deduplicateStatements(
  participantStatements: ParticipantStatements[],
  provider: LLMProvider
): Promise<DedupedStatement[]> {
  // Flatten all statements with participant IDs
  const flat = participantStatements.flatMap((ps) =>
    ps.statements.map((s) => ({
      statement: s.statement,
      topic: s.topic,
      participant_id: ps.participant_id,
    }))
  );

  if (flat.length === 0) return [];

  // Batch if needed
  const BATCH_SIZE = 50;
  if (flat.length <= BATCH_SIZE) {
    const raw = await callWithRetry(provider, makeDedupPrompt(flat), DEDUP_SYSTEM);
    return parseJSON<DedupedStatement[]>(raw);
  }

  // Multi-batch dedup
  let intermediate: DedupedStatement[] = [];
  const totalBatches = Math.ceil(flat.length / BATCH_SIZE);
  for (let i = 0; i < flat.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}... `);
    const batch = flat.slice(i, i + BATCH_SIZE);
    const raw = await callWithRetry(provider, makeDedupPrompt(batch), DEDUP_SYSTEM);
    const deduped = parseJSON<DedupedStatement[]>(raw);
    intermediate.push(...deduped);
    process.stdout.write(`${batch.length} → ${deduped.length}\n`);
  }

  // Build a lookup from statement text to full author_ids from intermediate results
  const authorMap = new Map<string, string[]>();
  for (const s of intermediate) {
    const existing = authorMap.get(s.statement) || [];
    authorMap.set(s.statement, [...new Set([...existing, ...s.author_ids])]);
  }

  // Final cross-batch dedup (may itself need batching)
  let finalDeduped: DedupedStatement[];
  const crossInput = intermediate.map((s) => ({
    statement: s.statement,
    topic: s.topic,
    participant_id: s.author_ids[0],
  }));

  if (crossInput.length <= BATCH_SIZE) {
    process.stdout.write(`  Cross-batch dedup (${crossInput.length} statements)... `);
    const raw = await callWithRetry(provider, makeDedupPrompt(crossInput), DEDUP_SYSTEM);
    finalDeduped = parseJSON<DedupedStatement[]>(raw);
    process.stdout.write(`→ ${finalDeduped.length}\n`);
  } else {
    // Recursive batch the cross-batch dedup
    let crossIntermediate: DedupedStatement[] = [];
    const crossBatches = Math.ceil(crossInput.length / BATCH_SIZE);
    for (let i = 0; i < crossInput.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      process.stdout.write(`  Cross-batch ${batchNum}/${crossBatches}... `);
      const batch = crossInput.slice(i, i + BATCH_SIZE);
      const raw = await callWithRetry(provider, makeDedupPrompt(batch), DEDUP_SYSTEM);
      const deduped = parseJSON<DedupedStatement[]>(raw);
      crossIntermediate.push(...deduped);
      process.stdout.write(`${batch.length} → ${deduped.length}\n`);
    }
    // One final pass if still large
    if (crossIntermediate.length > BATCH_SIZE) {
      process.stdout.write(`  Final merge (${crossIntermediate.length} statements)... `);
      const finalInput = crossIntermediate.map((s) => ({
        statement: s.statement,
        topic: s.topic,
        participant_id: s.author_ids[0],
      }));
      const raw = await callWithRetry(provider, makeDedupPrompt(finalInput), DEDUP_SYSTEM);
      finalDeduped = parseJSON<DedupedStatement[]>(raw);
      process.stdout.write(`→ ${finalDeduped.length}\n`);
    } else {
      finalDeduped = crossIntermediate;
    }
  }

  // Re-merge full author_ids from intermediate results
  for (const s of finalDeduped) {
    const allAuthors = new Set(s.author_ids);
    for (const merged of intermediate) {
      if (s.statement === merged.statement || s.author_ids.some((a) => merged.author_ids.includes(a))) {
        for (const a of merged.author_ids) allAuthors.add(a);
      }
    }
    // Also check authorMap for statements that were merged
    const mapAuthors = authorMap.get(s.statement);
    if (mapAuthors) {
      for (const a of mapAuthors) allAuthors.add(a);
    }
    s.author_ids = [...allAuthors];
  }

  return finalDeduped;
}
