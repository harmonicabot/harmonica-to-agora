# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Harmonica-to-Agora bridge — CLI tool that synthesizes Harmonica session responses into Polis-format CSVs for import into Agora Citizen Network. Part of the Harmonica ecosystem.

## Commands

```bash
# Full pipeline: fetch → synthesize → dedup → CSV
npx tsx src/index.ts --session <id> --provider openrouter --model meta-llama/llama-4-scout

# Filter cached results to a specific topic (e.g., for a focused workshop)
npx tsx src/filter.ts --topic "Grant System Dysfunction" --output ./output-workshop

# Type check
npx tsc --noEmit
```

Auth via env vars: `HARMONICA_API_KEY` + one of `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`. Also accepts `--llm-key` and `--harmonica-key` CLI flags.

## Architecture

**Pipeline:** Fetch (Harmonica API) → Chunk (by participant) → Synthesize (LLM per participant) → Deduplicate (LLM) → Format (3 Polis CSVs)

**LLM providers** are interchangeable via `--provider` flag (openrouter, anthropic, openai). Each implements `LLMProvider.complete(prompt, systemPrompt)` — prompt in, text out, no streaming.

**Caching:** Per-participant extraction results saved to `output/.cache/` as JSON. Re-runs skip already-processed participants. Use `--no-cache` to force re-run.

**Dedup batching:** Statements are deduplicated in batches of 50 (not 100 — larger batches cause JSON parse failures with smaller models). Cross-batch dedup runs recursively if intermediate results exceed batch size.

## Harmonica API

- Session details: `GET https://app.harmonica.chat/api/v1/sessions/{id}` — returns `topic`, `goal`, `created_at` (not `title`)
- Responses: `GET https://app.harmonica.chat/api/v1/sessions/{id}/responses` — returns `{data: [...]}` wrapper, not flat array. Each item has `participant_id`, `participant_name` (not `display_name`), `messages`

## Agora CSV Format (Polis import)

Three files required by Agora's `POST /api/v1/conversation/import-csv`:

- **summary.csv** — key-value pairs (no headers): topic, voters, commenters, comments, groups, conversation-description
- **comments.csv** — headers: timestamp, datetime, comment-id, author-id, agrees, disagrees, moderated, comment-body. `moderated` must be `1` (approved), not `0` (unmoderated)
- **votes.csv** — must have at least one data row (Agora rejects empty votes). Include one seed vote

## Key Files

- `src/prompt.ts` — extraction and dedup prompts (edit these to tune statement quality)
- `src/filter.ts` — topic filter for creating focused subsets from cached extractions
- `src/synthesize.ts` — orchestration with retry, caching, and batched dedup
- `src/csv.ts` — Polis CSV formatter
- `src/providers/` — one file per LLM provider (~30 lines each)

## Statement Quality Guidelines (from Agora/Polis)

Good seed statements are: one specific idea, easy to agree/disagree, under 280 chars, clear, not combined ("A and B" → split into two). Non-English statements should be translated.
