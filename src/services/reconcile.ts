/**
 * Reconciling Moon's entities with LC, VIAF and Wikidata (Phase 12, step 5). For an entity with no outside
 * link, Moon searches LC (an Arabic name in its ALA-LC romanization, as LC holds it), Wikidata and VIAF;
 * reads each candidate (LC or Wikidata record: its forms, dates, kind, and its own links); and scores it:
 *
 * - Kind must agree (a person is not matched to a place).
 * - Names: persons by the Arabic name engine (same ism-and-nasab chain or full name = sure; same known-by
 *   element = strong; a shared nisba alone = weak), in each script; places and subjects by their heading
 *   without qualifiers ("Baghdad (Iraq)" = "Baghdad").
 * - Dates: the same birth and death years make a match surer; different years rule it out.
 *
 * A match is "sure" when it scores high, its dates (if both sides have them) agree, and no other candidate
 * comes close; sure matches can be linked in one click, the rest wait for the cataloguer.
 */
import { sameNameScore, foldArabic, foldLatin } from './arabicNames';
import type { AuthorityResult } from './authoritySearch';
import type { EntityDraft } from './entityImport';
import { outsideRef, SAME_AS_HOSTS } from './entityImport';

export interface ReconcileEntity {
  id: string;
  kind: string;
  label: string;
  variants?: string[];
  data?: Record<string, unknown>;
}
export interface Candidate {
  uri: string;
  label: string;
  source: string;
  description?: string;
  score: number;
  reasons: string[];
  /** Every outside link the candidate brings (its own address and the links its record has). */
  links: string[];
}
export interface ReconcileDeps {
  searchLc: (query: string, scheme: 'names' | 'subjects') => Promise<AuthorityResult[]>;
  searchWikidata: (query: string) => Promise<AuthorityResult[]>;
  romanize: (query: string) => Promise<string>;
  details: (uri: string) => Promise<EntityDraft | null>;
}

const ARABIC = /[؀-ۿ]/;
const years = (s: string) => (s.match(/\b(\d{3,4})\s*[-–]\s*(\d{3,4})\b/) || []).slice(1).map(Number);
const yearOf = (v: unknown) => { const m = String(v ?? '').match(/-?\d{3,4}/); return m ? Number(m[0]) : undefined; };

/** Birth and death years an entity or a candidate gives (its data, else its heading's dates). */
export function lifeYears(label: string, data?: Record<string, unknown>): { born?: number; died?: number } {
  const born = yearOf(data?.birthDate), died = yearOf(data?.deathDate);
  if (born || died) return { born, died };
  const [b, d] = years(label);
  return b ? { born: b, died: d } : {};
}

/**
 * A heading folded for comparison. A place drops its qualifier ("Baghdad (Iraq)" = "Baghdad") and anything
 * after a comma; a subject keeps its subdivisions ("Islamic philosophy--Early works to 1800" is another
 * heading than "Islamic philosophy").
 */
export function headingKey(s: string, kind = "place"): string {
  const base = kind === "place" ? s.replace(/\([^)]*\)/g, " ").split(/--|،|,/)[0] : s.replace(/\s*--\s*/g, "--");
  return (ARABIC.test(base) ? foldArabic(base).replace(/^ال/, "") : foldLatin(base)).replace(/[^\p{L}\p{N}-]+/gu, " ").trim();
}

