/**
 * FOLIO to Moon (plan step H11, second half): reads the BIBFRAME file FOLIO's Data Export writes with its "Default
 * linked data export profile" (Trillium 2026) into Moon editor records, beside the file Moon writes for FOLIO's
 * linked-data import (server/folioLd.tsx).
 *
 * The format, from FOLIO's own code (not guessed):
 * - mod-data-export (v5.4.8, service/export/strategies/ld): LinkedDataExportStrategy writes one line per Instance,
 *   each line LinkedDataConverter's output: lib-linked-data-rdf4ld's mapLdToBibframe2Rdf, JSON-LD, not pretty-printed.
 * - lib-linked-data-rdf4ld (v1.0.0): RDF4J's JSON-LD writer, so each line is an expanded, flattened array of nodes in
 *   the BIBFRAME 2.0 vocabulary: the Instance, its Work (bf:instanceOf), titles, provision activities, identifiers,
 *   admin metadata (with the FOLIO HRID and Inventory UUID as bf:Local identifiers), contributions, subjects, genres.
 * - FOLIO's resources are named <FOLIO base URL>/linked-data-editor/resources/<id> (mod-data-export ResourceUrlProvider;
 *   lib-linked-data-rdf4ld's stand-in, used in its tests, is http://test-tobe-changed.folio.com/resources/<id>).
 *
 * Pure apart from the JSON-LD parsing importBibframe already does: no network.
 */
import { importBibframe, ImportedRecord } from './bibframeImport';

const BF = 'http://id.loc.gov/ontologies/bibframe/';
const FOLIO_RESOURCE = /^https?:\/\/[^\s]+\/linked-data-editor\/resources\/[^/\s]+$|^http:\/\/test-tobe-changed\.folio\.com\/resources\/[^/\s]+$/;
// Links between the record's own entities: Moon rebuilds them with its own addresses.
const ENTITY_LINKS = ['bf:instanceOf', 'bf:hasInstance', 'bf:hasItem', 'bf:itemOf', 'bf:hasExpression', 'bf:expressionOf'];

export const isFolioResource = (iri: unknown): iri is string => typeof iri === 'string' && FOLIO_RESOURCE.test(iri);

export interface FolioLdRecord extends ImportedRecord {
  /** A short title to choose the record by. */
  title: string;
  /** FOLIO's addresses for the Instance and Work, kept as the record's source. */
  folioInstance?: string;
  folioWork?: string;
  /** FOLIO's own numbers for the Instance, from its admin metadata. */
  hrid?: string;
  inventoryId?: string;
}

const types = (n: any): string[] => (Array.isArray(n?.['@type']) ? n['@type'] : n?.['@type'] ? [n['@type']] : []);
const isNodeList = (v: any): v is any[] => Array.isArray(v) && v.length > 0 && v.every((n) => n && typeof n === 'object' && !Array.isArray(n));

/**
 * The lines of a FOLIO linked-data export, each the node array of one Instance. Also takes one line saved as a
 * pretty-printed file. Returns [] when the text is not such an export.
 */
export function splitFolioLdExport(text: string): any[][] {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed.startsWith('[')) return [];
  let lines: any[][];
  try {
    const whole = JSON.parse(trimmed);
    lines = isNodeList(whole) ? [whole] : [];
  } catch {
    try {
      lines = trimmed.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }
  // FOLIO's: flattened nodes with full IRIs, an Instance on every line, and FOLIO's resource addresses.
  const ok = lines.length > 0 && lines.every((l) => isNodeList(l)
    && l.some((n) => types(n).includes(`${BF}Instance`))
    && l.some((n) => isFolioResource(n['@id'])));
  return ok ? lines : [];
}

export const isFolioLdExport = (text: string) => splitFolioLdExport(text).length > 0;

