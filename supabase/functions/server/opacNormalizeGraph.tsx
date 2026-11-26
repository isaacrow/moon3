/**
 * Puts a stored record into the one shape the OPAC reads, however it was catalogued. Records made in the
 * BIBFRAME forms hold one text per field; records catalogued in MARC (or imported) hold a field's text in
 * both scripts (["Muqaddimat Ibn Khaldūn", "مقدمة ابن خلدون"] from 245 and its 880), as {"@value": …}, and
 * several titles, publications or extents as lists. Without this the OPAC showed such a title as raw JSON,
 * lost the author and the publication. The stored record is not changed: the OPAC reads a copy.
 *
 * - Text in two scripts: the Arabic form is shown (the OPAC is Arabic-first); the other form is kept as
 *   moon:otherScript on the node, for display beside it.
 * - Fields the OPAC shows once (title, publication, extent …): the main one — the title that is not a
 *   variant, the publication (not the manufacture or copyright) — with several extents joined.
 */

const ARABIC = /[؀-ۿ]/;
const SINGLE = new Set([
  'bf:title', 'bf:provisionActivity', 'bf:responsibilityStatement', 'bf:editionStatement', 'bf:extent',
  'bf:dimensions', 'bf:summary', 'bf:tableOfContents', 'bf:place', 'bf:agent', 'bf:role', 'bf:date', 'bf:carrier',
  'bf:media', 'bf:mainTitle', 'bf:subtitle', 'rdfs:label', 'bf:seriesStatement', 'bf:issuance',
]);
const JOIN = new Set(['bf:extent', 'bf:dimensions', 'bf:summary', 'bf:tableOfContents', 'bf:seriesStatement']);

const isLiteral = (v: any) => typeof v === 'string' || typeof v === 'number' || (v && typeof v === 'object' && '@value' in v && Object.keys(v).every((k) => k.startsWith('@')));
const lit = (v: any): string => (typeof v === 'object' && v ? String(v['@value'] ?? '') : String(v ?? '')).trim();
const types = (n: any): string[] => (Array.isArray(n?.['@type']) ? n['@type'] : [n?.['@type']]).filter((t: any) => typeof t === 'string');
const isVariant = (n: any) => types(n).some((t) => /VariantTitle|ParallelTitle|vartitletype/i.test(t));
const isPublication = (n: any) => types(n).some((t) => /Publication$/.test(t));

/** Literals in two scripts → the Arabic one, the other kept aside. */
function pickLiteral(values: any[]): { text: string; other?: string } {
  const texts = values.map(lit).filter(Boolean);
  const arabic = texts.find((t) => ARABIC.test(t));
  const latin = texts.find((t) => !ARABIC.test(t));
  const text = arabic || texts[0] || '';
  const other = arabic && latin ? latin : undefined;
  return other ? { text, other } : { text };
}

function normalizeValue(key: string, v: any, holder: any): any {
  if (Array.isArray(v)) {
    if (v.length && v.every(isLiteral)) {
      if (JOIN.has(key)) return v.map(lit).filter(Boolean).join(' ; ');
      const { text, other } = pickLiteral(v);
      if (other) holder['moon:otherScript'] = { ...(holder['moon:otherScript'] || {}), [key]: other };
      return text;
    }
    const nodes = v.map((x) => normalizeNode(x));
    if (!SINGLE.has(key)) return nodes;
    if (key === 'bf:title') return nodes.find((n) => n && typeof n === 'object' && !isVariant(n)) || nodes[0];
    if (key === 'bf:provisionActivity') return nodes.find(isPublication) || nodes[0];
    if (JOIN.has(key) && nodes.every((n) => n && typeof n === 'object')) {
      const labels = nodes.map((n: any) => (typeof n['rdfs:label'] === 'string' ? n['rdfs:label'] : '')).filter(Boolean);
      return labels.length ? { ...nodes[0], 'rdfs:label': labels.join(' ; ') } : nodes[0];
    }
    return nodes[0];
  }
  if (isLiteral(v) && typeof v === 'object') return lit(v);
  if (v && typeof v === 'object') return normalizeNode(v);
  return v;
}

function normalizeNode(n: any): any {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return n;
  const out: any = {};
  for (const [k, v] of Object.entries(n)) {
    if (k.startsWith('@')) { out[k] = v; continue; }
    out[k] = normalizeValue(k, v, out);
  }
  // A role given as a term or relator code ("editor", "edt") reads as a labelled role.
  if (typeof out['bf:role'] === 'string') out['bf:role'] = { 'rdfs:label': out['bf:role'] };
  // Plain-text extent and dimensions also under the keys the OPAC's Instance reader looks at first.
  if (typeof out['bf:extent'] === 'string' && !out.extent) out.extent = out['bf:extent'];
  if (typeof out['bf:dimensions'] === 'string' && !out.dimensions) out.dimensions = out['bf:dimensions'];
  return out;
}

/** The record's @graph in the OPAC's shape (a new array; the stored graph is untouched). */
export function normalizeForOpac(graph: any[]): any[] {
  return graph.map((n) => normalizeNode(n));
}
