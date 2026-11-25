/**
 * Moon's published records checked against the BIBFRAME Interoperability Group's (BIG) shapes for monographs
 * (DCTAP, copied by scripts/big-dctap.mts into bigDctap.generated.tsx). This is the check BIG and other BIBFRAME
 * systems use to say data can be exchanged; the score is public on score.html.
 *
 * Read as BIG's SHACL reads it: a shape applies to every node whose rdf:type is one of its targets; a "mandatory"
 * property missing is a result of the row's severity (Violation or Warning); a non-repeatable property given twice
 * is a result; a value of the wrong kind (link, blank node, literal) is a result; a value shape is checked on the
 * value node too. A value shape BIG names but never defines is skipped, and a literal is never checked as a node.
 * Pure: no imports but the data, so the tests run it in Node.
 */
import { BIG_DCTAP, BIG_DCTAP_VERSION } from "./bigDctap.generated.tsx";

export type Severity = "Violation" | "Warning";
export interface PropertyRule { shape: string; property: string; label: string; mandatory: boolean; severity: Severity; kinds: Array<"iri" | "bnode" | "literal">; repeatable: boolean; valueShape?: string }
export interface Shape { id: string; label: string; targets: string[]; rules: PropertyRule[] }

const split = (s: string) => s.split(";").map((x) => x.trim()).filter(Boolean);

/** The shapes from BIG's TSV files, by id (a shape repeated across files is one shape). */
export function parseDctap(files: Record<string, string> = BIG_DCTAP): { shapes: Map<string, Shape>; prefixes: Record<string, string> } {
  const prefixes: Record<string, string> = {};
  for (const line of (files.Monograph_Prefixes || "").split("\n").slice(1)) {
    const [, prefix, ns] = line.split("\t").map((x) => (x || "").trim());
    if (prefix && ns) prefixes[prefix.replace(/:$/, "")] = ns;
  }
  const expand = (curie: string) => {
    const m = curie.trim().match(/^([A-Za-z]+):(.+)$/);
    return m && prefixes[m[1]] && m[1] !== "big" ? prefixes[m[1]] + m[2] : curie.trim();
  };
  const shapes = new Map<string, Shape>();
  for (const [name, tsv] of Object.entries(files)) {
    if (name === "Monograph_Prefixes") continue;
    const [head, ...rows] = tsv.split("\n");
    const cols = head.split("\t").map((c) => c.trim());
    const at = (cells: string[], c: string) => (cells[cols.indexOf(c)] || "").trim();
    for (const line of rows) {
      const cells = line.split("\t");
      const id = at(cells, "shapeID");
      const property = at(cells, "propertyID");
      if (!id || !property) continue;
      const shape = shapes.get(id) || { id, label: at(cells, "shapeLabel"), targets: [], rules: [] };
      for (const t of split(at(cells, "target")).map(expand)) if (!shape.targets.includes(t)) shape.targets.push(t);
      if (!shape.label) shape.label = at(cells, "shapeLabel");
      const kinds = split(at(cells, "valueNodeType").toLowerCase()).map((k) => (k === "iri" ? "iri" : k === "bnode" ? "bnode" : "literal")) as PropertyRule["kinds"];
      const rule: PropertyRule = {
        shape: id,
        property: expand(property),
        label: at(cells, "propertyLabel") || property,
        mandatory: /^true$/i.test(at(cells, "mandatory")),
        severity: /^warning/i.test(at(cells, "severity")) ? "Warning" : "Violation",
        kinds,
        repeatable: !/^false$/i.test(at(cells, "repeatable")),
        ...(at(cells, "valueShape") ? { valueShape: at(cells, "valueShape") } : {}),
      };
      if (!shape.rules.some((r) => r.property === rule.property)) shape.rules.push(rule);
      shapes.set(id, shape);
    }
  }
  return { shapes, prefixes };
}

type Term = { kind: "iri" | "bnode" | "literal"; v: string };
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

function term(s: string): Term {
  if (s.startsWith("<")) return { kind: "iri", v: s.slice(1, -1) };
  if (s.startsWith("_:")) return { kind: "bnode", v: s };
  return { kind: "literal", v: s };
}