const one = (v: any) => (Array.isArray(v) ? v[0] : v);
const text = (v: any): string | undefined => {
  const x = one(v);
  return typeof x === 'string' ? x : typeof x?.['@value'] === 'string' ? x['@value'] : undefined;
};
const list = (v: any): any[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

/** Takes FOLIO's addresses off the descriptions inside the record (titles, publication …); Moon gives its own. */
function dropFolioIds(v: any): any {
  if (Array.isArray(v)) return v.map(dropFolioIds);
  if (!v || typeof v !== 'object') return v;
  const out: any = {};
  for (const [k, x] of Object.entries(v)) {
    // A described node loses FOLIO's address; a bare link to another FOLIO resource stays a link.
    if (k === '@id' && isFolioResource(x) && Object.keys(v).some((o) => o !== '@id')) continue;
    out[k] = k.startsWith('@') ? x : dropFolioIds(x);
  }
  return out;
}

/** FOLIO's HRID and Inventory UUID, which its admin metadata carries as bf:Local identifiers with a note. */
function folioNumbers(instance: any): { hrid?: string; inventoryId?: string } {
  const out: { hrid?: string; inventoryId?: string } = {};
  for (const admin of list(instance?.['bf:adminMetadata'])) {
    for (const id of list(admin?.['bf:identifiedBy'])) {
      const label = list(id?.['bf:note']).map((n) => text(n?.['rdfs:label'])).find(Boolean);
      const value = text(id?.['rdf:value']);
      if (!value) continue;
      if (label === 'FOLIO HRID') out.hrid = value;
      if (label === 'FOLIO Inventory UUID') out.inventoryId = value;
    }
  }
  return out;
}

function titleOf(record: ImportedRecord): string {
  for (const entity of [record.instance, record.work]) {
    const titles = list(entity?.['bf:title']);
    const main = titles.find((t) => list(t?.['@type']).includes('bf:Title')) || titles[0];
    const t = text(main?.['bf:mainTitle']);
    if (t) return t;
  }
  return '(untitled)';
}

/** One line of FOLIO's export as a Moon editor record, with where it came from. */
export async function importFolioLdLine(nodes: any[]): Promise<FolioLdRecord> {
  const record = await importBibframe(JSON.stringify(nodes), 'jsonld');
  if (!record) throw new Error('This FOLIO record has no Work or Instance.');
  const folioInstance = isFolioResource(record.instance?.['@id']) ? record.instance['@id'] : undefined;
  const folioWork = isFolioResource(record.work?.['@id']) ? record.work['@id'] : undefined;
  const clean = (entity: any) => {
    if (!entity) return entity;
    const out = dropFolioIds(entity);
    if (isFolioResource(out['@id'])) delete out['@id'];
    for (const k of ENTITY_LINKS) {
      const kept = list(out[k]).filter((x) => !isFolioResource(x?.['@id']));
      if (kept.length) out[k] = kept.length === 1 ? kept[0] : kept; else delete out[k];
    }
    return out;
  };
  const work = clean(record.work);
  const instance = clean(record.instance);
  // Where it came from, as BIBFRAME records it (as for Blue Core copies): derived from FOLIO's description.
  const source = folioWork || folioInstance;
  if (source) {
    const derived = { '@type': 'bf:AdminMetadata', 'bf:derivedFrom': { '@id': source } };
    work['bf:adminMetadata'] = work['bf:adminMetadata'] ? [...list(work['bf:adminMetadata']), derived] : derived;
  }
  const out: FolioLdRecord = { work, instance, ...(record.item ? { item: clean(record.item) } : {}), title: '' };
  out.title = titleOf(out);
  if (folioInstance) out.folioInstance = folioInstance;
  if (folioWork) out.folioWork = folioWork;
  Object.assign(out, folioNumbers(instance));
  return out;
}

/** Every record in a FOLIO linked-data export file. */
export async function importFolioLdExport(fileText: string): Promise<FolioLdRecord[]> {
  const lines = splitFolioLdExport(fileText);
  if (!lines.length) throw new Error('This is not a FOLIO linked-data export (BIBFRAME JSON Lines from FOLIO Data Export).');
  const out: FolioLdRecord[] = [];
  for (const line of lines) out.push(await importFolioLdLine(line));
  return out;
}
