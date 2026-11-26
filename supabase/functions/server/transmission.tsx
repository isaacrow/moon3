/**
 * Transmission events (Phase 11, step 4): what the notes in a manuscript copy record — an ijāzah granted on
 * it, a samāʿ (audition) or qirāʾa (reading) held over it, who copied it, who owned it, who endowed it (waqf).
 * Each is an event on the copy (the bf:Item), with its people in their roles, its place, its date as written
 * (read in both calendars), where it is in the manuscript, and the note's own words.
 *
 * Linked data: the event is a node of the Item, typed moon:TransmissionEvent and its kind; its people are
 * bf:Contribution nodes (bf:agent + bf:role with an LC relator), so an agent can carry its Moon, LC, VIAF or
 * Wikidata address; place and date as bf:place and bf:date (with EDTF when the date can be read). Ownership
 * and waqf are also summed up in BIBFRAME's own bf:custodialHistory. MARC: 561 (ownership and custodial
 * history), 500 (the other notes), 700 for each person with $e and $4.
 */
import { readDate, bothCalendars } from './hijri.tsx';

export type EventKind = 'ijazah' | 'sama' | 'qiraa' | 'copying' | 'ownership' | 'waqf';
export type RoleKey = 'teacher' | 'student' | 'reader' | 'listener' | 'scribe' | 'owner' | 'endower' | 'beneficiary' | 'witness' | 'annotator';

export interface Participant { role: RoleKey; label: string; uri?: string }
export interface TransmissionEvent {
  id: string;
  kind: EventKind;
  participants: Participant[];
  place?: { label: string; uri?: string };
  /** As written in the manuscript ("رجب سنة 645 هـ"). */
  date?: string;
  /** Where in the manuscript (f. 120b, الورقة 3أ). */
  locator?: string;
  /** The note's own words. */
  text?: string;
}

export const EVENT_KINDS: Record<EventKind, { ar: string; en: string; roles: RoleKey[] }> = {
  ijazah: { ar: 'إجازة', en: 'Ijāzah (licence)', roles: ['teacher', 'student', 'witness'] },
  sama: { ar: 'سماع', en: 'Samāʿ (audition)', roles: ['teacher', 'reader', 'listener', 'scribe'] },
  qiraa: { ar: 'قراءة ومقابلة', en: 'Qirāʾa (reading, collation)', roles: ['reader', 'teacher', 'listener'] },
  copying: { ar: 'نسخ', en: 'Copying (colophon)', roles: ['scribe', 'owner'] },
  ownership: { ar: 'تملّك', en: 'Ownership', roles: ['owner'] },
  waqf: { ar: 'وقف', en: 'Waqf (endowment)', roles: ['endower', 'beneficiary', 'witness'] },
};

/** Roles, with the LC relator each is recorded with (asn, "associated name", for those LC has no term for). */
export const ROLES: Record<RoleKey, { ar: string; en: string; code: string }> = {
  teacher: { ar: 'الشيخ (المُجيز / المُسمِع)', en: 'teacher', code: 'tch' },
  student: { ar: 'الطالب (المُجاز)', en: 'student', code: 'asn' },
  reader: { ar: 'القارئ', en: 'reader', code: 'asn' },
  listener: { ar: 'السامع', en: 'listener', code: 'asn' },
  scribe: { ar: 'الناسخ', en: 'scribe', code: 'scr' },
  owner: { ar: 'المالك', en: 'former owner', code: 'fmo' },
  endower: { ar: 'الواقف', en: 'donor', code: 'dnr' },
  beneficiary: { ar: 'الموقوف عليه', en: 'beneficiary', code: 'asn' },
  witness: { ar: 'الشاهد', en: 'witness', code: 'wit' },
  annotator: { ar: 'صاحب التعليق', en: 'annotator', code: 'ann' },
};

