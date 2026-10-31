/**
 * BIBFRAME Normalizer
 *
 * Every serializer (Turtle, RDF/XML, N-Triples, JSON-LD) runs records through
 * normalizeBibframe() so that what leaves Moon is real BIBFRAME 3.0.1:
 *
 * 1. Only terms defined in the official LC ontologies (ontologies/bibframe.rdf,
 *    ontologies/bflc.rdf) are emitted in the bf: and bflc: namespaces.
 * 2. Invented terms with a real equivalent are rewritten to it
 *    (bf:creator -> bf:contribution, bf:isbn -> bf:identifiedBy/bf:Isbn, ...).
 * 3. Anything without an equivalent moves to Moon's own extension namespace
 *    (moonext:) instead of being silently dropped or falsely claimed as bf:.
 * 4. Plain-text values on object properties become proper nodes, and the
 *    plain-text copies of facts that already exist as structured nodes are removed.
 * 5. Shelf marks move from Work/Instance to the Item, where BIBFRAME puts them.
 */

import {
  BF_CLASSES, BF_OBJECT_PROPERTIES, BF_DATATYPE_PROPERTIES,
  BFLC_CLASSES, BFLC_OBJECT_PROPERTIES, BFLC_DATATYPE_PROPERTIES
} from './bibframeTerms.generated';
import { BASE_URI } from './uriMintingService';

const BF = 'http://id.loc.gov/ontologies/bibframe/';
const BFLC = 'http://id.loc.gov/ontologies/bflc/';
const LOC_VOCAB = 'http://id.loc.gov/vocabulary/';

/** Moon's own namespace for local extensions that BIBFRAME does not define. */
export const MOONEXT_NS = new URL('/ontology/', BASE_URI).toString();

const CORE_CONTEXT: Record<string, string> = {
  bf: BF,
  bflc: BFLC,
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  madsrdf: 'http://www.loc.gov/mads/rdf/v1#',
  moonext: MOONEXT_NS
};

// App bookkeeping fields that are not part of the description.
const INTERNAL_KEYS = new Set(['id', 'uri', 'created', 'updated', 'recordId', 'createdAt', 'updatedAt']);

// ---------------------------------------------------------------------------
// Term lookup
// ---------------------------------------------------------------------------

export function isOfficialTerm(term: string): boolean {
  const [prefix, local] = splitTerm(term);
  if (prefix === 'bf') return BF_CLASSES.has(local) || BF_OBJECT_PROPERTIES.has(local) || BF_DATATYPE_PROPERTIES.has(local);
  if (prefix === 'bflc') return BFLC_CLASSES.has(local) || BFLC_OBJECT_PROPERTIES.has(local) || BFLC_DATATYPE_PROPERTIES.has(local);
  return true; // other vocabularies are not policed here
}

function isObjectProperty(term: string): boolean {
  const [prefix, local] = splitTerm(term);
  if (prefix === 'bf') return BF_OBJECT_PROPERTIES.has(local);
  if (prefix === 'bflc') return BFLC_OBJECT_PROPERTIES.has(local);
  return false;
}

function splitTerm(term: string): [string, string] {
  const i = term.indexOf(':');
  return i < 0 ? ['', term] : [term.slice(0, i), term.slice(i + 1)];
}

/** Turns a key or type (full URI, prefixed name, or bare name) into a prefixed name. */
function canonicalTerm(key: string, ctx: Record<string, string>): string {
  if (key.startsWith('http://') || key.startsWith('https://')) {
    const match = Object.entries(ctx)
      .filter(([, ns]) => key.startsWith(ns) && !key.slice(ns.length).includes('/'))
      .sort((a, b) => b[1].length - a[1].length)[0];
    return match ? `${match[0]}:${key.slice(match[1].length)}` : key;
  }
  if (key.includes(':')) return key;
  if (key === 'label') return 'rdfs:label';
  if (key === 'comment') return 'rdfs:comment';
  if (key === 'value') return 'rdf:value';
  if (key === 'type') return 'rdf:type';
  // Serializers treat bare keys as bf:, so judge them as bf: too.
  return `bf:${key}`;
}

// ---------------------------------------------------------------------------
// Repairs for invented terms
// ---------------------------------------------------------------------------

