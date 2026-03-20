import type {
  HarmonicaResponse,
  HarmonicaParticipant,
  SessionMeta,
} from "./types.js";

const API_BASE = "https://app.harmonica.chat/api/v1";

export async function fetchSession(
  sessionId: string,
  apiKey: string
): Promise<{ meta: SessionMeta; participants: HarmonicaParticipant[] }> {
  // Fetch session details
  const sessionRes = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!sessionRes.ok) {
    throw new Error(`Harmonica session ${sessionRes.status}: ${await sessionRes.text()}`);
  }
  const session = await sessionRes.json();

  // Fetch responses
  const responsesRes = await fetch(`${API_BASE}/sessions/${sessionId}/responses`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!responsesRes.ok) {
    throw new Error(`Harmonica responses ${responsesRes.status}: ${await responsesRes.text()}`);
  }
  const data: HarmonicaResponse = await responsesRes.json();

  const meta: SessionMeta = {
    title: session.title || session.name || sessionId,
    description: session.goal || session.description || "",
    participant_count: data.participants.length,
    created_at: session.created_at || new Date().toISOString(),
  };

  return { meta, participants: data.participants };
}

export function getParticipantText(participant: HarmonicaParticipant): string {
  return participant.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");
}