const RELATORS = 'http://id.loc.gov/vocabulary/relators/';
const EDTF = 'http://id.loc.gov/datatypes/edtf';
const KIND_TYPE = (k: EventKind) => `moon:${k[0].toUpperCase()}${k.slice(1)}`;
const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === 'string' || typeof x === 'number') return String(x).trim();
    if (x && typeof x === 'object') { const t = text(x['@value'] ?? x['rdfs:label']); if (t) return t; }
  }
  return '';
};

/** One line saying what happened, for display and for MARC notes. */
export function summary(e: TransmissionEvent, ar = true): string {
  const kind = EVENT_KINDS[e.kind];
  const who = (role: RoleKey) => e.participants.filter((p) => p.role === role && p.label.trim()).map((p) => p.label.trim());
  const join = (xs: string[]) => xs.join(ar ? '، ' : ', ');
  const parts: string[] = [];
  const t = who('teacher'), s = who('student'), r = who('reader'), l = who('listener'), sc = who('scribe'), o = who('owner'), en = who('endower'), b = who('beneficiary');
  if (ar) {
    if (e.kind === 'ijazah') parts.push(`إجازة${t.length ? ` من ${join(t)}` : ''}${s.length ? ` لـ ${join(s)}` : ''}`);
    else if (e.kind === 'sama') parts.push(`سماع${t.length ? ` على ${join(t)}` : ''}${r.length ? ` بقراءة ${join(r)}` : ''}${l.length ? `، وسمع ${join(l)}` : ''}`);
    else if (e.kind === 'qiraa') parts.push(`قراءة${r.length ? ` ${join(r)}` : ''}${t.length ? ` على ${join(t)}` : ''}`);
    else if (e.kind === 'copying') parts.push(`نسخه${sc.length ? ` ${join(sc)}` : ''}${o.length ? ` لـ ${join(o)}` : ''}`);
    else if (e.kind === 'ownership') parts.push(`تملّكه${o.length ? ` ${join(o)}` : ''}`);
    else if (e.kind === 'waqf') parts.push(`وقفه${en.length ? ` ${join(en)}` : ''}${b.length ? ` على ${join(b)}` : ''}`);
  } else {
    const names = (xs: string[], pre: string) => (xs.length ? ` ${pre} ${join(xs)}` : '');
    if (e.kind === 'ijazah') parts.push(`Ijāzah${names(t, 'from')}${names(s, 'to')}`);
    else if (e.kind === 'sama') parts.push(`Samāʿ${names(t, 'with')}${names(r, 'read by')}${names(l, 'heard by')}`);
    else if (e.kind === 'qiraa') parts.push(`Read${names(r, 'by')}${names(t, 'with')}`);
    else if (e.kind === 'copying') parts.push(`Copied${names(sc, 'by')}${names(o, 'for')}`);
    else if (e.kind === 'ownership') parts.push(`Owned${names(o, 'by')}`);
    else if (e.kind === 'waqf') parts.push(`Endowed${names(en, 'by')}${names(b, 'for')}`);
  }
  if (!parts[0]) parts.push(ar ? kind.ar : kind.en);
  if (e.place?.label) parts.push(e.place.label);
  if (e.date) {
    const r2 = readDate(e.date);
    parts.push(r2.from !== undefined && r2.gregorian === undefined ? `${e.date} (${bothCalendars(r2, ar)})` : e.date);
  }
  if (e.locator) parts.push(e.locator);
  return parts.join(ar ? '، ' : ', ');
}

/** The event as a node of the Item. */
export function eventToNode(e: TransmissionEvent): any {
  const node: any = { '@id': e.id, '@type': ['moon:TransmissionEvent', KIND_TYPE(e.kind)], 'rdfs:label': summary(e, true) };
  const people = e.participants.filter((p) => p.label.trim());
  if (people.length) {
    node['moon:participant'] = people.map((p) => ({
      '@type': 'bf:Contribution',
      'bf:agent': { ...(p.uri ? { '@id': p.uri } : {}), '@type': 'bf:Person', 'rdfs:label': p.label.trim() },
      'bf:role': { '@id': `${RELATORS}${ROLES[p.role].code}`, 'rdfs:label': ROLES[p.role].en, 'moon:roleInEvent': p.role },
    }));
  }
  if (e.place?.label) node['bf:place'] = { ...(e.place.uri ? { '@id': e.place.uri } : {}), '@type': 'bf:Place', 'rdfs:label': e.place.label };
  if (e.date?.trim()) {
    const r = readDate(e.date);
    node['bf:date'] = r.edtf ? [e.date.trim(), { '@value': r.edtf, '@type': EDTF }] : e.date.trim();
  }
  if (e.locator?.trim()) node['moon:locator'] = e.locator.trim();
  if (e.text?.trim()) node['moon:transcription'] = e.text.trim();
  return node;
}

