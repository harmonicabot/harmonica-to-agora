import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DedupedStatement, SessionMeta } from "./types.js";

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildParticipantIdMap(statements: DedupedStatement[]): Map<string, number> {
  const map = new Map<string, number>();
  let nextId = 1;
  for (const s of statements) {
    for (const pid of s.author_ids) {
      if (!map.has(pid)) {
        map.set(pid, nextId++);
      }
    }
  }
  return map;
}

export function writeCSVs(
  statements: DedupedStatement[],
  meta: SessionMeta,
  outputDir: string
): void {
  mkdirSync(outputDir, { recursive: true });
  const pidMap = buildParticipantIdMap(statements);
  const baseTimestamp = Math.floor(new Date(meta.created_at).getTime() / 1000);

  // Summary CSV (key-value, no headers)
  const summaryRows = [
    `topic,${escapeCSV(meta.title)}`,
    `voters,${meta.participant_count}`,
    `voters-in-conv,${meta.participant_count}`,
    `commenters,${pidMap.size}`,
    `comments,${statements.length}`,
    `groups,0`,
    `conversation-description,${escapeCSV(meta.description)}`,
  ];
  writeFileSync(join(outputDir, "summary.csv"), summaryRows.join("\n") + "\n");

  // Comments CSV
  const commentsHeader = "timestamp,datetime,comment-id,author-id,agrees,disagrees,moderated,comment-body";
  const commentsRows = statements.map((s, i) => {
    const ts = baseTimestamp + i;
    const dt = new Date(ts * 1000).toISOString();
    const authorId = pidMap.get(s.author_ids[0]) ?? 1;
    return `${ts},${dt},${s.id},${authorId},0,0,1,${escapeCSV(s.statement)}`;
  });
  writeFileSync(
    join(outputDir, "comments.csv"),
    [commentsHeader, ...commentsRows].join("\n") + "\n"
  );

  // Votes CSV (headers only)
  writeFileSync(
    join(outputDir, "votes.csv"),
    "timestamp,datetime,comment-id,voter-id,vote,important\n"
  );
}
