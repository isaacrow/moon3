/**
 * RDF Graph Builder
 * Generates semantically correct BIBFRAME RDF
 * Supports Turtle, RDF/XML, and JSON-LD serialization
 * Triple store ready output
 *
 * Every serializer runs its input through normalizeBibframe() first, so only
 * official BIBFRAME 3.0.1 / BFLC terms are emitted in the bf: and bflc: namespaces.
 */

import { normalizeBibframe } from './bibframeNormalizer';
import { BASE_URI } from './uriMintingService';

export interface GraphNode {
  uri: string;
  type: string;
  properties: Map<string, any>;
}

export interface RDFTriple {
  subject: string;
  predicate: string;
  object: string | { value: string; type: 'uri' | 'literal'; datatype?: string; language?: string };
}

/**
 * Standard known namespaces for BIBFRAME 2.0/3.0 and Linked Data
 */
export const KNOWN_NAMESPACES: Record<string, string> = {
  bf: 'http://id.loc.gov/ontologies/bibframe/',
  bflc: 'http://id.loc.gov/ontologies/bflc/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  madsrdf: 'http://www.loc.gov/mads/rdf/v1#',
  relators: 'http://id.loc.gov/vocabulary/relators/',
  languages: 'http://id.loc.gov/vocabulary/languages/',
  carriers: 'http://id.loc.gov/vocabulary/carriers/',
  mediaTypes: 'http://id.loc.gov/vocabulary/mediaTypes/',
  contentTypes: 'http://id.loc.gov/vocabulary/contentTypes/',
  issuance: 'http://id.loc.gov/vocabulary/issuance/',
  descriptionConventions: 'http://id.loc.gov/vocabulary/descriptionConventions/',
  genreForms: 'http://id.loc.gov/authorities/genreForms/',
  subjects: 'http://id.loc.gov/authorities/subjects/',
  names: 'http://id.loc.gov/authorities/names/',
  dcterms: 'http://purl.org/dc/terms/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  owl: 'http://www.w3.org/2002/07/owl#',
  moon: `${BASE_URI}/`
};

/**
 * Generate stable URI
 */
export function generateUri(type: string, id?: string): string {
  const namespace = BASE_URI.replace(/resource$/, '');
  const identifier = id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  return `${namespace}${type}/${identifier}`;
}

/**
 * Escape string for Turtle serialization
 */
