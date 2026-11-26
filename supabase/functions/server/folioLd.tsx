/**
 * BIBFRAME to FOLIO directly (plan step H11, after FOLIO's mod-linked-data-import, Trillium 2026): Moon's published
 * records as the file FOLIO's linked-data import reads (https://github.com/folio-org/mod-linked-data-import): JSON
 * Lines, each line the complete subgraph of one bf:Instance (its Work, titles, contributions, publication …) as
 * flattened, expanded JSON-LD, beside today's MARC push to Inventory. Items are left out: FOLIO's import takes
 * Instances and the resources connected to them; copies stay in Inventory.
 * Pure: index.tsx flattens each published record with jsonld and hands the nodes here.
 */
const BF = "http://id.loc.gov/ontologies/bibframe/";
const RDF_TYPE = "@type";
const ITEM_LINKS = new Set([`${BF}hasItem`, `${BF}itemOf`]);

const typesOf = (n: any): string[] => (Array.isArray(n?.[RDF_TYPE]) ? n[RDF_TYPE] : n?.[RDF_TYPE] ? [n[RDF_TYPE]] : []);
const isA = (n: any, local: string) => typesOf(n).includes(BF + local);
const INSTANCE_TYPES = ["Instance", "Print", "Electronic", "Manuscript", "Microform", "Tactile"];
const isInstance = (n: any) => INSTANCE_TYPES.some((t) => isA(n, t));
const isItem = (n: any) => isA(n, "Item");

/** The nodes a node points at (@id values of its properties). */
function refs(n: any): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(n)) {
    if (k.startsWith("@") || ITEM_LINKS.has(k)) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (x && typeof x === "object" && typeof x["@id"] === "string") out.push(x["@id"]);
  }
  return out;
}

/**
 * One line per Instance: the Instance and every node reachable from it in the same record (its Work through
 * bf:instanceOf, and onward), never another Instance or an Item, with the links to Items taken out.
 */
export function folioInstanceLines(flat: any[]): any[][] {
  const byId = new Map(flat.filter((n) => typeof n?.["@id"] === "string").map((n) => [n["@id"], n]));
  const clean = (n: any) => Object.fromEntries(Object.entries(n).filter(([k]) => !ITEM_LINKS.has(k)));
  return flat.filter(isInstance).map((inst) => {
    const seen = new Set<string>([inst["@id"]]);
    const queue = [inst];
    const out: any[] = [];
    while (queue.length) {
      const n = queue.shift()!;
      out.push(clean(n));
      for (const id of refs(n)) {
        const next = byId.get(id);
        if (!next || seen.has(id) || isItem(next) || (isInstance(next) && next !== inst)) continue;
        seen.add(id);
        queue.push(next);
      }
    }
    // Keep the Work's link back to this Instance only (bf:hasInstance to others would point outside the line).
    return out.map((n) => (isInstance(n) ? n : {
      ...n,
      ...(n[`${BF}hasInstance`] ? { [`${BF}hasInstance`]: (n[`${BF}hasInstance`] as any[]).filter((x) => x?.["@id"] === inst["@id"]) } : {}),
    })).map((n) => (Array.isArray(n[`${BF}hasInstance`]) && !n[`${BF}hasInstance`].length ? (({ [`${BF}hasInstance`]: _drop, ...rest }) => rest)(n) : n));
  });
}

/** The lines as one JSON Lines file. */
export const toJsonLines = (lines: any[][]) => lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : "");