/** Subjects with their properties, from N-Triples. */
export function readNTriples(nt: string): Map<string, Array<{ p: string; o: Term }>> {
  const graph = new Map<string, Array<{ p: string; o: Term }>>();
  for (const line of nt.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const m = l.match(/^(\S+)\s+<([^>]+)>\s+(.+?)\s*\.$/);
    if (!m) continue;
    const s = term(m[1]).v;
    const list = graph.get(s) || [];
    list.push({ p: m[2], o: term(m[3]) });
    graph.set(s, list);
  }
  return graph;
}

export interface CheckCount { shape: string; property: string; label: string; severity: Severity; problem: "missing" | "repeated" | "wrong kind"; nodes: number }
export interface BigReport {
  version: string;
  /** Focus nodes by top shape: how many were checked and how many had no Violation. */
  shapes: Array<{ shape: string; label: string; checked: number; conforming: number; withWarnings: number }>;
  /** Each failing rule, with the number of nodes it failed on. */
  results: CheckCount[];
}

/** Checks every node of the graph that a BIG shape targets. */
export function checkBig(nt: string, files: Record<string, string> = BIG_DCTAP): BigReport {
  const { shapes } = parseDctap(files);
  const graph = readNTriples(nt);
  const typesOf = (s: string) => (graph.get(s) || []).filter((x) => x.p === RDF_TYPE).map((x) => x.o.v);
  const counts = new Map<string, CheckCount>();
  // Each node counts once per rule and problem, however many focus nodes reach it (a Work is reached from each of
  // its Instances too).
  const counted = new Set<string>();
  const note = (r: PropertyRule, problem: CheckCount["problem"], node: string) => {
    const k = `${r.shape}|${r.property}|${problem}`;
    if (counted.has(`${k}|${node}`)) return;
    counted.add(`${k}|${node}`);
    const c = counts.get(k) || { shape: r.shape, property: r.property, label: r.label, severity: r.severity, problem, nodes: 0 };
    c.nodes++;
    counts.set(k, c);
  };

  /** The worst severity found on this node and the nodes its value shapes point at. */
  const check = (node: string, shape: Shape, depth: number, visited: Set<string>): Severity | null => {
    if (depth > 6 || visited.has(`${node}|${shape.id}`)) return null;
    visited.add(`${node}|${shape.id}`);
    let worst: Severity | null = null;
    const raise = (s: Severity) => { if (s === "Violation" || !worst) worst = s; };
    const props = graph.get(node) || [];
    for (const r of shape.rules) {
      const values = props.filter((x) => x.p === r.property).map((x) => x.o);
      if (!values.length) { if (r.mandatory) { note(r, "missing", node); raise(r.severity); } continue; }
      if (!r.repeatable && values.length > 1) { note(r, "repeated", node); raise(r.severity); }
      if (r.kinds.length && values.some((v) => !r.kinds.includes(v.kind))) { note(r, "wrong kind", node); raise(r.severity); }
      const inner = r.valueShape ? shapes.get(r.valueShape) : undefined;
      if (inner) for (const v of values) if (v.kind !== "literal") { const w = check(v.v, inner, depth + 1, visited); if (w) raise(w); }
    }
    return worst;
  };

  const top = [...shapes.values()].filter((s) => /^big:Monograph:|^big:AdminMetadata$/.test(s.id));
  const summary = top.map((s) => {
    const nodes = [...graph.keys()].filter((n) => typesOf(n).some((t) => s.targets.includes(t)));
    let conforming = 0, withWarnings = 0;
    for (const n of nodes) {
      const w = check(n, s, 0, new Set());
      if (w !== "Violation") conforming++;
      if (w === "Warning") withWarnings++;
    }
    return { shape: s.id, label: s.label, checked: nodes.length, conforming, withWarnings };
  });
  return {
    version: BIG_DCTAP_VERSION,
    shapes: summary,
    results: [...counts.values()].sort((a, b) => (a.severity === b.severity ? b.nodes - a.nodes : a.severity === "Violation" ? -1 : 1)),
  };
}