/** Words that make a name a body (publisher, press, university …), not a person. */
const BODY_WORDS = /\b(press|pr|books?|publish\w*|publications?|media|ltd|inc|co|company|corp\w*|university|univ|college|institute|library|museum|society|association|council|foundation|centre|center|house|group|editions?|verlag|firm|dar|maktabat|matbaat|matba'at)\b|&/i;

/**
 * A Latin name in one comparable form: no dates, no qualifier, in natural order. "Mitha, Farouk" and
 * "Farouk Mitha" and "Mitha, Farouk, 1960-" all give "farouk mitha". Arabic names are left to the Arabic
 * name engine. Bodies are not reordered ("Oxford, University of" stays as it is).
 */
export function latinNameKey(s: string): string {
  if (!s || ARABIC.test(s)) return '';
  const noDates = s.replace(/,?\s*(b\.|d\.|fl\.|ca\.)?\s*\d{3,4}\??\s*-?\s*(\d{3,4})?\??\s*\.?$/i, '').replace(/\([^)]*\)/g, ' ').trim();
  const parts = noDates.split(',').map((p) => p.trim()).filter(Boolean);
  const natural = parts.length === 2 && !BODY_WORDS.test(noDates) ? `${parts[1]} ${parts[0]}` : parts.join(' ');
  return foldLatin(natural).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Other forms worth searching for: a person written "First Last" as LC writes it ("Last, First"); "Pr" as "Press". */
export function searchForms(e: ReconcileEntity): string[] {
  const out: string[] = [];
  for (const f of [e.label, ...(e.variants || [])]) {
    if (!f || ARABIC.test(f)) continue;
    if (e.kind === 'agent') {
      const words = f.trim().split(/\s+/);
      if (!f.includes(',') && words.length >= 2 && words.length <= 4 && !BODY_WORDS.test(f) && !/\d/.test(f)) {
        out.push(`${words[words.length - 1]}, ${words.slice(0, -1).join(' ')}`);
      }
      const expanded = f.replace(/\bPr\.?$/i, 'Press').replace(/\bPub\.?$/i, 'Publishing').replace(/\bUniv\.?\b/i, 'University');
      if (expanded !== f) out.push(expanded);
    }
    // "Dystopias -- Fiction" as LC writes it, and its main heading on its own.
    if (e.kind === 'topic' && /\s--\s|--/.test(f)) {
      out.push(f.replace(/\s*--\s*/g, '--'));
      out.push(f.split(/\s*--\s*/)[0]);
    }
    // "New York, NY": the place's name on its own.
    if (e.kind === 'place' && f.includes(',')) out.push(f.split(',')[0].trim());
  }
  return [...new Set(out)].filter((f) => f && f !== e.label);
}

function nameScore(kind: string, mine: string[], theirs: string[]): number {
  let best = 0;
  for (const a of mine) for (const b of theirs) {
    if (!a || !b || ARABIC.test(a) !== ARABIC.test(b)) continue;
    // A person by name structure (the part after a comma is the rest of the name, not a qualifier).
    let s = kind === 'agent' ? sameNameScore(a, b) : headingKey(a, kind) === headingKey(b, kind) ? 1 : 0;
    // The same Latin name in another order ("Farouk Mitha" = "Mitha, Farouk, 1960-").
    if (kind === 'agent' && s < 1) { const ka = latinNameKey(a); if (ka && ka === latinNameKey(b)) s = 1; }
    best = Math.max(best, s);
  }
  return best;
}

/** An LC subject id for a free-floating subdivision ("History and criticism" = sh99001187): never a heading of its own. */
export const isSubdivision = (uri: string) => /id\.loc\.gov\/authorities\/subjects\/sh99\d+/.test(uri);

/** The qualifier a place gives: "NY" in "New York, NY", "Iraq" in "Baghdad (Iraq)"; folded, dots dropped. */
export function placeQualifier(s: string): string {
  const q = (s.match(/\(([^)]*)\)/) || [])[1] ?? (s.includes(',') ? s.split(',').slice(1).join(',') : '');
  return foldLatin(q).replace(/[^\p{L}\p{N}]+/gu, '').trim();
}

/** Two places' qualifiers agree when either has none, or one contains the other ("ny" in "newyorkny"). */
export function sameQualifier(a: string, b: string): boolean {
  const x = placeQualifier(a), y = placeQualifier(b);
  return !x || !y || x === y || x.includes(y) || y.includes(x);
}