/** Reads an event node back (as Moon writes it). */
export function nodeToEvent(n: any): TransmissionEvent | null {
  const types = list(n?.['@type']).map(String);
  const kind = (Object.keys(EVENT_KINDS) as EventKind[]).find((k) => types.includes(KIND_TYPE(k)));
  if (!kind) return null;
  const participants: Participant[] = list(n['moon:participant']).map((c: any) => {
    const roleKey = text(c?.['bf:role']?.['moon:roleInEvent']) as RoleKey;
    const code = String(c?.['bf:role']?.['@id'] || '').split('/').pop() || '';
    const role = (ROLES[roleKey] ? roleKey : (Object.keys(ROLES) as RoleKey[]).find((k) => ROLES[k].code === code)) || 'student';
    const agent = c?.['bf:agent'] || {};
    return { role, label: text(agent['rdfs:label']), ...(agent['@id'] ? { uri: String(agent['@id']) } : {}) };
  }).filter((p) => p.label);
  const place = n['bf:place'];
  return {
    id: String(n['@id'] || ''),
    kind,
    participants,
    ...(place ? { place: { label: text(place['rdfs:label'] ?? place), ...(place['@id'] ? { uri: String(place['@id']) } : {}) } } : {}),
    ...(n['bf:date'] ? { date: text(list(n['bf:date']).find((d: any) => typeof d === 'string') ?? n['bf:date']) } : {}),
    ...(n['moon:locator'] ? { locator: text(n['moon:locator']) } : {}),
    ...(n['moon:transcription'] ? { text: text(n['moon:transcription']) } : {}),
  };
}

/** Ownership and waqf in one line, for BIBFRAME's bf:custodialHistory (oldest first, as entered). */
export function custodialHistory(events: TransmissionEvent[]): string {
  return events.filter((e) => e.kind === 'ownership' || e.kind === 'waqf').map((e) => summary(e, true)).join(' ؛ ');
}

export function newEvent(itemId: string, kind: EventKind = 'ijazah'): TransmissionEvent {
  return { id: `${itemId.replace(/#.*$/, '')}#event-${Math.random().toString(36).slice(2, 8)}`, kind, participants: EVENT_KINDS[kind].roles.slice(0, 2).map((role) => ({ role, label: '' })) };
}

/** MARC for the events of one copy: 561 for ownership and waqf, 500 for the rest, 700 for each person. */
export function eventsToMarc(events: TransmissionEvent[]): Array<{ tag: string; ind1: string; ind2: string; subfields: [string, string][] }> {
  const out: Array<{ tag: string; ind1: string; ind2: string; subfields: [string, string][] }> = [];
  const seen = new Set<string>();
  for (const e of events) {
    const note = summary(e, true) + (e.text ? `: «${e.text.trim()}»` : '');
    out.push({ tag: e.kind === 'ownership' || e.kind === 'waqf' ? '561' : '500', ind1: e.kind === 'ownership' || e.kind === 'waqf' ? '1' : ' ', ind2: ' ', subfields: [['a', note]] });
  }
  for (const e of events) for (const p of e.participants) {
    const key = `${p.label}|${p.role}`;
    if (!p.label.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push({ tag: '700', ind1: '0', ind2: ' ', subfields: [['a', p.label.trim()], ['e', `${ROLES[p.role].en}.`], ...(p.uri ? [['0', p.uri] as [string, string]] : []), ['4', ROLES[p.role].code]] });
  }
  return out;
}