export function escapeTurtle(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Escape XML special characters and strip invalid XML control characters
 */
export function escapeXml(str: any): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Resolves a property key or URI to its namespace, prefix, local name, and tag.
 * Does NOT assume every property belongs to BIBFRAME.
 */
export function resolvePropertyUri(
  key: string,
  context?: Record<string, string>
): { prefix: string; local: string; uri: string; tag: string } {
  const allNs: Record<string, string> = { ...KNOWN_NAMESPACES, ...(context || {}) };

  // 1. Full URI (http://... or https://...)
  if (key.startsWith('http://') || key.startsWith('https://')) {
    // Check against registered namespaces (longest match first)
    const sortedEntries = Object.entries(allNs).sort((a, b) => b[1].length - a[1].length);
    for (const [prefix, nsUri] of sortedEntries) {
      if (key.startsWith(nsUri)) {
        const local = key.substring(nsUri.length);
        if (local && !local.includes('/')) {
          return { prefix, local, uri: key, tag: `${prefix}:${local}` };
        }
      }
    }

    // Split at '#' or last '/'
    const hashIdx = key.lastIndexOf('#');
    const slashIdx = key.lastIndexOf('/');
    const splitIdx = Math.max(hashIdx, slashIdx);
    if (splitIdx > 0 && splitIdx < key.length - 1) {
      const nsUri = key.substring(0, splitIdx + 1);
      const local = key.substring(splitIdx + 1);
      return { prefix: '', local, uri: key, tag: key };
    }
    return { prefix: '', local: key, uri: key, tag: key };
  }

  // 2. Prefixed name (prefix:local)
  if (key.includes(':') && !key.startsWith('_:')) {
    const colonIdx = key.indexOf(':');
    const prefix = key.substring(0, colonIdx);
    const local = key.substring(colonIdx + 1);
    const nsUri = allNs[prefix] || `http://example.org/${prefix}/`;
    return { prefix, local, uri: `${nsUri}${local}`, tag: `${prefix}:${local}` };
  }

  // 3. Common unprefixed RDF/RDFS/DC properties - map to correct vocabularies
  if (key === 'label') return { prefix: 'rdfs', local: 'label', uri: allNs.rdfs + 'label', tag: 'rdfs:label' };
  if (key === 'comment') return { prefix: 'rdfs', local: 'comment', uri: allNs.rdfs + 'comment', tag: 'rdfs:comment' };
  if (key === 'type') return { prefix: 'rdf', local: 'type', uri: allNs.rdf + 'type', tag: 'rdf:type' };
  if (key === 'value') return { prefix: 'rdf', local: 'value', uri: allNs.rdf + 'value', tag: 'rdf:value' };

  // 4. Default: cataloging property fallback to bf:
  return {
    prefix: 'bf',
    local: key,
    uri: `${allNs.bf || 'http://id.loc.gov/ontologies/bibframe/'}${key}`,
    tag: `bf:${key}`
  };
}

/**
 * Resolves a type to prefix notation or full URI
 */
export function resolveType(type: string | undefined, context?: Record<string, string>): string {
  if (!type) return 'bf:Resource';
  const resolved = resolvePropertyUri(type, context);
  return resolved.tag || type;
}

/**
 * Safely formats an IRI for Turtle
 */
function formatIri(uri: string): string {
  if (!uri) return '<>';
  if (uri.startsWith('_:')) return uri;
  try {
    // Only encode if contains non-ASCII or spaces
    if (/[^\x20-\x7E]|\s/.test(uri)) {
      return `<${encodeURI(uri)}>`;
    }
    return `<${uri}>`;
  } catch {
    return `<${uri}>`;
  }
}

/**
 * Formats a Turtle subject from an @id string
 */
function formatTurtleSubject(id: string | undefined): string {
  if (!id) return '[]';
  if (id.startsWith('_:')) return id;
  if (id.startsWith('http://') || id.startsWith('https://')) return formatIri(id);
  if (id.includes(':')) return id;
  return formatIri(id);
}

/**
 * Formats a Turtle predicate
 */
function formatTurtlePredicate(key: string, context: Record<string, string>): string {
  const resolved = resolvePropertyUri(key, context);
  if (resolved.prefix && context[resolved.prefix]) {
    return `${resolved.prefix}:${resolved.local}`;
  }
  if (resolved.tag && resolved.tag.includes(':')) {
    const p = resolved.tag.split(':')[0];
    if (context[p]) return resolved.tag;
  }
  if (resolved.uri.startsWith('http://') || resolved.uri.startsWith('https://')) {
    return formatIri(resolved.uri);
  }
  return resolved.tag || key;
}

/**
 * Convert a value to its Turtle object representation
 */
function formatTurtleValue(value: any, context: Record<string, string>, indentLevel: number = 1): string {
  if (value === null || value === undefined) return '';

  // 1. Array
  if (Array.isArray(value)) {
    const validItems = value.filter(v => v !== null && v !== undefined);
    if (validItems.length === 0) return '';
    return validItems
      .map(item => formatTurtleValue(item, context, indentLevel))
      .filter(Boolean)
      .join(', ');
  }

  // 2. Typed literal / language-tagged literal / plain literal object
  if (typeof value === 'object' && value['@value'] !== undefined) {
    const escaped = escapeTurtle(String(value['@value']));
    if (value['@language']) {
      return `"${escaped}"@${value['@language']}`;
    }
    if (value['@type']) {
      const typeUri = value['@type'];
      if (typeUri.startsWith('xsd:') || typeUri.startsWith('http://www.w3.org/2001/XMLSchema#')) {
        const local = typeUri.replace('http://www.w3.org/2001/XMLSchema#', '').replace('xsd:', '');
        return `"${escaped}"^^xsd:${local}`;
      }
      if (typeUri.startsWith('http://') || typeUri.startsWith('https://')) {
        return `"${escaped}"^^<${typeUri}>`;
      }
      return `"${escaped}"^^${typeUri}`;
    }
    return `"${escaped}"`;
  }

  // 3. URI reference (object with @id and no other meaningful RDF properties)
  if (typeof value === 'object' && value['@id'] && !value['@type']) {
    const keys = Object.keys(value).filter(k => !k.startsWith('@'));
    if (keys.length === 0) {
      const id = value['@id'];
      if (id.startsWith('_:')) return id;
      if (id.startsWith('http://') || id.startsWith('https://')) return formatIri(id);
      if (id.includes(':')) {
        const p = id.split(':')[0];
        if (context[p]) return id;
      }
      return formatIri(id);
    }
  }

  // 4. Nested blank node or inline entity
  if (typeof value === 'object' && value !== null) {
    const indent = '    '.repeat(indentLevel);
    const innerIndent = '    '.repeat(indentLevel + 1);

    // If it has @id and it's a known top-level named URI, and no inline properties
    const propKeys = Object.keys(value).filter(k => !k.startsWith('@'));
    if (value['@id'] && propKeys.length === 0 && !value['@type']) {
      const id = value['@id'];
      if (id.startsWith('_:')) return id;
      return formatIri(id);
    }

    const innerProps: string[] = [];

    // @type
    if (value['@type']) {
      const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
      const typeStrs = types.map(t => formatTurtlePredicate(t, context));
      if (typeStrs.length > 0) {
        innerProps.push(`a ${typeStrs.join(', ')}`);
      }
    }

    // Properties
    for (const key of Object.keys(value)) {
      if (key.startsWith('@')) continue;
      const pred = formatTurtlePredicate(key, context);
      const valStr = formatTurtleValue(value[key], context, indentLevel + 1);
      if (valStr) {
        innerProps.push(`${pred} ${valStr}`);
      }
    }

    // Empty blank node
    if (innerProps.length === 0) {
      if (value['@id']) {
        return value['@id'].startsWith('_:') ? value['@id'] : formatIri(value['@id']);
      }
      return '[]';
    }

    // Blank node with properties - MUST NOT have trailing period inside [ ... ]
    return `[\n${innerIndent}${innerProps.join(` ;\n${innerIndent}`)}\n${indent}]`;
  }

  // 5. Primitive string
  if (typeof value === 'string') {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return formatIri(value);
    }
    if (value.startsWith('_:')) {
      return value;
    }
    return `"${escapeTurtle(value)}"`;
  }

  // 6. Number
  if (typeof value === 'number') {
    return String(value);
  }

  // 7. Boolean
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return '""';
}

