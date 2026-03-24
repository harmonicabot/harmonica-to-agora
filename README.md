# harmonica-to-agora

Bridge [Harmonica](https://harmonica.chat) session responses to [Agora Citizen Network](https://www.agoracitizen.network/) for opinion clustering and consensus mapping.

Harmonica captures rich qualitative data through AI-facilitated 1:1 interviews. This tool synthesizes those responses into votable opinion statements and exports them as Polis-format CSVs that Agora can import.

## Quick Start

```bash
git clone https://github.com/harmonicabot/harmonica-to-agora.git
cd harmonica-to-agora
npm install

# Set API keys
export HARMONICA_API_KEY=hm_live_...
export OPENROUTER_API_KEY=sk-or-...

# Run
npx tsx src/index.ts --session hst_your_session_id
```

Output: three CSV files in `./output/` — upload them to Agora's CSV import.

**Live example:** [gov/acc Phase 1 on Agora](https://www.agoracitizen.app/conversation/qF9yQ48) — 106 statements synthesized from 50+ governance practitioner interviews.

## LLM Providers

| Provider | Flag | Env Var | Example |
|----------|------|---------|---------|
| OpenRouter (default) | `--provider openrouter` | `OPENROUTER_API_KEY` | `--model meta-llama/llama-4-scout` |
| Anthropic | `--provider anthropic` | `ANTHROPIC_API_KEY` | `--model claude-sonnet-4-6` |
| Ollama (local) | `--provider openai` | — | `--model llama3.2 --api-url http://localhost:11434/v1` |
| Any OpenAI-compatible | `--provider openai` | `OPENAI_API_KEY` | `--model gpt-4o-mini --api-url https://api.together.xyz/v1` |

## Options

```
--session, -s <id>      Harmonica session ID (required)
--provider <name>       openrouter | anthropic | openai (default: openrouter)
--model <name>          Model ID (default: per-provider)
--api-url <url>         Base URL for openai provider
--output <dir>          Output directory (default: ./output)
--no-cache              Force re-run all participants
--harmonica-key <key>   Harmonica API key (or HARMONICA_API_KEY env var)
--llm-key <key>         LLM provider API key (or provider-specific env var)
```

## How It Works

1. **Fetch** — pulls all participant responses from a Harmonica session via API
2. **Synthesize** — for each participant, an LLM extracts votable opinion statements
3. **Deduplicate** — a final LLM pass merges near-duplicate statements across participants
4. **Export** — outputs three Polis-format CSVs (summary, comments, votes)

The tool caches per-participant results so you can resume interrupted runs or iterate on the deduplication step without re-processing all participants.

## Topic Filtering

Create focused subsets from cached extractions for specific workshops or themes:

```bash
npx tsx src/filter.ts --topic "Grant System Dysfunction" --output ./output-workshop
```

This reads the cached per-participant statements (from a previous full run) and filters them to a specific topic, then deduplicates and exports as CSVs.

## Output Format

Three CSV files compatible with Agora's Polis import:

- **summary.csv** — session metadata (title, participant count, etc.)
- **comments.csv** — opinion statements with IDs and author mapping
- **votes.csv** — empty (voting happens in Agora after import)

## Part of

- [Harmonica](https://harmonica.chat) — AI-facilitated structured deliberation
- [Agora Citizen Network](https://www.agoracitizen.network/) — Polis-style opinion clustering
- [gov/acc](https://gov-acc.metagov.org) — governance acceleration research with Metagov
