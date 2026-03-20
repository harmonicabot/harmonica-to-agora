export const EXTRACTION_SYSTEM = `You are an expert at extracting opinion statements from interview transcripts for use in deliberation tools like Polis and Agora.

Your job is to identify distinct claims, positions, and opinions expressed by a participant and formulate each as a single votable statement that others can agree or disagree with.

Rules:
- Each statement must be a single, specific claim — not a question, not a summary
- Statements must be opinionated and votable (someone could agree or disagree)
- Use the participant's own language and framing where possible
- No neutral descriptions — "Token voting is common" is not votable; "Token voting concentrates power unfairly" is
- Skip greetings, meta-conversation ("thanks for having me"), and procedural talk
- Deduplicate within this participant — no repeated claims
- Aim for 3-10 statements per participant (fewer if they were brief, more if they covered many topics)

Respond ONLY with a JSON array. No markdown, no explanation.`;

export function makeExtractionPrompt(participantText: string): string {
  return `Extract opinion statements from this interview transcript.

<transcript>
${participantText}
</transcript>

Return a JSON array of objects with "statement" (string) and "topic" ("problem" | "solution" | "actor"):
[{"statement": "...", "topic": "problem"}, ...]`;
}

export const DEDUP_SYSTEM = `You are deduplicating opinion statements extracted from multiple interview participants.

Rules:
- Merge statements that express the same core claim in different words
- Keep the clearest, most specific wording
- Preserve distinct nuances — "voting participation is low" and "token voting concentrates power" are DIFFERENT claims, don't merge them
- Each merged statement gets a sequential id starting at 1
- Track all source participant IDs for each statement

Respond ONLY with a JSON array. No markdown, no explanation.`;

export function makeDedupPrompt(
  statements: Array<{ statement: string; topic: string; participant_id: string }>
): string {
  return `Deduplicate these opinion statements. Merge near-duplicates, keep distinct claims separate.

<statements>
${JSON.stringify(statements, null, 2)}
</statements>

Return a JSON array:
[{"id": 1, "statement": "...", "topic": "problem|solution|actor", "author_ids": ["participant_id_1", ...]}, ...]`;
}
