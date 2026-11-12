// Draft summaries for records that have none (OPAC plan, stage 1 step 6). Only 26 of 204 published works carry a
// summary, and a summary is what tells a reader (and a search engine or AI assistant) what a book is about.
//
// The rules: Claude drafts from the record's own facts only (title, people, date, subjects, genre, series, contents,
// notes), never from outside knowledge; a record with too little to go on gets no draft ("not enough facts").
// A draft is NOT published: it waits beside the record until a reviewer reads it, edits it if needed and approves
// it; only then is it written into the record as bf:Summary, as a new version (undone from the record's history).
// Pure: index.tsx calls Claude (askClaude.tsx) and the store.

import { bookFactsOf } from "./seoPages.tsx";

export const DRAFT_PREFIX = "moon:summary-draft:";
export const MAX_SUMMARY = 1200;

const list = (v: any): any[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const typed = (n: any, t: string) => list(n?.["@type"]).some((x: any) => String(x) === `bf:${t}` || String(x).endsWith(`/${t}`));
const text = (v: any): string => {
  for (const x of list(v)) {
    if (typeof x === "string") return x.trim();
    if (x && typeof x === "object") { const t = text(x["@value"] ?? x["rdfs:label"]); if (t) return t; }
  }
  return "";
};
const graphOf = (document: any): any[] => (Array.isArray(document?.["@graph"]) ? document["@graph"] : []);
const workOf = (document: any) => graphOf(document).find((n) => typed(n, "Work"));

/** Whether the record's Work already has a summary (then no draft is made). */
export function hasSummary(document: any): boolean {
  const graph = graphOf(document);
  const byId = new Map(graph.map((n) => [n?.["@id"], n]));
  return list(workOf(document)?.["bf:summary"]).some((s) => text(s?.["@id"] && byId.has(s["@id"]) ? byId.get(s["@id"]) : s).length > 0);
}

export interface DraftInput { facts: string; language: "ar" | "en"; enoughFacts: boolean }

/**
 * The record's facts, one per line, for Claude to write from, and the language to write in (the book's: Arabic
 * for an Arabic book or an Arabic title, else English). enoughFacts is false when there is no more than a title.
 */
export function draftInput(r: { id: string; title?: string; document: any }): DraftInput {
  const f = bookFactsOf({ id: r.id, title: r.title, document: r.document });
  const graph = graphOf(r.document);
  const byId = new Map(graph.map((n) => [n?.["@id"], n]));
  const deref = (v: any) => (v?.["@id"] && byId.has(v["@id"]) ? byId.get(v["@id"]) : v);
  const work = workOf(r.document) || {};
  const instance = graph.find((n) => typed(n, "Instance")) || {};
  const genres = list(work["bf:genreForm"]).map(deref).map((g) => text(g?.["rdfs:label"] ?? g)).filter((g) => g && !/^https?:/.test(g));
  const contents = text(deref(work["bf:tableOfContents"] ?? instance["bf:tableOfContents"]));
  const notes = list(work["bf:note"] ?? instance["bf:note"]).map(deref).map((n) => text(n?.["rdfs:label"] ?? n)).filter(Boolean);
  const series = text(instance["bf:seriesStatement"]);
  const lines = [
    `Title: ${f.title}`,
    f.creator && `Author or main person: ${f.creator}`,
    f.year && `Date: ${f.year}`,
    f.publisher && `Publisher: ${f.publisher}`,
    f.language && `Language (MARC code): ${f.language}`,
    genres.length && `Genre or form: ${genres.join("; ")}`,
    f.subjects?.length && `Subjects: ${f.subjects.join("; ")}`,
    series && `Series: ${series}`,
    contents && `Contents: ${contents.slice(0, 1500)}`,
    notes.length && `Notes: ${notes.join(" | ").slice(0, 1000)}`,
  ].filter(Boolean) as string[];
  const arabic = f.language === "ara" || /[؀-ۿ]/.test(f.title);
  // A title alone, or a title and a date, is not enough to say what a book is about without guessing.
  const telling = [f.subjects?.length, genres.length, contents, notes.length].filter(Boolean).length;
  return { facts: lines.join("\n"), language: arabic ? "ar" : "en", enoughFacts: telling > 0 };
}

export const DRAFT_SYSTEM = [
  "You write the summary note of a library catalogue record: two to four plain sentences saying what the book is and what it covers.",
  "Use ONLY the facts given. Do not add anything you know from elsewhere: no dates, places, people, praise, claims about importance or reception that the facts do not state.",
  "Write in the language asked for, in a neutral catalogue voice. Do not start with the title; do not repeat the list of facts.",
  "If the facts do not say what the book is about (a title and a date only, say), set enoughFacts to false and leave summary empty.",
].join(" ");

export interface Draft { recordId: string; summary: string; language: "ar" | "en"; model: string; at: string; facts: string }

/** A reviewer's approval: the (possibly edited) text, cleaned; null when it is empty or too long. */
export function parseApproval(body: unknown): { summary: string; language: "ar" | "en" } | null {
  const b = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const summary = typeof b.summary === "string" ? b.summary.replace(/\s+/g, " ").trim() : "";
  if (summary.length < 20 || summary.length > MAX_SUMMARY) return null;
  return { summary, language: b.language === "ar" ? "ar" : "en" };
}

/**
 * The document with the approved summary on its Work, written as Moon's records already write one
 * ({ "@type": "bf:Summary", "rdfs:label": "…" }, the form the catalogue reads). Input unchanged.
 */
export function withSummary(document: any, summary: string): any {
  const doc = JSON.parse(JSON.stringify(document));
  const work = workOf(doc);
  if (!work) return doc;
  const node = { "@type": "bf:Summary", "rdfs:label": summary };
  work["bf:summary"] = work["bf:summary"] === undefined ? node : [...list(work["bf:summary"]), node];
  return doc;
}
