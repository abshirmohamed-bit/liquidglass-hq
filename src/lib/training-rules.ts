export type TrainingKind = "THUMBNAIL" | "VIDEO";
/** Global entries feed every AI call; client entries only feed calls for that client. */
export function knowledgeScope(kind: TrainingKind, clientId: string | null) {
  return `${kind}_${clientId ? "CLIENT" : "GLOBAL"}`;
}
export const MAX_TRAINING_CHARS = 5_000_000;
/** Big pastes are stored whole; only this much is sent to the AI for extraction. */
export const EXTRACT_CHARS = 200_000;
export function knowledgeBlock(title: string, principles: (string | null)[]) {
  const rows = principles.filter((p): p is string => !!p?.trim());
  return `${title}:\n${rows.length ? rows.map((p) => `- ${p}`).join("\n") : "- None yet."}`;
}