/**
 * Convert BIBFRAME record (or any JSON-LD @graph document) to valid W3C Turtle
 */
export function toTurtle(jsonld: any): string {
  if (!jsonld) return '';
  jsonld = normalizeBibframe(jsonld);

  const nodes = jsonld['@graph'] || (Array.isArray(jsonld) ? jsonld : [jsonld]);
  const docContext: Record<string, string> = {
    ...KNOWN_NAMESPACES,
    ...(jsonld['@context'] || {})
  };

  // 1. Build Prefix declarations
  const prefixLines: string[] = [];
  for (const [prefix, uri] of Object.entries(docContext)) {
    if (prefix && uri && typeof uri === 'string') {
      prefixLines.push(`@prefix ${prefix}: <${uri}> .`);
    }
  }

  const nodeBlocks: string[] = [];

  // 2. Serialize each top-level node
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;

    const subject = formatTurtleSubject(node['@id']);
    const props: string[] = [];

    // Type
    if (node['@type']) {
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      const typeStrs = types.map(t => formatTurtlePredicate(t, docContext));
      if (typeStrs.length > 0) {
        props.push(`    a ${typeStrs.join(', ')}`);
      }
    }

    // Properties
    for (const key of Object.keys(node)) {
      if (key.startsWith('@')) continue;
      const pred = formatTurtlePredicate(key, docContext);
      const valStr = formatTurtleValue(node[key], docContext, 1);
      if (valStr) {
        props.push(`    ${pred} ${valStr}`);
      }
    }

    if (props.length > 0) {
      nodeBlocks.push(`${subject}\n${props.join(' ;\n')} .`);
    } else if (node['@id']) {
      // Empty-property node with only an ID: output a valid triple asserting its resource existence
      nodeBlocks.push(`${subject} a rdfs:Resource .`);
    }
  }

  return `${prefixLines.join('\n')}\n\n${nodeBlocks.join('\n\n')}\n`;
}