/** Scores one candidate (its record read) against the entity. */
export function scoreCandidate(e: ReconcileEntity, found: AuthorityResult, draft: EntityDraft | null): Candidate | null {
  const kind = draft?.kind || '';
  if (kind && kind !== e.kind) return null;
  const mine = [e.label, ...(e.variants || [])];
  const theirs = [found.label, ...(draft ? [draft.label, ...draft.variants] : [])];
  const reasons: string[] = [];
  let score = nameScore(e.kind, mine, theirs);
  if (score >= 1) reasons.push('same name');
  else if (score >= 0.85) reasons.push('same name as known by');
  else if (score > 0) reasons.push('names share a part');
  const a = lifeYears(e.label, e.data);
  const b = draft ? lifeYears(draft.label, draft.details as any) : lifeYears(found.label);
  if (e.kind === 'agent' && (a.born || a.died) && (b.born || b.died)) {
    const near = (x?: number, y?: number) => x === undefined || y === undefined || Math.abs(x - y) <= 1;
    if (near(a.born, b.born) && near(a.died, b.died)) { score = Math.min(1, score + 0.1); reasons.push('same dates'); }
    else { score *= 0.2; reasons.push('different dates'); }
  }
  if (score <= 0) return null;
  // Never a one-click match: a subdivision is not a heading; a place with another qualifier is another place.
  if (e.kind === 'topic' && isSubdivision(found.uri)) reasons.push('a subdivision, not a heading');
  if (e.kind === 'place' && !sameQualifier(e.label, draft?.label || found.label)) reasons.push('another qualifier');
  const links = [...new Set([found.uri, ...(draft?.sameAs || [])].filter((u) => /^https?:\/\//.test(u)))];
  return { uri: found.uri, label: draft?.label || found.label, source: found.source, description: found.description, score, reasons, links };
}

/** Candidates for one entity, best first, LC and Wikidata results for one thing joined; and the sure match. */
export async function reconcileEntity(e: ReconcileEntity, deps: ReconcileDeps): Promise<{ candidates: Candidate[]; sure: Candidate | null }> {
  const forms = [...new Set([e.label, ...(e.variants || [])].map((s) => s.trim()).filter(Boolean))].slice(0, 4);
  // The forms as written first (their results come first), then the forms LC may hold ("Mitha, Farouk" for "Farouk Mitha").
  const latinForms = [...new Set([...forms.filter((f) => !ARABIC.test(f)), ...searchForms(e)])];
  const arabicForm = forms.find((f) => ARABIC.test(f));
  if (arabicForm && latinForms.length < 2) {
    // Romanized without its dates (ScriptShifter romanizes words; LC finds the heading by its name).
    const r = await deps.romanize(arabicForm.replace(/[،,]?\s*[\d٠-٩]{3,4}\s*[-–]\s*([\d٠-٩]{3,4})?\s*$/, '').trim()).catch(() => '');
    if (r) latinForms.push(r);
  }
  const scheme = e.kind === 'topic' || e.kind === 'genre' ? 'subjects' : 'names';
  const searches: Promise<AuthorityResult[]>[] = [
    ...latinForms.slice(0, 3).map((q) => deps.searchLc(q, scheme).catch(() => [])),
    deps.searchWikidata(arabicForm || forms[0]).catch(() => []),
    ...(latinForms[0] ? [deps.searchWikidata(latinForms[0]).catch(() => [])] : []),
  ];
  const seen = new Set<string>();
  const found = (await Promise.all(searches)).flat().filter((r) => r.uri && !seen.has(r.uri) && seen.add(r.uri));
  // Read the most promising few (by name alone) to get their links, dates and kind.
  const quick = found.map((f) => ({ f, s: nameScore(e.kind, forms.concat(latinForms), [f.label]) })).sort((x, y) => y.s - x.s).slice(0, 8);
  const scored = (await Promise.all(quick.map(async ({ f }) => scoreCandidate(e, f, await deps.details(f.uri).catch(() => null))))).filter((c): c is Candidate => !!c);
  // One thing found in LC and Wikidata (each links the other): one candidate with both sets of links.
  const joined: Candidate[] = [];
  for (const c of scored.sort((x, y) => y.score - x.score)) {
    const twin = joined.find((j) => j.links.some((l) => c.links.includes(l)));
    if (twin) { twin.links = [...new Set([...twin.links, ...c.links])]; twin.score = Math.max(twin.score, c.score); twin.reasons = [...new Set([...twin.reasons, ...c.reasons])]; }
    else joined.push({ ...c });
  }
  joined.sort((x, y) => y.score - x.score);
  const [top, next] = joined;
  // Sure: a high score, nothing close behind; a person also needs the same dates (two people can share a
  // name: LC has more than one Ibn Khaldūn), a place or subject its heading.
  const blocked = (c: Candidate) => c.reasons.some((r) => r === 'different dates' || r === 'a subdivision, not a heading' || r === 'another qualifier');
  const sure = top && top.score >= 0.95 && !blocked(top)
    && (e.kind !== 'agent' || top.reasons.includes('same dates'))
    && (!next || next.score <= top.score - 0.2) ? top : null;
  return { candidates: joined.slice(0, 5), sure };
}

/** A link in one form for comparing ("https://www.wikidata.org/wiki/Q1" = "http://www.wikidata.org/entity/Q1"). */
export function linkKey(u: string): string {
  const ref = outsideRef(u);
  return (ref ? ref.uri : u.trim()).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
}

export interface AcrossLink { uri: string; from: string; fromLabel: string }

/**
 * The links an entity's own outside records give (LC lists VIAF, Wikidata, FAST; Wikidata lists LC, VIAF,
 * ISNI, ORCID …) that the entity does not have yet. These are not guesses: the source itself says they are
 * the same, so they are sure. A record of another kind (a subject for a person) gives nothing.
 */
export async function linksAcross(e: { kind: string; sameAs?: string[] }, details: ReconcileDeps['details']): Promise<AcrossLink[]> {
  const have = new Set((e.sameAs || []).map(linkKey));
  const readable = [...new Set((e.sameAs || []).map((u) => outsideRef(u)?.uri).filter((u): u is string => !!u))];
  const out: AcrossLink[] = [];
  for (const from of readable) {
    const draft = await details(from).catch(() => null);
    if (!draft || (draft.kind && draft.kind !== e.kind)) continue;
    for (const uri of draft.sameAs || []) {
      if (!SAME_AS_HOSTS.test(uri) || uri.length > 300) continue;
      const k = linkKey(uri);
      if (have.has(k)) continue;
      have.add(k);
      out.push({ uri, from, fromLabel: draft.label });
    }
  }
  return out;
}
