/**
 * Admin metadata the way LC writes it (BIBFRAME primer, "Administrative Metadata"): a description carries
 * several bf:AdminMetadata resources —
 *   - brief events in its history: bf:status (mstatus "n" new, "c" corrected), bf:date and bf:agent;
 *   - one with the cataloguing details: bf:descriptionLevel (the BIBFRAME 3.0.1 ontology),
 *     bflc:encodingLevel, bf:descriptionConventions, bf:descriptionLanguage and the local record number
 *     (bf:identifiedBy bf:Local with its assigner).
 * Applied when a record is served as linked data (every format, the dump, SPARQL), from what the server
 * knows about the record, so nothing is invented. Pure and dependency-free: runs in the edge function and
 * in node tests and scripts.
 */

const BF = "http://id.loc.gov/ontologies/bibframe/";
const MSTATUS = "http://id.loc.gov/vocabulary/mstatus/";
export const DESCRIPTION_LEVEL = "http://id.loc.gov/ontologies/bibframe-3-0-1/";
const ENCODING_FULL = "http://id.loc.gov/vocabulary/menclvl/f";
const RDA = "http://id.loc.gov/vocabulary/descriptionConventions/rda";
const LANG = "http://id.loc.gov/vocabulary/languages/";

export interface AdminFacts {
  id: string;
  cataloger?: string;
  createdAt?: string;
  saved?: string;
  approvedBy?: string;
  /** The description's licence (S23): a URI, or "" when it may not be redistributed. */
  license?: string;
}

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const get = (n: any, key: string) => n?.[`bf:${key}`] ?? n?.[key] ?? n?.[`${BF}${key}`];
const types = (n: any): string[] => list(n?.["@type"]).map(String);
const isA = (n: any, cls: string) => types(n).some((t) => t === `bf:${cls}` || t === cls || t === `${BF}${cls}`);
const idOf = (v: any): string | undefined => (typeof v === "string" ? v : v?.["@id"]);

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/g;
const LATIN = /[A-Za-zÀ-ɏ]/g;

/** Every text value under a node (a label, a value, a plain string), however it is written. */
function texts(v: any, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => texts(x, out));
  else if (v && typeof v === "object") {
    if (typeof v["@value"] === "string") out.push(v["@value"]);
    for (const [k, x] of Object.entries(v)) if (!k.startsWith("@")) texts(x, out);
  }
  return out;
}

/**
 * The language the description was written in (MARC 040 $b): judged from the cataloguer's own words —
 * extent, dimensions and notes — not from transcribed titles, which are in the book's language. When those
 * say nothing, the stored value stands.
 */
export function catalogingLanguage(graph: any[], stored?: string): string | undefined {
  let ar = 0, la = 0;
  for (const n of graph) {
    if (!isA(n, "Instance") && !isA(n, "Work") && !isA(n, "Item")) continue;
    for (const key of ["extent", "dimensions", "note"]) {
      for (const t of texts(get(n, key))) {
        ar += (t.match(ARABIC) || []).length;
        la += (t.match(LATIN) || []).length;
      }
    }
  }
  if (ar === 0 && la === 0) return stored;
  return ar >= la ? `${LANG}ara` : (stored && !stored.endsWith("/eng") ? stored : `${LANG}eng`);
}

/** The record's document with LC-style admin metadata. The input is not changed. */
const XSD_DATE = "http://www.w3.org/2001/XMLSchema#date";
/** A date written as a string or { "@value": … }, if it parses. */
function textOfDate(v: any): string | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  const s = typeof x === "string" ? x : x && typeof x === "object" ? x["@value"] : undefined;
  return typeof s === "string" && !isNaN(new Date(s).getTime()) ? new Date(s).toISOString() : undefined;
}

/** The first text of a label (a string, { "@value": … } or a list of them). */
function textOfLabel(v: any): string {
  const x = Array.isArray(v) ? v[0] : v;
  const t = typeof x === "string" ? x : x && typeof x === "object" ? x["@value"] : "";
  return typeof t === "string" ? t.trim() : "";
}