/**
 * Convert to clean JSON-LD
 */
export function toJsonLd(graph: any[]): any {
  return {
    '@context': { ...KNOWN_NAMESPACES },
    '@graph': Array.isArray(graph) ? graph : [graph]
  };
}

/**
 * Extract triples from JSON-LD
 */
export function extractTriples(jsonld: any): RDFTriple[] {
  const triples: RDFTriple[] = [];
  if (!jsonld) return triples;
  jsonld = normalizeBibframe(jsonld);

  const nodes = jsonld['@graph'] || (Array.isArray(jsonld) ? jsonld : [jsonld]);
  const context = jsonld['@context'] || KNOWN_NAMESPACES;

  nodes.forEach((node: any) => {
    if (!node || typeof node !== 'object') return;
    extractNodeTriples(node, triples, undefined, context);
  });

  return triples;
}

/**
 * Extract triples from a node
 */
function extractNodeTriples(
  node: any,
  triples: RDFTriple[],
  parentSubject?: string,
  context: Record<string, string> = KNOWN_NAMESPACES
) {
  const subject = node['@id'] || parentSubject || `_:b${Math.random().toString(36).substring(2, 9)}`;

  // Type triple
  if (node['@type']) {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    types.forEach(t => {
      const resolved = resolvePropertyUri(t, context);
      triples.push({
        subject,
        predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
        object: { value: resolved.uri, type: 'uri' }
      });
    });
  }

  // Property triples
  Object.keys(node).forEach(prop => {
    if (prop.startsWith('@')) return;

    const resolved = resolvePropertyUri(prop, context);
    const value = node[prop];

    if (Array.isArray(value)) {
      value.forEach(v => addTriple(subject, resolved.uri, v, triples, context));
    } else {
      addTriple(subject, resolved.uri, value, triples, context);
    }
  });
}

function addTriple(
  subject: string,
  predicate: string,
  value: any,
  triples: RDFTriple[],
  context: Record<string, string>
) {
  if (value === null || value === undefined) return;

  if (typeof value === 'object') {
    // Literal with @value
    if (value['@value'] !== undefined) {
      triples.push({
        subject,
        predicate,
        object: {
          value: String(value['@value']),
          type: 'literal',
          datatype: value['@type'] ? resolvePropertyUri(value['@type'], context).uri : undefined,
          language: value['@language']
        }
      });
      return;
    }

    // URI Reference with @id and no other properties
    const propKeys = Object.keys(value).filter(k => !k.startsWith('@'));
    if (value['@id'] && propKeys.length === 0 && !value['@type']) {
      triples.push({
        subject,
        predicate,
        object: { value: value['@id'], type: 'uri' }
      });
      return;
    }

    // Nested blank node
    const bnodeId = value['@id'] || `_:b${Math.random().toString(36).substring(2, 9)}`;
    triples.push({
      subject,
      predicate,
      object: { value: bnodeId, type: 'uri' }
    });
    extractNodeTriples(value, triples, bnodeId, context);
    return;
  }

  if (typeof value === 'string') {
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('_:')) {
      triples.push({
        subject,
        predicate,
        object: { value, type: 'uri' }
      });
    } else {
      triples.push({
        subject,
        predicate,
        object: { value, type: 'literal' }
      });
    }
    return;
  }

  // Number / boolean
  triples.push({
    subject,
    predicate,
    object: { value: String(value), type: 'literal' }
  });
}

/**
 * Validate graph connectivity
 */