interface Repair {
  to: string;        // official property to use instead
  wrap?: string;     // class for nodes built from plain-text values
  via?: string;      // property that holds the text in those nodes
}

const REPAIRS: Record<string, Repair> = {
  'bf:hasTitle': { to: 'bf:title' },
  'bf:variantTitle': { to: 'bf:title', wrap: 'bf:VariantTitle', via: 'bf:mainTitle' },
  'bf:alternativeTitle': { to: 'bf:title', wrap: 'bf:VariantTitle', via: 'bf:mainTitle' },
  'bf:abbreviatedTitle': { to: 'bf:title', wrap: 'bf:AbbreviatedTitle', via: 'bf:mainTitle' },
  'bf:preferredTitle': { to: 'bf:title', wrap: 'bf:Title', via: 'bf:mainTitle' },
  'bf:contentType': { to: 'bf:content' },
  'bf:mediaType': { to: 'bf:media' },
  'bf:carrierType': { to: 'bf:carrier' },
  'bf:modeOfIssuance': { to: 'bf:issuance' },
  'bf:statementOfResponsibility': { to: 'bf:responsibilityStatement' },
  'bf:physicalDescription': { to: 'bf:extent' },
  'bf:noteText': { to: 'bf:note' },
  'bf:geographicAreaCode': { to: 'bf:geographicCoverage' },
  'bf:subjectTopical': { to: 'bf:subject', wrap: 'bf:Topic' },
  'bf:subjectGeographic': { to: 'bf:subject', wrap: 'bf:Place' },
  'bf:subjectName': { to: 'bf:subject', wrap: 'bf:Agent' },
  'bf:governmentPublication': { to: 'bflc:governmentPubType' },
  'bf:projectedProvisionDate': { to: 'bflc:projectedProvisionDate' },
  'bf:catalogerId': { to: 'bflc:catalogerId' },
  'bf:accessibilityContent': { to: 'bf:contentAccessibility' },
  'bf:value': { to: 'rdf:value' },
  'bf:name': { to: 'rdfs:label' },
  'bf:label': { to: 'rdfs:label' },
  'bf:subLocation': { to: 'bf:sublocation' },
  'bflc:sublocation': { to: 'bf:sublocation' },
  'bf:continuationOf': { to: 'bf:continues' },
  'bf:basedOn': { to: 'bf:derivativeOf' },
  'bf:isbn': { to: 'bf:identifiedBy', wrap: 'bf:Isbn', via: 'rdf:value' },
  'bf:issn': { to: 'bf:identifiedBy', wrap: 'bf:Issn', via: 'rdf:value' },
  'bf:lccn': { to: 'bf:identifiedBy', wrap: 'bf:Lccn', via: 'rdf:value' },
  'bf:identifier': { to: 'bf:identifiedBy', wrap: 'bf:Identifier', via: 'rdf:value' },
  'bf:systemNumber': { to: 'bf:identifiedBy', wrap: 'bf:Local', via: 'rdf:value' },
  'bf:classificationLcc': { to: 'bf:classification', wrap: 'bf:ClassificationLcc', via: 'bf:classificationPortion' },
  'bf:classificationDdc': { to: 'bf:classification', wrap: 'bf:ClassificationDdc', via: 'bf:classificationPortion' },
  'bf:publication': { to: 'bf:provisionActivity', wrap: 'bf:Publication' },
  'bf:manufacture': { to: 'bf:provisionActivity', wrap: 'bf:Manufacture' },
  'bf:distribution': { to: 'bf:provisionActivity', wrap: 'bf:Distribution' },
  'bf:production': { to: 'bf:provisionActivity', wrap: 'bf:Production' }
};

// Invented flat publication fields, folded into one bf:Publication.
const PUBLICATION_PARTS: Record<string, { prop: string; type?: string }> = {
  'bf:publisher': { prop: 'bf:agent', type: 'bf:Agent' },
  'bf:placeOfPublication': { prop: 'bf:place', type: 'bf:Place' },
  'bf:publicationDate': { prop: 'bf:date' }
};

// Invented flat contributor fields, turned into bf:Contribution nodes.
const CONTRIBUTOR_KEYS = new Set(['bf:creator', 'bf:creatorUri', 'bf:additionalContributors']);

