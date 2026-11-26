/**
 * A record's copies (holdings): each physical copy is a BIBFRAME Item of the Instance, shaped as LC's
 * Item profile shapes it:
 *   bf:heldBy → the library (bf:Organization, rdfs:label)
 *   bf:sublocation → where in the library (bf:Sublocation, rdfs:label)
 *   bf:shelfMark → the call number on the spine (bf:ShelfMark, rdfs:label)
 *   bf:identifiedBy → the barcode (bf:Barcode, rdf:value) and the accession number (bf:AccessionNumber, rdf:value)
 *   bf:enumerationAndChronology → the copy number (bf:Enumeration, rdfs:label "c. 2")
 *   bf:usageAndAccessPolicy → "Reference only" (bf:UsePolicy)
 *   bf:note → a note (bf:Note, rdfs:label)
 *   moon:transmission → the manuscript's notes as events (ijāzah, samāʿ, ownership …; see transmission.ts),
 *   with ownership and waqf summed up in bf:custodialHistory
 */
import { type TransmissionEvent, eventToNode, nodeToEvent, custodialHistory } from './transmission.tsx';
import { withCondition, conditionOf, isBindingNote, type CopyCondition } from './specialVocab.tsx';

export interface ItemCopy extends CopyCondition {
  /** The Item's URI. */
  id: string;
  library: string;
  location: string;
  shelfMark: string;
  barcode: string;
  /** The accession number, when the copy has one (from the library's accession sequence or typed). */
  accession?: string;
  copyNumber: string;
  referenceOnly: boolean;
  note: string;
  /** What the manuscript's notes record about this copy. */
  events?: TransmissionEvent[];
}

export const REFERENCE_ONLY = 'Reference only — للاطلاع فقط';

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** The text of a literal or a labelled node: "x", { "@value": "x" }, { "rdfs:label": "x" }, { "rdf:value": "x" }. */
export function textOf(v: any): string {
  for (const x of list(v)) {
    if (typeof x === 'string' || typeof x === 'number') return String(x).trim();
    if (x && typeof x === 'object') {
      const inner = x['@value'] ?? x['rdfs:label'] ?? x['label'] ?? x['rdf:value'] ?? x['value'];
      const t = inner === undefined ? '' : textOf(inner);
      if (t) return t;
    }
  }
  return '';
}

const typeIs = (node: any, name: string) => list(node?.['@type']).some((t) => typeof t === 'string' && (t === `bf:${name}` || t === name || t.endsWith(`/${name}`)));

/** The manuscript notes on an Item, when it has any (a copy without notes has no events key). */
function eventsOf(node: any): { events?: TransmissionEvent[] } {
  const events = list(node?.['moon:transmission']).map(nodeToEvent).filter((e): e is TransmissionEvent => !!e);
  return events.length ? { events } : {};
}

/** Reads a bf:Item node (as Moon writes it, or as older or imported records have it) into a copy. */
export function nodeToCopy(node: any): ItemCopy {
  const ids = list(node?.['bf:identifiedBy'] ?? node?.['identifiedBy']);
  const barcodeNode = ids.find((i) => typeIs(i, 'Barcode'));
  const accessionNode = ids.find((i) => typeIs(i, 'AccessionNumber'));
  const copyRaw = textOf(node?.['bf:enumerationAndChronology'] ?? node?.['enumerationAndChronology'] ?? node?.['copyNumber']);
  const policies = list(node?.['bf:usageAndAccessPolicy'] ?? node?.['usageAndAccessPolicy']);
  return {
    id: String(node?.['@id'] || ''),
    library: textOf(node?.['bf:heldBy'] ?? node?.['heldBy']),
    location: textOf(node?.['bf:sublocation'] ?? node?.['sublocation'] ?? node?.['bf:physicalLocation'] ?? node?.['physicalLocation']),
    shelfMark: textOf(node?.['bf:shelfMark'] ?? node?.['shelfMark']),
    barcode: barcodeNode ? textOf(barcodeNode) : textOf(node?.['bf:barcode'] ?? node?.['barcode']),
    ...(accessionNode && textOf(accessionNode) ? { accession: textOf(accessionNode) } : {}),
    copyNumber: copyRaw.replace(/^c\.\s*/i, ''),
    referenceOnly: policies.some((p) => /reference|للاطلاع/i.test(textOf(p))) || node?.['status'] === 'reference_only',
    note: textOf(list(node?.['bf:note'] ?? node?.['note']).filter((n) => !isBindingNote(n))),
    ...eventsOf(node),
    // The copy's physical description from ARM (S24): binding, condition, markings, actions.
    ...conditionOf(node),
  };
}