export function validateGraphConnectivity(jsonld: any): { connected: boolean; orphans: string[] } {
  if (!jsonld || !jsonld['@graph']) {
    return { connected: false, orphans: [] };
  }

  const graph = jsonld['@graph'];
  const nodeIds = new Set(graph.filter((n: any) => n && typeof n === 'object').map((n: any) => n['@id']).filter(Boolean));
  const referencedIds = new Set<string>();
  const orphans: string[] = [];

  graph.forEach((node: any) => {
    if (!node || typeof node !== 'object') return;
    Object.values(node).forEach(value => {
      collectReferences(value, referencedIds);
    });
  });

  const work = graph.find((n: any) => {
    const t = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
    return t.includes('bf:Work');
  });

  nodeIds.forEach(id => {
    if (id !== work?.['@id'] && !referencedIds.has(id)) {
      orphans.push(id);
    }
  });

  return {
    connected: orphans.length === 0,
    orphans
  };
}

function collectReferences(value: any, refs: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach(v => collectReferences(v, refs));
  } else if (typeof value === 'object' && value !== null) {
    if (value['@id']) {
      refs.add(value['@id']);
    }
    Object.values(value).forEach(v => collectReferences(v, refs));
  }
}

/**
 * Convert BIBFRAME JSON-LD record to W3C RDF/XML representation.
 * - Preserves each property's actual namespace and local name (does not assume bf:).
 * - Correctly handles resource references, blank nodes, language literals, and typed datatypes.
 * - Dynamically registers and declares all XML namespaces used on <rdf:RDF>.
 */