const TYPE_RENAMES: Record<string, string | null> = {
  'bf:Expression': 'bf:Work', // BIBFRAME models expressions as Works linked by bf:expressionOf
  'bf:Subject': 'bf:Topic',
  'bf:Geographic': 'bf:Place',
  'bf:Publisher': 'bf:Agent',
  'bf:GovernmentPublication': 'bflc:GovernmentPubType',
  'bf:Orcid': 'bf:Identifier',
  'bf:SystemNumber': 'bf:Local',
  'bf:IllustrativeContent': 'bf:Illustration',
  'bf:SubLocation': 'bf:Sublocation',
  'bf:AccessibilityContent': 'bf:ContentAccessibility',
  'bf:Object3D': 'bf:Object',
  'bf:Resource': null
};

// How a plain-text value on an official object property becomes a node.
// `vocab` turns code-like values (e.g. "ara", "txt") into LC vocabulary URIs.
interface Coercion { type?: string; via?: string; vocab?: (code: string) => string | undefined }

const code = (re: RegExp, base: string) => (s: string) => (re.test(s) ? `${base}${s}` : undefined);

const COERCIONS: Record<string, Coercion> = {
  'bf:title': { type: 'bf:Title', via: 'bf:mainTitle' },
  'bf:subject': { type: 'bf:Topic' },
  'bf:genreForm': { type: 'bf:GenreForm' },
  'bf:language': { type: 'bf:Language', vocab: code(/^[a-z]{3}$/, `${LOC_VOCAB}languages/`) },
  'bf:descriptionLanguage': { type: 'bf:Language', vocab: code(/^[a-z]{3}$/, `${LOC_VOCAB}languages/`) },
  'bf:content': { type: 'bf:Content', vocab: code(/^[a-z]{2,4}$/, `${LOC_VOCAB}contentTypes/`) },
  'bf:media': { type: 'bf:Media', vocab: code(/^[a-z]{1,2}$/, `${LOC_VOCAB}mediaTypes/`) },
  'bf:carrier': { type: 'bf:Carrier', vocab: code(/^[a-z]{2}$/, `${LOC_VOCAB}carriers/`) },
  'bf:issuance': { type: 'bf:Issuance', vocab: code(/^(mono|serl|intg|mulm)$/, `${LOC_VOCAB}issuance/`) },
  'bf:role': { type: 'bf:Role', vocab: code(/^[a-z]{3}$/, `${LOC_VOCAB}relators/`) },
  'bf:descriptionConventions': { type: 'bf:DescriptionConventions', vocab: code(/^[a-z]{2,8}$/, `${LOC_VOCAB}descriptionConventions/`) },
  'bf:geographicCoverage': {
    type: 'bf:GeographicCoverage',
    vocab: s => (/^[a-z]{1,2}-[a-z-]*$/.test(s) ? `${LOC_VOCAB}geographicAreas/${s.replace(/-+$/, '')}` : undefined)
  },
  'bf:agent': { type: 'bf:Agent' },
  'bf:heldBy': { type: 'bf:Agent' },
  'bf:place': { type: 'bf:Place' },
  'bf:identifiedBy': { type: 'bf:Identifier', via: 'rdf:value' },
  'bf:classification': { type: 'bf:Classification', via: 'bf:classificationPortion' },
  'bf:extent': { type: 'bf:Extent' },
  'bf:note': { type: 'bf:Note' },
  'bf:summary': { type: 'bf:Summary' },
  'bf:tableOfContents': { type: 'bf:TableOfContents' },
  'bf:shelfMark': { type: 'bf:ShelfMark' },
  'bf:source': { type: 'bf:Source' },
  'bf:intendedAudience': { type: 'bf:IntendedAudience' },
  'bf:illustrativeContent': { type: 'bf:Illustration' },
  'bf:contentAccessibility': { type: 'bf:ContentAccessibility' },
  'bf:provisionActivity': { type: 'bf:ProvisionActivity' },
  'bf:status': { type: 'bf:Status' },
  'bf:generationProcess': { type: 'bf:GenerationProcess' }
};

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

const asArray = (v: any): any[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v.flat(Infinity) : [v]);
const isUri = (v: any) => typeof v === 'string' && /^(https?:\/\/|_:)/.test(v);
const isLiteral = (v: any) =>
  (typeof v === 'string' && !isUri(v)) || typeof v === 'number' || typeof v === 'boolean' ||
  (typeof v === 'object' && v !== null && v['@value'] !== undefined);
