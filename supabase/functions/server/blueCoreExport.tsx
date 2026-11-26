/**
 * Moon's records in Blue Core's shape (plan step A4; Blue Core is the shared BIBFRAME store of LC and the LD4P
 * libraries, https://dev.bcld.info): a Work and its Instance, each one JSON-LD resource as Blue Core's API serves and
 * takes them: BIBFRAME terms without their prefix under Blue Core's context (bibframe-json.org), BFLC, RDFS and MADS
 * terms with theirs, every value in a list, blank nodes written in place, the Work and Instance linked by address.
 * Moon already imports from Blue Core (src/services/blueCore.ts); with this, one record goes both ways
 * (test/blueCore.test.ts). Pure: no imports.
 */
export const BLUE_CORE_CONTEXT = "https://bibframe-json.org/v0.1/context/bibframe.jsonld";
const BF = "http://id.loc.gov/ontologies/bibframe/";

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
/** A term as Blue Core's context names it: bf: dropped (the context's vocabulary), other prefixes kept. */
export function termName(key: string): string {
  if (key.startsWith("bf:")) return key.slice(3);
  if (key.startsWith(BF)) return key.slice(BF.length);
  return key;
}
const typeName = (t: string) => termName(t);
const isType = (n: any, name: string) => list(n?.["@type"]).some((t) => typeof t === "string" && typeName(t) === name);
const isInstance = (n: any) => ["Instance", "Print", "Electronic", "Manuscript", "Microform", "Tactile"].some((t) => isType(n, t));

const isWork = (n: any) => !isInstance(n) && ["Work", "Text", "Monograph", "NotatedMusic", "Cartography", "StillImage", "Audio", "MovingImage"].some((t) => isType(n, t));

export interface BlueCoreResource { type: "works" | "instances"; uri: string; data: Record<string, any> }

/** A Moon record (a JSON-LD document with an @graph) as Blue Core resources: its Works and Instances. */
export function toBlueCore(document: any): BlueCoreResource[] {
  const graph: any[] = Array.isArray(document?.["@graph"]) ? document["@graph"] : document ? [document] : [];
  const byId = new Map(graph.filter((n) => typeof n?.["@id"] === "string").map((n) => [n["@id"], n]));
  const top = new Set(graph.filter((n) => isWork(n) || isInstance(n)).map((n) => n["@id"]));

  const value = (v: any, depth: number, seen: Set<string>): any => {
    if (v === null || v === undefined) return undefined;
    if (typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x) => value(x, depth, seen)).filter((x) => x !== undefined);
    const id = v["@id"];
    // A Work or Instance, or anything with an address outside this record, is linked by its address; a node of
    // this record without its own resource (a title, a contribution, a blank node) is written in place.
    if (typeof id === "string" && Object.keys(v).length === 1) {
      const inner = byId.get(id);
      if (!inner || top.has(id) || !id.startsWith("_:") || seen.has(id) || depth > 8) return { "@id": id };
      return node(inner, depth + 1, new Set([...seen, id]));
    }
    if ("@value" in v) return v;
    return node(v, depth + 1, seen);
  };
  const node = (n: any, depth: number, seen: Set<string>): Record<string, any> => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(n)) {
      if (k === "@context") continue;
      if (k === "@id") { if (typeof v === "string" && !v.startsWith("_:")) out["@id"] = v; continue; }
      if (k === "@type") { out["@type"] = list(v).filter((t) => typeof t === "string").map(typeName); continue; }
      if (k === "moonext:marcField") continue; // kept MARC stays in Moon
      const vals = list(value(v, depth, seen)).filter((x) => x !== undefined && x !== "");
      if (vals.length) out[termName(k)] = vals;
    }
    return out;
  };

  return graph.filter((n) => top.has(n["@id"])).map((n) => {
    const data = node(n, 0, new Set([n["@id"]]));
    return { type: isInstance(n) ? "instances" as const : "works" as const, uri: n["@id"], data: { "@context": BLUE_CORE_CONTEXT, ...data } };
  });
}
