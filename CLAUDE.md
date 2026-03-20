# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Harmonica-to-Agora bridge — CLI tool that synthesizes Harmonica session responses into Polis-format CSVs for import into Agora Citizen Network. Part of the Harmonica ecosystem.

## Run

```bash
npx tsx src/index.ts --session <id> --provider openrouter --model meta-llama/llama-4-scout
```

Requires: `HARMONICA_API_KEY` and `OPENROUTER_API_KEY` (or provider-specific key) in env.

## Architecture

Pipeline: Fetch (Harmonica API) → Chunk (by participant) → Synthesize (LLM per participant) → Deduplicate (LLM) → Format (3 Polis CSVs)

LLM providers are interchangeable via `--provider` flag. Each implements `LLMProvider.complete(prompt, systemPrompt)`.

Caching: per-participant extraction results saved to `output/.cache/`. Use `--no-cache` to force re-run.

## Key Files

- `src/prompt.ts` — extraction and deduplication prompts (edit these to tune output quality)
- `src/types.ts` — all shared types
- `src/providers/` — one file per LLM provider
- `src/csv.ts` — Polis CSV format (summary, comments, votes)

## Repository

Own git repo at `harmonica-integrations/agora/`. Can be extracted to a standalone repo for publishing.
