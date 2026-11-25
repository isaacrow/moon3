/**
 * bflc:marcKey: a MARC field written as one string, the way LC's marc2bibframe2 keeps it on agents and topics
 * ("1001 $aTwain, Mark,$d1835-1910."): tag, two indicators (blank as a space), then each subfield as
 * "$" + code + value. Moon keeps it on names and subjects read from MARC, and for fields it has no BIBFRAME
 * for, so the MARC comes back as it went in (Phase 13 S17). A "$" inside a value (a price, "$7.95") is written
 * {dollar}, MarcEdit's mnemonic for it, so it is not read as the start of a subfield.
 */
import type { DataField } from './marcRecord';

/** Subfields that are links or linkage, rebuilt from BIBFRAME on export ($0 $1 $6 $8). */
const LINKAGE = /^[0168]$/;

export function toMarcKey(f: DataField, drop: RegExp = LINKAGE): string {
  const ind = (c: string) => (c && c !== '#' && c !== '\\' ? c : ' ');
  return `${f.tag}${ind(f.ind1)}${ind(f.ind2)}${f.subfields.filter(([c]) => !drop.test(c)).map(([c, v]) => `$${c}${v.replace(/\$/g, '{dollar}')}`).join('')}`;
}

/** The field a marcKey names; null when it is not one ("100", two indicators, then $-subfields). */
export function fromMarcKey(key: unknown): DataField | null {
  if (typeof key !== 'string') return null;
  const m = key.match(/^(\d{3})(.)(.)(\$.*)$/s);
  if (!m || /^00/.test(m[1])) return null;
  const subfields = m[4].split('$').slice(1).filter((p) => p.length > 1 && /^[a-z0-9]$/.test(p[0])).map((p) => [p[0], p.slice(1).replace(/\{dollar\}/g, '$')] as [string, string]);
  return subfields.length ? { tag: m[1], ind1: m[2], ind2: m[3], subfields } : null;
}