const isNode = (v: any) => typeof v === 'object' && v !== null && !Array.isArray(v) && v['@value'] === undefined;
const literalText = (v: any): string => String(typeof v === 'object' && v !== null ? v['@value'] : v).trim();

function typesOf(node: any): string[] {
  return asArray(node?.['@type']).filter((t: any) => typeof t === 'string');
}

const isTitleNode = (types: string[]) => types.some(t => /Title$/.test(t));

/** Normalized text for comparing duplicates across scripts (Arabic and Latin). */
function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[ً-ْ]/g, '') // Arabic diacritics
    .replace(/[()\[\]{}.,;:،؛"'\-–—/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export interface NormalizeResult {
  doc: { '@context': Record<string, string>; '@graph': any[] };
  /** Human-readable list of what was changed, e.g. "bf:creator -> bf:contribution (1)". */
  changes: string[];
}

class Normalizer {
  // Values built from plain text: dropped when a structured value already says the same thing.
  private weak = new WeakSet<object>();
  private changes = new Map<string, number>();
  // Per output node: properties whose only source was a single (non-array) value stay single.
  private single = new WeakMap<object, Map<string, boolean>>();

  constructor(private ctx: Record<string, string>) {}

  report(): string[] {
    return [...this.changes].map(([c, n]) => `${c} (${n})`);
  }

  private note(change: string) {
    this.changes.set(change, (this.changes.get(change) || 0) + 1);
  }

  private makeWeak<T extends object>(v: T): T {
    this.weak.add(v);
    return v;
  }

  /** A node built from a plain-text value. */
  private textNode(type: string | undefined, via: string, text: string) {
    const node: any = {};
    if (type) node['@type'] = type;
    node[via] = via === 'rdfs:label' ? text : { '@value': text };
    return this.makeWeak(node);
  }

  private coerce(prop: string, v: any): any {
    if (isUri(v)) return v.startsWith('_:') ? v : { '@id': v };
    if (!isLiteral(v)) return v;
    const text = literalText(v);
    const c = COERCIONS[prop] || {};
    const vocabUri = c.vocab?.(text);
    if (vocabUri) return this.makeWeak({ '@id': vocabUri });
    if (prop === 'bf:contribution') {
      return this.makeWeak({ '@type': 'bf:Contribution', 'bf:agent': [{ '@type': 'bf:Agent', 'rdfs:label': text }] });
    }
    return this.textNode(c.type, c.via || 'rdfs:label', text);
  }

  normalizeType(t: string): string | null {
    const canon = canonicalTerm(t, this.ctx);
    if (canon in TYPE_RENAMES) {
      const to = TYPE_RENAMES[canon];
      this.note(`${canon} -> ${to ?? '(removed)'}`);
      return to;
    }
    if (!isOfficialTerm(canon)) {
      const local = `moonext:${splitTerm(canon)[1]}`;
      this.note(`${canon} -> ${local}`);
      return local;
    }
    return canon;
  }

  /** Class an untyped nested node gets from the property that holds it (e.g. bf:title -> bf:Title). */
  private impliedType(key: string): string | undefined {
    const repair = REPAIRS[key];
    if (repair) return repair.wrap || COERCIONS[repair.to]?.type;
    if (key === 'bf:contribution') return 'bf:Contribution';
    return isObjectProperty(key) ? COERCIONS[key]?.type : undefined;
  }

  node(input: any, implied?: string): any {
    if (!isNode(input)) return input;
    const out: any = {};
    let types = [...new Set(typesOf(input).map(t => this.normalizeType(t)).filter(Boolean) as string[])];
    if (!types.length && implied && Object.keys(input).some(k => !k.startsWith('@'))) types = [implied];
    const publication: Record<string, any[]> = {};
    const contributors: Record<string, any[]> = {};
    const subtitles: any[] = [];

    for (const [rawKey, rawValue] of Object.entries(input)) {
      if (rawKey === '@type') continue;
      if (rawKey.startsWith('@')) { out[rawKey] = rawValue; continue; }
      if (rawKey.startsWith('_') || INTERNAL_KEYS.has(rawKey)) continue;
      const single = !Array.isArray(rawValue);

      const key = canonicalTerm(rawKey, this.ctx);
      const implied = this.impliedType(key);
      const values = asArray(rawValue).filter(v => v !== '' && v !== null && v !== undefined).map(v => this.node(v, implied));
      if (values.length === 0) continue;

      if (key in PUBLICATION_PARTS) { (publication[key] ||= []).push(...values); this.note(`${key} -> bf:provisionActivity`); continue; }
      if (CONTRIBUTOR_KEYS.has(key)) { (contributors[key] ||= []).push(...values); this.note(`${key} -> bf:contribution`); continue; }
      if (!isTitleNode(types) && key === 'bf:mainTitle') {
        this.note('bf:mainTitle outside a Title -> bf:title');
        this.route('bf:title', values, out, single);
        continue;
      }
      if (!isTitleNode(types) && key === 'bf:subtitle') { subtitles.push(...values); continue; }
      this.route(key, values, out, single);
    }

    this.addContributions(contributors, out);
    this.addPublication(publication, out);
    if (subtitles.length) {
      const title = asArray(out['bf:title']).find(isNode);
      if (title) title['bf:subtitle'] = [...asArray(title['bf:subtitle']), ...subtitles];
      else this.add(out, 'moonext:subtitle', subtitles);
      this.note('bf:subtitle outside a Title -> bf:title');
    }

    const result: any = {};
    if (out['@id'] !== undefined) result['@id'] = out['@id'];
    if (types.length) result['@type'] = types.length === 1 ? types[0] : types;
    for (const [k, v] of Object.entries(out)) {
      if (k === '@id') continue;
      if (k.startsWith('@')) { result[k] = v; continue; }
      const deduped = this.dedupe(asArray(v));
      result[k] = deduped.length === 1 && this.single.get(out)?.get(k) ? deduped[0] : deduped;
    }
    return result;
  }

  private route(key: string, values: any[], out: any, single = false) {
    const repair = REPAIRS[key];
    if (repair) {
      this.note(`${key} -> ${repair.to}${repair.wrap ? ` (${repair.wrap})` : ''}`);
      const wrapped = repair.wrap
        ? values.map(v => {
            if (isLiteral(v)) return this.textNode(repair.wrap, repair.via || 'rdfs:label', literalText(v));
            if (isNode(v) && !v['@type'] && Object.keys(v).some(k => !k.startsWith('@'))) return { ...v, '@type': repair.wrap };
            return v;
          })
        : values;
      this.route(repair.to, wrapped, out, single);
      return;
    }
    const [prefix, local] = splitTerm(key);
    if ((prefix === 'bf' || prefix === 'bflc') && !isOfficialTerm(key)) {
      this.note(`${key} -> moonext:${local}`);
      this.add(out, `moonext:${local}`, values, single);
      return;
    }
    this.add(out, key, isObjectProperty(key) ? values.map(v => this.coerce(key, v)) : values, single);
  }

  private add(out: any, key: string, values: any[], single = false) {
    const shapes = this.single.get(out) || new Map<string, boolean>();
    this.single.set(out, shapes);
    shapes.set(key, !shapes.has(key) && single);
    out[key] = [...asArray(out[key]), ...values];
  }

  private addContributions(parts: Record<string, any[]>, out: any) {
    const uris = asArray(parts['bf:creatorUri']).map(v => (isNode(v) ? v['@id'] : literalText(v))).filter(Boolean);
    const creators = asArray(parts['bf:creator']);
    const made: any[] = [];
    const maxCreators = Math.max(creators.length, uris.length);
    for (let i = 0; i < maxCreators; i++) {
      const c = creators[i];
      const agent: any = isNode(c) ? { ...c } : { '@type': 'bf:Agent' };
      if (!isNode(c) && c !== undefined) agent['rdfs:label'] = literalText(c);
      if (uris[i] && !agent['@id']) agent['@id'] = uris[i];
      if (!agent['@type']) agent['@type'] = 'bf:Agent';
      // No role: a flat "creator" field doesn't say whether this is the author, editor, etc.
      made.push(this.makeWeak({ '@type': 'bf:PrimaryContribution', 'bf:agent': [agent] }));
    }
    for (const c of asArray(parts['bf:additionalContributors'])) {
      made.push(isNode(c) && (c['bf:agent'] || c['@type'])
        ? c
        : this.makeWeak({ '@type': 'bf:Contribution', 'bf:agent': [isNode(c) ? c : { '@type': 'bf:Agent', 'rdfs:label': literalText(c) }] }));
    }
    if (made.length) this.add(out, 'bf:contribution', made);
  }

  private addPublication(parts: Record<string, any[]>, out: any) {
    if (!Object.keys(parts).length) return;
    const existing = asArray(out['bf:provisionActivity']).find(p => isNode(p) && typesOf(p).includes('bf:Publication'));
    const target = existing || { '@type': 'bf:Publication' };
    for (const [key, values] of Object.entries(parts)) {
      const { prop, type } = PUBLICATION_PARTS[key];
      if (target[prop]) continue; // the structured publication already says this
      target[prop] = values.map(v => (type && isLiteral(v) ? { '@type': type, 'rdfs:label': literalText(v) } : v));
    }
    if (!existing) this.add(out, 'bf:provisionActivity', [target]);
  }

  /** Texts that identify a value, for spotting the same fact said twice. */
  private signature(v: any, depth = 0): string[] {
    if (isLiteral(v)) return [norm(literalText(v))];
    if (typeof v === 'string') return [v];
    if (!isNode(v) || depth > 3) return [];
    const sig: string[] = [];
    if (v['@id'] && !String(v['@id']).startsWith('_:')) sig.push(v['@id']);
    for (const k of ['rdfs:label', 'bf:mainTitle', 'rdf:value', 'bf:code']) {
      for (const x of asArray(v[k])) if (isLiteral(x)) sig.push(norm(literalText(x)));
    }
    const portions = [...asArray(v['bf:classificationPortion']), ...asArray(v['bf:itemPortion'])].filter(isLiteral).map(literalText);
    if (portions.length) sig.push(norm(portions.join(' ')), ...portions.map(norm));
    for (const a of asArray(v['bf:agent'])) sig.push(...this.signature(a, depth + 1));
    return sig.filter(Boolean);
  }

  private dedupe(values: any[]): any[] {
    const strong = values.filter(v => !(isNode(v) && this.weak.has(v)));
    const weak = values.filter(v => isNode(v) && this.weak.has(v));

    // Same literal twice, or the same @id twice (merge their properties).
    const kept: any[] = [];
    const seenLiteral = new Set<string>();
    const byId = new Map<string, any>();
    for (const v of strong) {
      if (isLiteral(v)) {
        const k = JSON.stringify([literalText(v), v?.['@language'] ?? null]);
        if (seenLiteral.has(k)) continue;
        seenLiteral.add(k);
        kept.push(v);
      } else if (isNode(v) && v['@id'] && !String(v['@id']).startsWith('_:')) {
        const prior = byId.get(v['@id']);
        if (prior) { for (const [k, x] of Object.entries(v)) if (!(k in prior)) prior[k] = x; continue; }
        byId.set(v['@id'], v);
        kept.push(v);
      } else {
        kept.push(v);
      }
    }

    const strongSigs = kept.flatMap(v => this.signature(v));
    const matches = (s: string) => strongSigs.some(t =>
      t === s || (Math.min(t.length, s.length) >= 6 && (s.startsWith(t) || t.startsWith(s))));
    const weakSeen = new Set<string>();
    for (const w of weak) {
      const sig = this.signature(w);
      if (sig.some(matches)) { this.note('dropped duplicate plain-text value'); continue; }
      const key = sig.join('|');
      if (key && weakSeen.has(key)) continue;
      weakSeen.add(key);
      kept.push(w);
    }
    return kept;
  }
}

/** Moves bf:shelfMark from Works/Instances to the Item that holds the copy. */
function relocateShelfMarks(graph: any[], changes: string[]) {
  const hasType = (n: any, t: string) => typesOf(n).includes(t);
  for (const holder of graph.filter(n => (hasType(n, 'bf:Work') || hasType(n, 'bf:Instance')) && n['bf:shelfMark'])) {
    const instance = hasType(holder, 'bf:Instance')
      ? holder
      : graph.find(n => hasType(n, 'bf:Instance') &&
          (asArray(n['bf:instanceOf']).some((r: any) => (r?.['@id'] ?? r) === holder['@id']) ||
           asArray(holder['bf:hasInstance']).some((r: any) => (r?.['@id'] ?? r) === n['@id'])))
        || graph.find(n => hasType(n, 'bf:Instance'));
    if (!instance?.['@id']) continue; // nowhere correct to put it; leave it rather than lose it

    let item = graph.find(n => hasType(n, 'bf:Item') &&
      asArray(n['bf:itemOf']).some((r: any) => (r?.['@id'] ?? r) === instance['@id']));
    if (!item) {
      item = { '@id': `${instance['@id']}-item`, '@type': 'bf:Item', 'bf:itemOf': [{ '@id': instance['@id'] }] };
      instance['bf:hasItem'] = [...asArray(instance['bf:hasItem']), { '@id': item['@id'] }];
      graph.push(item);
    }
    const existing = new Set(asArray(item['bf:shelfMark']).flatMap((s: any) => asArray(s?.['rdfs:label'] ?? s).map(String)));
    const moved = asArray(holder['bf:shelfMark']).filter((s: any) =>
      !asArray(s?.['rdfs:label'] ?? s).map(String).every(l => existing.has(l)));
    item['bf:shelfMark'] = [...asArray(item['bf:shelfMark']), ...moved];
    delete holder['bf:shelfMark'];
    changes.push(`bf:shelfMark moved from ${typesOf(holder)[0]} to bf:Item (1)`);
  }
}

/** Accepts a JSON-LD document ({@graph}), a node, an array of nodes, or a Moon record ({work, instance, item}). */
function toGraph(input: any): any[] {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input['@graph'])) return input['@graph'];
  if ((input.work || input.instance) && !input['@type']) {
    const work = input.work ? { '@type': 'bf:Work', ...input.work } : null;
    const instance = input.instance ? { '@type': 'bf:Instance', ...input.instance } : null;
    const item = input.item ? { '@type': 'bf:Item', ...input.item } : null;
    if (work && instance) {
      work['@id'] ||= '_:work';
      instance['@id'] ||= '_:instance';
      if (!work['bf:hasInstance'] && !work.hasInstance) work['bf:hasInstance'] = { '@id': instance['@id'] };
      if (!instance['bf:instanceOf'] && !instance.instanceOf) instance['bf:instanceOf'] = { '@id': work['@id'] };
    }
    if (item && instance) {
      item['@id'] ||= '_:item';
      if (!item['bf:itemOf'] && !item.itemOf) item['bf:itemOf'] = { '@id': instance['@id'] };
    }
    return [work, instance, item].filter(Boolean);
  }
  return [input];
}