export function toRdfXml(jsonld: any): string {
  if (!jsonld) return '';
  jsonld = normalizeBibframe(jsonld);
  const nodes = jsonld['@graph'] || (Array.isArray(jsonld) ? jsonld : [jsonld]);
  const docContext: Record<string, string> = {
    ...KNOWN_NAMESPACES,
    ...(jsonld['@context'] || {})
  };

  // Collect all prefixes and namespaces actually used
  const usedNamespaces: Record<string, string> = {
    rdf: KNOWN_NAMESPACES.rdf,
    rdfs: KNOWN_NAMESPACES.rdfs,
    bf: KNOWN_NAMESPACES.bf,
    bflc: KNOWN_NAMESPACES.bflc,
    xsd: KNOWN_NAMESPACES.xsd,
    madsrdf: KNOWN_NAMESPACES.madsrdf
  };

  function registerNamespace(prefix: string, uri: string) {
    if (prefix && uri) {
      usedNamespaces[prefix] = uri;
    }
  }

  // Pre-scan nodes to discover all used namespaces
  function scanForNamespaces(obj: any) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(scanForNamespaces);
      return;
    }

    if (obj['@type']) {
      const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
      types.forEach(t => {
        const resolved = resolvePropertyUri(t, docContext);
        if (resolved.prefix && docContext[resolved.prefix]) {
          registerNamespace(resolved.prefix, docContext[resolved.prefix]);
        }
      });
    }

    for (const [key, val] of Object.entries(obj)) {
      if (!key.startsWith('@')) {
        const resolved = resolvePropertyUri(key, docContext);
        if (resolved.prefix && docContext[resolved.prefix]) {
          registerNamespace(resolved.prefix, docContext[resolved.prefix]);
        }
      }
      if (typeof val === 'object' && val !== null) {
        scanForNamespaces(val);
      }
    }
  }

  nodes.forEach(scanForNamespaces);

  // Build root tag
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rdf:RDF\n';
  const nsEntries = Object.entries(usedNamespaces);
  nsEntries.forEach(([prefix, uri], i) => {
    const isLast = i === nsEntries.length - 1;
    xml += `  xmlns:${prefix}="${escapeXml(uri)}"${isLast ? '>\n\n' : '\n'}`;
  });

  function serializeProperty(key: string, val: any, indent: string = '    '): string {
    if (val === null || val === undefined) return '';

    // Array of values
    if (Array.isArray(val)) {
      let out = '';
      for (const item of val) {
        out += serializeProperty(key, item, indent);
      }
      return out;
    }

    const prop = resolvePropertyUri(key, docContext);
    const tag = prop.tag;

    // 1. Literal with @value
    if (typeof val === 'object' && val['@value'] !== undefined) {
      const langAttr = val['@language'] ? ` xml:lang="${escapeXml(val['@language'])}"` : '';
      let typeAttr = '';
      if (val['@type']) {
        const typeResolved = resolvePropertyUri(val['@type'], docContext);
        typeAttr = ` rdf:datatype="${escapeXml(typeResolved.uri)}"`;
      }
      return `${indent}<${tag}${langAttr}${typeAttr}>${escapeXml(val['@value'])}</${tag}>\n`;
    }

    // 2. Pure URI reference or Blank Node Reference
    if (typeof val === 'object' && val['@id']) {
      const otherKeys = Object.keys(val).filter(k => !k.startsWith('@'));
      if (otherKeys.length === 0 && !val['@type']) {
        const id = val['@id'];
        if (id.startsWith('_:')) {
          const cleanBnodeId = id.replace(/^_+:?/, '');
          return `${indent}<${tag} rdf:nodeID="${escapeXml(cleanBnodeId)}"/>\n`;
        }
        return `${indent}<${tag} rdf:resource="${escapeXml(id)}"/>\n`;
      }
    }

    // 3. Nested entity / blank node
    if (typeof val === 'object' && val !== null) {
      let innerTag = 'rdf:Description';
      let extraTypeElements = '';

      if (val['@type']) {
        const types = Array.isArray(val['@type']) ? val['@type'] : [val['@type']];
        const firstType = resolvePropertyUri(types[0], docContext);
        innerTag = firstType.tag;

        if (types.length > 1) {
          for (let i = 1; i < types.length; i++) {
            const extraType = resolvePropertyUri(types[i], docContext);
            extraTypeElements += `${indent}    <rdf:type rdf:resource="${escapeXml(extraType.uri)}"/>\n`;
          }
        }
      }

      let idAttr = '';
      if (val['@id']) {
        const id = val['@id'];
        if (id.startsWith('_:')) {
          idAttr = ` rdf:nodeID="${escapeXml(id.replace(/^_+:?/, ''))}"`;
        } else {
          idAttr = ` rdf:about="${escapeXml(id)}"`;
        }
      }

      let innerContent = '';
      for (const subKey of Object.keys(val)) {
        if (subKey.startsWith('@')) continue;
        innerContent += serializeProperty(subKey, val[subKey], indent + '    ');
      }

      if (!innerContent && !extraTypeElements) {
        return `${indent}<${tag}>\n${indent}  <${innerTag}${idAttr}/>\n${indent}</${tag}>\n`;
      }

      return `${indent}<${tag}>\n` +
             `${indent}  <${innerTag}${idAttr}>\n` +
             extraTypeElements +
             innerContent +
             `${indent}  </${innerTag}>\n` +
             `${indent}</${tag}>\n`;
    }

    // 4. Primitive string URI
    if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
      return `${indent}<${tag} rdf:resource="${escapeXml(val)}"/>\n`;
    }

    // 5. Primitive string / number / boolean literal
    return `${indent}<${tag}>${escapeXml(val)}</${tag}>\n`;
  }

  // Serialize each top-level node
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;

    let rootNodeTag = 'rdf:Description';
    let extraTypeElements = '';

    if (node['@type']) {
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      const firstType = resolvePropertyUri(types[0], docContext);
      rootNodeTag = firstType.tag;

      if (types.length > 1) {
        for (let i = 1; i < types.length; i++) {
          const extraType = resolvePropertyUri(types[i], docContext);
          extraTypeElements += `    <rdf:type rdf:resource="${escapeXml(extraType.uri)}"/>\n`;
        }
      }
    }

    let aboutAttr = '';
    if (node['@id']) {
      const id = node['@id'];
      if (id.startsWith('_:')) {
        aboutAttr = ` rdf:nodeID="${escapeXml(id.replace(/^_+:?/, ''))}"`;
      } else {
        aboutAttr = ` rdf:about="${escapeXml(id)}"`;
      }
    }

    let nodeContent = '';
    for (const key of Object.keys(node)) {
      if (key.startsWith('@')) continue;
      nodeContent += serializeProperty(key, node[key], '    ');
    }

    xml += `  <${rootNodeTag}${aboutAttr}>\n`;
    xml += extraTypeElements;
    xml += nodeContent;
    xml += `  </${rootNodeTag}>\n\n`;
  }

  xml += '</rdf:RDF>\n';
  return xml;
}
