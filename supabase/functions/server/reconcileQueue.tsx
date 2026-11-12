// The work list for linking Moon's entities to LC, VIAF and Wikidata (the Studio's "Link entities" panel).
//
// The panel used to take 100 entities of each kind and forget everything when it was closed. Now the server
// gives it every entity, in the order worth working on, with what cataloguers already decided:
//   - a candidate a cataloguer rejected is never offered again for that entity;
//   - an entity marked "no match" (it is not in LC or Wikidata: a local publisher, a small press) leaves the
//     list for NO_MATCH_DAYS, then comes back once, since LC and Wikidata keep growing.
// Linking itself still goes through POST /authorities/:id/same-as, which records who linked it, how and why.
// Pure: index.tsx passes the entities and the notes, so this is tested without a database.

export const NOTE_PREFIX = "moon:reconcile:";
export const NO_MATCH_DAYS = 180;
export const KINDS = ["agent", "place", "topic", "genre"] as const;
const MAX_REJECTED = 50;

export interface ReconcileNote {
  /** Candidate addresses a cataloguer said are NOT this entity. */
  rejected: string[];
  /** Marked as having no outside match, by whom and when. */
  noMatch?: { by: string; at: string };
  /** When the panel last searched for this entity (any result). */
  checkedAt?: string;
}

export interface QueueEntity {
  id: string; kind: string; label: string; variants?: string[]; data?: Record<string, unknown>;
  sameAs?: string[]; mergedInto?: string | null;
}

// "decision", not "note": an entity already has a free-text note of its own, which this must not hide.
export interface QueueRow extends QueueEntity { decision: ReconcileNote; linked: boolean }

const emptyNote = (): ReconcileNote => ({ rejected: [] });

/** A stored note, whatever is in the store (an old or broken value gives an empty note). */
export function readNote(v: unknown): ReconcileNote {
  const n = v && typeof v === "object" ? v as any : {};
  return {
    rejected: Array.isArray(n.rejected) ? n.rejected.filter((u: unknown) => typeof u === "string").slice(0, MAX_REJECTED) : [],
    ...(n.noMatch && typeof n.noMatch.at === "string" ? { noMatch: { by: String(n.noMatch.by || ""), at: n.noMatch.at } } : {}),
    ...(typeof n.checkedAt === "string" ? { checkedAt: n.checkedAt } : {}),
  };
}

const daysSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 86_400_000 : Infinity);

/**
 * Every entity worth working on, in order: entities with no outside link that were never searched, then
 * the ones searched before (they may find more now), then linked entities (their own records may list more
 * links). Merged entries, other kinds, and recent "no match" decisions are left out.
 */
export function queueOf(entities: QueueEntity[], notes: Map<string, unknown>, now = new Date()): QueueRow[] {
  const rows = entities
    .filter((e) => !e.mergedInto && (KINDS as readonly string[]).includes(e.kind) && e.label)
    .map((e) => ({ ...e, decision: readNote(notes.get(e.id)), linked: (e.sameAs || []).length > 0 }))
    .filter((r) => !(r.decision.noMatch && daysSince(r.decision.noMatch.at, now) < NO_MATCH_DAYS));
  const rank = (r: QueueRow) => (r.linked ? 2 : r.decision.checkedAt ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b) || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
}

export type NoteAction = { reject: string } | { noMatch: true } | { checked: true } | { clear: true };

/** What a cataloguer's decision changes in an entity's note. null when the request is not one of these. */
export function parseNoteAction(body: unknown): NoteAction | null {
  const b = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof b.reject === "string" && /^https?:\/\/\S{1,300}$/.test(b.reject.trim())) return { reject: b.reject.trim() };
  if (b.noMatch === true) return { noMatch: true };
  if (b.checked === true) return { checked: true };
  if (b.clear === true) return { clear: true };
  return null;
}

export function applyNote(prev: unknown, action: NoteAction, by: string, now = new Date()): ReconcileNote {
  const note = readNote(prev);
  const at = now.toISOString();
  if ("clear" in action) return emptyNote();
  if ("reject" in action) return { ...note, rejected: [...new Set([action.reject, ...note.rejected])].slice(0, MAX_REJECTED), checkedAt: at };
  if ("noMatch" in action) return { ...note, noMatch: { by: by.slice(0, 80), at }, checkedAt: at };
  return { ...note, checkedAt: at };
}