export function normalizeBibframeWithReport(input: any): NormalizeResult {
  const inputCtx = Object.fromEntries(
    Object.entries((input && !Array.isArray(input) && input['@context']) || {}).filter(([, v]) => typeof v === 'string')
  ) as Record<string, string>;
  const ctx = { ...inputCtx, ...CORE_CONTEXT };
  if (!input || typeof input !== 'object') return { doc: { '@context': ctx, '@graph': [] }, changes: [] };

  const normalizer = new Normalizer(ctx);
  const graph = toGraph(input).filter(isNode).map(n => normalizer.node(n));
  const changes = normalizer.report();
  relocateShelfMarks(graph, changes);
  return { doc: { '@context': ctx, '@graph': graph }, changes };
}

export function normalizeBibframe(input: any): NormalizeResult['doc'] {
  return normalizeBibframeWithReport(input).doc;
}

/** JSON-LD text for downloads: always normalized, never raw editor state. */
export function toBibframeJsonLdString(input: any): string {
  return JSON.stringify(normalizeBibframe(input), null, 2);
}

/** Every bf:/bflc: term (property or class) in the document that the official ontologies do not define. */
export function findUnofficialTerms(doc: any): string[] {
  const ctx = { ...CORE_CONTEXT, ...((doc && !Array.isArray(doc) && doc['@context']) || {}) };
  const found = new Set<string>();
  const walk = (v: any) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!isNode(v)) return;
    for (const t of typesOf(v)) { const c = canonicalTerm(t, ctx); if (!isOfficialTerm(c)) found.add(c); }
    for (const [k, x] of Object.entries(v)) {
      if (k.startsWith('@')) { if (k === '@graph') walk(x); continue; }
      const c = canonicalTerm(k, ctx);
      if (!isOfficialTerm(c)) found.add(c);
      walk(x);
    }
  };
  walk(doc);
  return [...found].sort();
}