export function withLcAdminMetadata(document: any, facts: AdminFacts, base = "https://mooon.site/resource"): any {
  const doc = structuredClone(document || {});
  const graph: any[] = Array.isArray(doc["@graph"]) ? doc["@graph"] : (doc["@graph"] = []);
  const work = graph.find((n) => isA(n, "Work") && !idOf(get(n, "expressionOf"))) || graph.find((n) => isA(n, "Work"));
  const instance = graph.find((n) => isA(n, "Instance"));
  if (!work && !instance) return doc;

  // The cataloguing-details resource: the record's own AdminMetadata node, made complete.
  let details = graph.find((n) => isA(n, "AdminMetadata") && !get(n, "status"));
  if (!details) {
    details = { "@id": `${base}/admin/${facts.id}`, "@type": "bf:AdminMetadata" };
    graph.push(details);
  }
  const set = (key: string, value: any) => {
    if (get(details, key) === undefined) details[key] = value;
  };
  set("bf:descriptionLevel", { "@id": DESCRIPTION_LEVEL });
  if (details["bflc:encodingLevel"] === undefined && details["encodingLevel"] === undefined) {
    details["bflc:encodingLevel"] = { "@id": ENCODING_FULL };
  }
  set("bf:descriptionConventions", { "@id": RDA });
  const storedLang = list(get(details, "descriptionLanguage")).map(idOf).find(Boolean);
  const lang = catalogingLanguage(graph, storedLang);
  if (lang) {
    delete details["descriptionLanguage"];
    delete details[`${BF}descriptionLanguage`];
    details["bf:descriptionLanguage"] = { "@id": lang };
  }
  const locals = list(get(details, "identifiedBy"));
  if (!locals.some((x) => isA(x, "Local") && texts(x).includes(facts.id))) {
    details["bf:identifiedBy"] = [...locals.filter((x) => x !== undefined), {
      "@type": "bf:Local",
      "rdf:value": facts.id,
      "bf:assigner": { "@type": "bf:Organization", "rdfs:label": "Moon" },
    }];
    if (details["identifiedBy"] !== undefined) delete details["identifiedBy"];
  }

  // Open data (S23): the description's licence, and who made and licenses it (Moon, unless MARC said otherwise).
  if (facts.license !== undefined && get(details, "license") === undefined && details["dcterms:license"] === undefined) {
    if (facts.license) details["dcterms:license"] = { "@id": facts.license };
    else details["dcterms:rights"] = "Not for redistribution";
  }
  set("bf:assigner", { "@type": "bf:Organization", "rdfs:label": "Moon" });
  set("bflc:metadataLicensor", { "@type": "bf:Organization", "rdfs:label": "Moon" });
  // When it was catalogued (BIG's shapes require bf:creationDate and bf:assigner on every bf:AdminMetadata).
  const dayOf = (d?: string) => (d && !isNaN(new Date(d).getTime()) ? new Date(d).toISOString().slice(0, 10) : undefined);
  const created = dayOf(facts.createdAt) || dayOf(facts.saved);
  if (created) set("bf:creationDate", { "@value": created, "@type": XSD_DATE });
  const changed = dayOf(facts.saved);
  if (changed && changed !== created) set("bf:changeDate", { "@value": changed, "@type": XSD_DATE });

  // Events in the record's history, on the Work (as LC's converter writes them): created, then corrected.
  const target = work || instance;
  const links = list(target["bf:adminMetadata"] ?? target["adminMetadata"]);
  const alreadyHasEvents = links.some((l) => typeof l === "object" && get(l, "status"));
  const events: any[] = [];
  const event = (status: "n" | "c", date: string | undefined, who: string | undefined) => {
    const d = date && !isNaN(new Date(date).getTime()) ? new Date(date).toISOString() : undefined;
    if (!d) return;
    events.push({
      "@type": "bf:AdminMetadata",
      "bf:status": { "@id": `${MSTATUS}${status}` },
      "bf:date": { "@value": d, "@type": "http://www.w3.org/2001/XMLSchema#dateTime" },
      // BIG: every bf:AdminMetadata names its date ("cataloged or updated/changed") and its institution.
      "bf:creationDate": { "@value": d.slice(0, 10), "@type": XSD_DATE },
      "bf:assigner": { "@type": "bf:Organization", "rdfs:label": "Moon" },
      ...(who ? { "bf:agent": { "@type": "bf:Agent", "rdfs:label": who } } : {}),
    });
  };
  // Admin nodes that came with the record (an import's own cataloguing source, history from an earlier save): the
  // same two facts. The date is the node's own, else the record's; the institution is the source the node names
  // (an imported record's cataloguing agency), else Moon.
  const carried = [work, instance].filter(Boolean).flatMap((n) => list(n["bf:adminMetadata"] ?? n["adminMetadata"]))
    .filter((l) => l && typeof l === "object" && !l["@id"]);
  for (const l of carried) {
    const when = textOfDate(get(l, "date"))?.slice(0, 10) || created;
    if (when && get(l, "creationDate") === undefined) l["bf:creationDate"] = { "@value": when, "@type": XSD_DATE };
    if (get(l, "assigner") === undefined) {
      const label = get(l, "status") ? "" : textOfLabel(l["rdfs:label"] ?? l["label"]);
      l["bf:assigner"] = { "@type": "bf:Organization", "rdfs:label": label || "Moon" };
    }
  }
  if (!alreadyHasEvents) {
    event("n", facts.createdAt, facts.cataloger);
    if (facts.saved && facts.createdAt && new Date(facts.saved).getTime() - new Date(facts.createdAt).getTime() > 1000) {
      event("c", facts.saved, facts.approvedBy || facts.cataloger);
    }
  }
  const ref = { "@id": details["@id"] };
  const linked = (n: any) => list(n["bf:adminMetadata"] ?? n["adminMetadata"]).some((l) => idOf(l) === details["@id"]);
  delete target["adminMetadata"];
  target["bf:adminMetadata"] = [...links.filter((l) => l !== undefined), ...events, ...(linked(target) ? [] : [ref])];
  // LC keeps the cataloguing details on the Instance too.
  if (instance && instance !== target && !linked(instance)) {
    instance["bf:adminMetadata"] = [...list(instance["bf:adminMetadata"] ?? instance["adminMetadata"]), ref];
    delete instance["adminMetadata"];
  }
  return doc;
}