/** Whether a copy says anything a reader could use (an empty Item is not a copy). */
export function hasCopyData(c: ItemCopy): boolean {
  return !!(c.library || c.location || c.shelfMark || c.barcode || c.accession?.trim() || c.copyNumber || c.note || c.events?.length
    || c.binding?.trim() || c.condition?.trim() || c.marks?.some((m) => m.text.trim()) || c.actions?.length);
}

/** Writes a copy as a bf:Item of the Instance. */
export function copyToNode(c: ItemCopy, instanceId: string): any {
  const node: any = { '@id': c.id, '@type': 'bf:Item', 'bf:itemOf': { '@id': instanceId } };
  const t = (s: string) => s.trim();
  if (t(c.library)) node['bf:heldBy'] = { '@type': 'bf:Organization', 'rdfs:label': t(c.library) };
  if (t(c.location)) node['bf:sublocation'] = { '@type': 'bf:Sublocation', 'rdfs:label': t(c.location) };
  if (t(c.shelfMark)) node['bf:shelfMark'] = { '@type': 'bf:ShelfMark', 'rdfs:label': t(c.shelfMark) };
  const ids: any[] = [];
  if (t(c.barcode)) ids.push({ '@type': 'bf:Barcode', 'rdf:value': t(c.barcode) });
  if (t(c.accession || '')) ids.push({ '@type': 'bf:AccessionNumber', 'rdf:value': t(c.accession || '') });
  if (ids.length) node['bf:identifiedBy'] = ids;
  if (t(c.copyNumber)) node['bf:enumerationAndChronology'] = { '@type': 'bf:Enumeration', 'rdfs:label': `c. ${t(c.copyNumber)}` };
  if (c.referenceOnly) node['bf:usageAndAccessPolicy'] = { '@type': 'bf:UsePolicy', 'rdfs:label': REFERENCE_ONLY };
  if (t(c.note)) node['bf:note'] = { '@type': 'bf:Note', 'rdfs:label': t(c.note) };
  const events = (c.events || []).filter((e) => e.participants.some((p) => p.label.trim()) || e.date || e.text || e.place?.label);
  if (events.length) {
    node['moon:transmission'] = events.map(eventToNode);
    const history = custodialHistory(events);
    if (history) node['bf:custodialHistory'] = history;
  }
  // Moon's vocabularies live beside its resources: …/resource/vocab/… (the base is the Instance's).
  const base = instanceId.match(/^(.*)\/instance\/[^/#]+$/)?.[1] || 'https://mooon.site/resource';
  return withCondition(node, c, base);
}

/** A new copy's URI, next to the Instance's: …/resource/instance/<id> → …/resource/item/<id>-<random>. */
export function newCopyId(instanceId: string): string {
  const tail = Math.random().toString(36).slice(2, 8);
  const m = instanceId.match(/^(.*)\/instance\/([^/#]+)$/);
  return m ? `${m[1]}/item/${m[2]}-${tail}` : `${instanceId.replace(/#.*$/, '')}#item-${tail}`;
}

export function emptyCopy(instanceId: string, like?: ItemCopy): ItemCopy {
  return {
    id: newCopyId(instanceId),
    library: like?.library || '',
    location: like?.location || '',
    shelfMark: like?.shelfMark || '',
    barcode: '',
    copyNumber: like?.copyNumber && /^\d+$/.test(like.copyNumber) ? String(Number(like.copyNumber) + 1) : '',
    referenceOnly: false,
    note: '',
  };
}
