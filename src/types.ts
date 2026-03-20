// === Harmonica API types ===

export interface HarmonicaMessage {
  message_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface HarmonicaParticipant {
  participant_id: string;
  display_name: string;
  message_count: number;
  messages: HarmonicaMessage[];
}

export interface HarmonicaResponse {
  participants: HarmonicaParticipant[];
}

// === Synthesis types ===

export interface ExtractedStatement {
  statement: string;
  topic: "problem" | "solution" | "actor";
}

export interface ParticipantStatements {
  participant_id: string;
  display_name: string;
  statements: ExtractedStatement[];
}

export interface DedupedStatement {
  id: number;
  statement: string;
  topic: "problem" | "solution" | "actor";
  author_ids: string[];
}

// === LLM Provider ===

export interface LLMProvider {
  complete(prompt: string, systemPrompt: string): Promise<string>;
}

// === Session metadata (for CSV summary) ===

export interface SessionMeta {
  title: string;
  description: string;
  participant_count: number;
  created_at: string;
}
