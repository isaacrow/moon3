/**
 * Serves a published record as linked data: JSON-LD, N-Triples or Turtle, chosen by the URL's
 * extension or the request's Accept header (content negotiation, as id.loc.gov does).
 *
 * Records are stored with prefixed keys (bf:title…) under a bare BIBFRAME @context; here they get a
 * full context so standard JSON-LD tools read them, and keys outside it (app bookkeeping such as
 * recordId or createdAt) are dropped, as the app's own export does.
 */
import jsonld from "npm:jsonld@8.3.3";
import { Parser, Writer } from "npm:n3@1.17.4";
import { toBoundedRdfXml } from "./rdfXml.tsx";
import { withLcAdminMetadata, type AdminFacts } from "./lcAdminMetadata.tsx";
import { entityNodes } from "./entityDocument.tsx";
import { withLcLabels } from "./lcLabels.tsx";
import { finishPublished } from "./publishedOutput.tsx";
import { licenceOf } from "./licence.tsx";

export const BASE_URI = (Deno.env.get("MOON_URI_BASE") || "https://mooon.site/resource").replace(/\/+$/, "");

export const CONTEXT: Record<string, string> = {
  bf: "http://id.loc.gov/ontologies/bibframe/",
  bflc: "http://id.loc.gov/ontologies/bflc/",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  madsrdf: "http://www.loc.gov/mads/rdf/v1#",
  // An agent's links to the same person elsewhere (Wikidata, VIAF, LC), kept in the published record.
  owl: "http://www.w3.org/2002/07/owl#",
  moonext: new URL("/ontology/", BASE_URI).toString(),
  // Copies' markings, condition and actions (Art and Rare Materials 1.0), and Moon's SKOS vocabularies (S24).
  arm: "https://w3id.org/arm/ontology/1.0/",
  // Each record's licence (S23).
  dcterms: "http://purl.org/dc/terms/",
  skos: "http://www.w3.org/2004/02/skos/core#",
};

export type Format = "jsonld" | "nt" | "ttl" | "rdf" | "html";

export const MEDIA_TYPES: Record<Exclude<Format, "html">, string> = {
  jsonld: "application/ld+json",
  nt: "application/n-triples",
  ttl: "text/turtle",
  rdf: "application/rdf+xml",
};

const EXTENSIONS: Record<string, Format> = { jsonld: "jsonld", json: "jsonld", nt: "nt", ttl: "ttl", rdf: "rdf", html: "html" };

/** Splits "abc123.ttl" into the id and the format its extension asks for. */
export function splitExtension(id: string): { id: string; format?: Format } {
  const m = id.match(/^(.+)\.([a-z]+)$/i);
  const format = m ? EXTENSIONS[m[2].toLowerCase()] : undefined;
  return format ? { id: m![1], format } : { id };
}

/** The format an Accept header prefers; browsers (text/html, or nothing specific) get the web page. */
export function negotiate(accept: string | null | undefined): Format {
  const wanted = (accept || "")
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().toLowerCase().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { type: type.trim(), q: q ? Number(q.slice(2)) || 0 : 1 };
    })
    .filter((w) => w.type && w.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { type } of wanted) {
    if (type === "text/html" || type === "application/xhtml+xml") return "html";
    if (type === "application/ld+json" || type === "application/json") return "jsonld";
    if (type === "text/turtle" || type === "application/x-turtle") return "ttl";
    if (type === "application/n-triples" || type === "text/plain") return "nt";
    if (type === "application/rdf+xml") return "rdf";
  }
  return "html";
}

/**
 * A published record as it is served as linked data: its stored document with admin metadata the way LC
 * writes it (history events, BIBFRAME version, cataloguing language, local record number).
 */
export function publishedDocument(record: { id: string; document: any; title?: string; cataloger?: string; createdAt?: string; saved?: string; approvedBy?: string; metadata?: Record<string, unknown> }): any {
  const facts: AdminFacts = { id: record.id, cataloger: record.cataloger, createdAt: record.createdAt, saved: record.saved, approvedBy: record.approvedBy, license: licenceOf(record).uri };
  // Access points (bflc:aap) on Works and Hubs, and LC variant title types, as LC's records carry them.
  // Then strict BIBFRAME 3.0.1, language-tagged and with EDTF dates (publishedOutput.tsx, Phase 12).
  return finishPublished(withLcLabels(withLcAdminMetadata(record.document, facts, BASE_URI)), { title: record.title });
}

/** The stored document with a full @context, ready for any JSON-LD processor. */
export function toJsonLd(document: any): any {
  return { "@context": CONTEXT, "@graph": Array.isArray(document?.["@graph"]) ? document["@graph"] : [] };
}

/** The document flattened and expanded (full IRIs, every value in a list), as FOLIO's linked-data import reads. */
export async function flattened(document: any): Promise<any[]> {
  const flat: any = await jsonld.flatten(toJsonLd(document));
  return Array.isArray(flat) ? flat : Array.isArray(flat?.["@graph"]) ? flat["@graph"] : [];
}

export async function toNTriples(document: any): Promise<string> {
  return await jsonld.toRDF(toJsonLd(document), { format: "application/n-quads" }) as string;
}

