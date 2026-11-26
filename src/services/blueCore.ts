/**
 * Copy cataloguing from Blue Core (https://dev.bcld.info), the shared BIBFRAME store of the Library of
 * Congress and the LD4P libraries: search it, take a Work with its Instance (or an Instance with its Work)
 * into Moon Studio, and give names and subjects that arrive as bare LC links their LC labels.
 *
 * Only Blue Core's public, read-only API is used (no account). Blue Core and id.loc.gov both allow calls
 * from the browser. The fetch function is a parameter so this runs in tests without the network.
 */
import { importBibframe, ImportedRecord } from './bibframeImport';

export const BLUE_CORE = 'https://dev.bcld.info';
const CONTEXT_URL = 'https://bibframe-json.org/v0.1/context/bibframe.jsonld';
type Fetch = typeof fetch;

export interface BlueCoreHit {
  type: 'works' | 'instances';
  uuid: string;
  uri: string;
  title: string;
  /** The Arabic-script form of the title, when Blue Core has one. */
  titleArabic?: string;
  date?: string;
  lccn?: string;
}

const ARABIC = /[؀-ۿ]/;
const values = (v: any): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v])
  .map((x: any) => (typeof x === 'string' ? x : x?.['@value'])).filter((x: any) => typeof x === 'string' && x.trim());

function hitOf(r: any): BlueCoreHit | null {
  if (r?.type !== 'works' && r?.type !== 'instances') return null;
  const d = r.data || {};
  const titles = (Array.isArray(d.title) ? d.title : []).find((t: any) => [].concat(t?.['@type'] || []).includes('Title' as never)) || d.title?.[0];
  const mains = values(titles?.mainTitle);
  const date = (Array.isArray(d.provisionActivity) ? d.provisionActivity : []).flatMap((p: any) => values(p.date).concat(values(p['bflc:simpleDate'])))[0];
  const lccn = (Array.isArray(d.identifiedBy) ? d.identifiedBy : []).filter((i: any) => [].concat(i?.['@type'] || []).includes('Lccn' as never))
    .flatMap((i: any) => values(i['rdf:value']))[0];
  return {
    type: r.type, uuid: r.uuid, uri: r.uri,
    title: mains.find((m) => !ARABIC.test(m)) || mains[0] || '(untitled)',
    titleArabic: mains.find((m) => ARABIC.test(m)),
    ...(date ? { date } : {}), ...(lccn ? { lccn: lccn.trim() } : {}),
  };
}

/** Searches Blue Core's Works and Instances (hubs are left out: they are not records to catalogue). */
export async function searchBlueCore(q: string, options: { type?: 'works' | 'instances' | 'all'; limit?: number; offset?: number; fetchImpl?: Fetch } = {}) {
  const f = options.fetchImpl || fetch;
  const params = new URLSearchParams({ q, type: options.type || 'all', limit: String(options.limit || 20), offset: String(options.offset || 0) });
  const res = await f(`${BLUE_CORE}/api/search/?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Blue Core search failed (${res.status}).`);
  const json = await res.json();
  return { total: Number(json.total) || 0, hits: (json.results || []).map(hitOf).filter(Boolean) as BlueCoreHit[] };
}

const contextCache = new Map<Fetch, Promise<any>>();
function loadContext(f: Fetch) {
  if (!contextCache.has(f)) {
    contextCache.set(f, f(CONTEXT_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error('The BIBFRAME JSON context could not be loaded.')))).then((j) => j['@context']));
  }
  return contextCache.get(f)!;
}

async function getJsonLd(f: Fetch, uri: string): Promise<any> {
  const path = uri.replace(BLUE_CORE, `${BLUE_CORE}/api`);
  const res = await f(path, { headers: { Accept: 'application/ld+json' } });
  if (!res.ok) throw new Error(`Blue Core could not return ${uri} (${res.status}).`);
  return res.json();
}

const firstRef = (v: any): string | undefined => {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' ? x : x?.['@id'];
};

/** The LC label (romanized and, when LC has one, Arabic script) of an id.loc.gov name or subject. */
export async function lcLabels(uri: string, f: Fetch = fetch): Promise<string[]> {
  const authority = uri.replace('/rwo/agents/', '/authorities/names/').replace(/^http:/, 'https:');
  if (!/^https:\/\/id\.loc\.gov\/authorities\/(names|subjects|genreForms)\//.test(authority)) return [];
  const res = await f(`${authority}.json`);
  if (!res.ok) return [];
  const nodes: any[] = await res.json();
  const id = authority.replace(/^https:/, 'http:');
  const node = nodes.find((n) => n['@id'] === id) || {};
  const labels = (node['http://www.loc.gov/mads/rdf/v1#authoritativeLabel'] || []).map((l: any) => l['@value']).filter(Boolean);
  return [...new Set(labels as string[])];
}

/** Gives names, subjects and genres that are bare LC links their LC labels (best effort, never fails). */
async function addLabels(record: ImportedRecord, f: Fetch) {
  const targets: any[] = [];
  const visit = (v: any) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    const id = v['@id'];
    if (typeof id === 'string' && /id\.loc\.gov\/(rwo\/agents|authorities)\//.test(id) && !v['rdfs:label']) targets.push(v);
    Object.entries(v).forEach(([k, x]) => { if (k !== '@id') visit(x); });
  };
  for (const key of ['bf:contribution', 'bf:subject', 'bf:genreForm']) visit(record.work?.[key]);
  await Promise.all(targets.map(async (node) => {
    try {
      const labels = await lcLabels(node['@id'], f);
      if (labels.length) node['rdfs:label'] = labels.length === 1 ? labels[0] : labels;
    } catch { /* the link stays; the label can be added by hand */ }
  }));
}

/**
 * Blue Core resources (a Work, its Instance) read with Blue Core's context into a Moon editor record. Also how a
 * record Moon wrote in Blue Core's shape (server/blueCoreExport.tsx) comes back, so one record goes both ways.
 */
export async function importBlueCoreResources(context: any, resources: any[]): Promise<ImportedRecord> {
  const strip = (n: any) => { const { '@context': _c, ...rest } = n || {}; return rest; };
  const record = await importBibframe(JSON.stringify({ '@context': context, '@graph': resources.map(strip) }), 'jsonld');
  if (!record || (!record.work && !record.instance)) throw new Error('Blue Core returned no Work or Instance for this record.');
  return record;
}

/** Takes a Blue Core Work or Instance, with the record it is linked to, as a Moon editor record. */
export async function importFromBlueCore(hit: Pick<BlueCoreHit, 'type' | 'uri'>, fetchImpl: Fetch = fetch): Promise<ImportedRecord> {
  const f = fetchImpl;
  const [context, first] = await Promise.all([loadContext(f), getJsonLd(f, hit.uri)]);
  const otherUri = hit.type === 'works' ? firstRef(first.hasInstance) : firstRef(first.instanceOf);
  const other = otherUri ? await getJsonLd(f, otherUri).catch(() => null) : null;
  const record = await importBlueCoreResources(context, [first, ...(other ? [other] : [])]);
  await addLabels(record, f);
  // Where it came from, as BIBFRAME records it: the new description is derived from Blue Core's.
  const work = record.work || {};
  work['bf:adminMetadata'] = { '@type': 'bf:AdminMetadata', 'bf:derivedFrom': { '@id': hit.type === 'works' ? hit.uri : otherUri || hit.uri } };
  // Moon mints its own URIs for the copy; Blue Core's stay as the source above.
  delete work['@id'];
  if (record.instance) delete record.instance['@id'];
  return { ...record, work };
}