export async function toTurtle(document: any): Promise<string> {
  const quads = new Parser({ format: "N-Triples" }).parse(await toNTriples(document));
  const writer = new Writer({ prefixes: CONTEXT });
  writer.addQuads(quads);
  return await new Promise<string>((resolve, reject) =>
    writer.end((err: Error | null, out: string) => (err ? reject(err) : resolve(out))));
}

/** N-Triples text → RDF/XML, in the bounded-description shape LC's Marva and bibframe2marc read. */
export function nTriplesToRdfXml(nt: string, prefixes: Record<string, string> = CONTEXT): string {
  return toBoundedRdfXml(new Parser({ format: "N-Triples" }).parse(nt) as any, prefixes);
}

export async function toRdfXmlText(document: any): Promise<string> {
  return nTriplesToRdfXml(await toNTriples(document));
}

const AUTHORITY_CONTEXT: Record<string, string> = {
  ...CONTEXT,
  skos: "http://www.w3.org/2004/02/skos/core#",
};

/**
 * A Moon entity as linked data, in LC's two parts: the thing itself (bf:Person … bf:Temporal) and its MADS
 * authority data at <uri>#authority (see entityDocument.tsx).
 */
export function authorityDocument(a: {
  id: string; kind: string; label: string; variants: string[]; sameAs: string[]; note?: string | null; data?: any;
}, expressions: string[] = []): any {
  // Through the same last step as records: Arabic names tagged @ar (romanized forms beside them @ar-Latn).
  return finishPublished({ "@context": AUTHORITY_CONTEXT, "@graph": entityNodes(a, BASE_URI, expressions) });
}

export async function authorityNTriples(doc: any): Promise<string> {
  return await jsonld.toRDF(doc, { format: "application/n-quads" }) as string;
}

export async function authorityTurtle(doc: any): Promise<string> {
  const quads = new Parser({ format: "N-Triples" }).parse(await authorityNTriples(doc));
  const writer = new Writer({ prefixes: AUTHORITY_CONTEXT });
  writer.addQuads(quads);
  return await new Promise<string>((resolve, reject) =>
    writer.end((err: Error | null, out: string) => (err ? reject(err) : resolve(out))));
}

/** The Works in these records that are expressions of `hubUri` (bf:expressionOf pointing at it). */
export function worksExpressing(documents: any[], hubUri: string): string[] {
  const refs = (v: any): string[] => (Array.isArray(v) ? v : v == null ? [] : [v])
    .map((x) => (typeof x === "string" ? x : x?.["@id"])).filter((x): x is string => typeof x === "string");
  const out = new Set<string>();
  for (const doc of documents) {
    for (const n of Array.isArray(doc?.["@graph"]) ? doc["@graph"] : []) {
      const id = n?.["@id"];
      if (typeof id !== "string" || id.startsWith("_:")) continue;
      if (refs(n["bf:expressionOf"] ?? n["expressionOf"]).includes(hubUri)) out.add(id);
    }
  }
  return [...out].sort();
}

/**
 * Gives a record's blank nodes (_:b0 …) names of their own (_:r3-b0), so that when many records go
 * into one dump file, two records' blank nodes are never read as the same node.
 */
export function scopeBlankNodes(value: any, prefix: string): any {
  if (Array.isArray(value)) return value.map((v) => scopeBlankNodes(v, prefix));
  if (!value || typeof value !== "object") return value;
  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === "@id" && typeof v === "string" && v.startsWith("_:") ? `_:${prefix}-${v.slice(2)}` : scopeBlankNodes(v, prefix);
  }
  return out;
}

/**
 * All the given records in one JSON-LD document (one @graph), blank nodes kept apart per record; then the
 * entities they use (authorityDocument: MADS authority + real-world object + owl:sameAs), so the dump and
 * SPARQL can follow a record to its author and on to LC, VIAF and Wikidata.
 */
export function dumpJsonLd(documents: any[], entityDocs: any[] = []): any {
  const graph = documents.flatMap((doc, i) =>
    (Array.isArray(doc?.["@graph"]) ? doc["@graph"] : []).map((n: any) => scopeBlankNodes(n, `r${i}`)));
  const entities = entityDocs.flatMap((doc, i) =>
    (Array.isArray(doc?.["@graph"]) ? doc["@graph"] : []).map((n: any) => scopeBlankNodes(n, `e${i}`)));
  return { "@context": { ...AUTHORITY_CONTEXT, ...CONTEXT }, "@graph": [...graph, ...entities] };
}

/** All the given records as N-Triples, record by record; blank nodes renamed per record. */
export async function dumpNTriples(documents: any[], entityDocs: any[] = []): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < documents.length; i++) {
    const nt = await toNTriples(documents[i]);
    parts.push(nt.replace(/_:([A-Za-z0-9_-]+)/g, `_:r${i}-$1`));
  }
  for (let i = 0; i < entityDocs.length; i++) {
    const nt = await authorityNTriples(entityDocs[i]);
    parts.push(nt.replace(/_:([A-Za-z0-9_-]+)/g, `_:e${i}-$1`));
  }
  return parts.join("");
}

/** Every entity as linked data (hubs with the published works that express them), for the dump and SPARQL. */
export function entityDocuments(entities: Array<{ id: string; kind: string; label: string; variants: string[]; sameAs: string[]; note?: string | null; data?: any }>, publishedDocs: any[]): any[] {
  return entities.map((e) => authorityDocument(e, e.kind === "hub" ? worksExpressing(publishedDocs, `${BASE_URI}/hub/${e.id}`) : []));
}
