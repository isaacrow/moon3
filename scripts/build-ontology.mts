// Moon's own vocabulary, documented (plan step F1): the moonext: terms Moon publishes (https://mooon.site/ontology/),
// the manuscript transmission events and their roles (src/services/transmission.ts), and links to Moon's SKOS
// vocabularies. Writes public/ontology/index.ttl (OWL + SKOS, CC0), public/ontology/index.html (to read), and
// public/ontology/<Term>/index.html for each term, so every term's address answers.
//   npx tsx scripts/build-ontology.mts
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { EVENT_KINDS, ROLES } from '../src/services/transmission';

const NS = 'https://mooon.site/ontology/';
type Term = { name: string; kind: 'Class' | 'ObjectProperty' | 'DatatypeProperty'; en: string; ar: string; def: string; sub?: string; domain?: string; range?: string; published: boolean };

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const TERMS: Term[] = [
  { name: 'Expression', kind: 'Class', en: 'Expression', ar: 'تعبير', sub: 'bf:Work', published: true,
    def: 'A Work as one realization of a Hub (a translation, an edition of the text): what BIBFRAME 3 folds into bf:Work, kept apart where Moon\'s editor distinguishes it. Published as bf:Work too.' },
  { name: 'AccessibilityContent', kind: 'Class', en: 'Accessibility content', ar: 'محتوى الإتاحة لذوي الإعاقة', published: true,
    def: 'What makes a resource accessible (captions, audio description, large print). BIBFRAME 3.0.1 has the property but Moon keeps its value as its own class.' },
  { name: 'accessibilityContent', kind: 'ObjectProperty', en: 'accessibility content', ar: 'محتوى الإتاحة', range: 'moonext:AccessibilityContent', published: true,
    def: 'The accessibility content of a resource, as Moon\'s editor records it.' },
  { name: 'GovernmentPublication', kind: 'Class', en: 'Government publication', ar: 'منشور حكومي', published: true,
    def: 'The kind of government body that issued a resource (national, local, international).' },
  { name: 'governmentPublication', kind: 'ObjectProperty', en: 'government publication', ar: 'منشور حكومي', range: 'moonext:GovernmentPublication', published: true,
    def: 'That a resource was issued by a government body, and which kind.' },
  { name: 'projectedProvisionDate', kind: 'DatatypeProperty', en: 'projected publication date', ar: 'تاريخ النشر المتوقع', domain: 'bf:Instance', published: true,
    def: 'When a resource not yet published is expected to appear (as bflc:projectedProvisionDate).' },
  { name: 'TransmissionEvent', kind: 'Class', en: 'Transmission event', ar: 'حدث نقل', sub: 'bf:Event', published: false,
    def: 'An event recorded in a manuscript about how its text was taught, read, copied or held: an ijāzah, a samāʿ, a reading, a colophon, an ownership or a waqf note. A bf:Event (plan step F2), with its people as bf:Contribution, its place as bf:place and its date as bf:date (the Hijri date as written, and EDTF).' },
  ...(Object.entries(EVENT_KINDS) as Array<[string, { ar: string; en: string }]>).map(([k, v]) => ({
    name: cap(k), kind: 'Class' as const, en: v.en, ar: v.ar, sub: 'moonext:TransmissionEvent', published: false,
    def: `A transmission event of the kind ${v.en}, recorded in a manuscript.`,
  })),
  { name: 'transmission', kind: 'ObjectProperty', en: 'transmission event', ar: 'حدث نقل', domain: 'bf:Item', range: 'moonext:TransmissionEvent', published: false,
    def: 'A transmission event recorded in this copy of a manuscript.' },
  { name: 'participant', kind: 'ObjectProperty', en: 'participant', ar: 'مشارك', domain: 'moonext:TransmissionEvent', range: 'bf:Contribution', published: false,
    def: 'A person in the event, with the role as an LC relator (tch teacher, scr scribe, fmo former owner, dnr donor, wit witness, asn for the roles LC has no term for) and the role in the event (moonext:roleInEvent).' },
  { name: 'roleInEvent', kind: 'DatatypeProperty', en: 'role in the event', ar: 'الدور في الحدث', published: false,
    def: `The person's role as the manuscript says it: ${Object.entries(ROLES).map(([k, r]) => `${k} (${r.ar})`).join(', ')}.` },
  { name: 'locator', kind: 'DatatypeProperty', en: 'where in the manuscript', ar: 'الموضع في المخطوط', domain: 'moonext:TransmissionEvent', published: false,
    def: 'Where the note is in the manuscript (f. 120b, الورقة 3أ).' },
  { name: 'transcription', kind: 'DatatypeProperty', en: 'transcription', ar: 'نص القيد', domain: 'moonext:TransmissionEvent', published: false,
    def: 'The note\'s own words, as written in the manuscript.' },
];

const lit = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const ttl = [
  '@prefix moonext: <https://mooon.site/ontology/> .',
  '@prefix bf: <http://id.loc.gov/ontologies/bibframe/> .',
  '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
  '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
  '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
  '@prefix dct: <http://purl.org/dc/terms/> .',
  '',
  '<https://mooon.site/ontology/> a owl:Ontology ;',
  '  dct:title "Moon\'s extension of BIBFRAME"@en , "امتداد مون لـ BIBFRAME"@ar ;',
  '  dct:description "Terms Moon uses beside BIBFRAME 3.0.1 and BFLC: a few kept apart from BIBFRAME, and the events manuscripts record (ijāzah, samāʿ, reading, copying, ownership, waqf) as bf:Event. Moon\'s maqām and copy-action vocabularies are SKOS concept schemes at https://mooon.site/resource/vocab/maqam and https://mooon.site/resource/vocab/item-action; Arabic labels for BIBFRAME at https://mooon.site/resource/bibframe-ar.ttl; Arabic genre and form terms at https://mooon.site/resource/genres-ar.ttl. Dates: a Hijri date is kept as written beside its EDTF form (datatype http://id.loc.gov/datatypes/edtf)."@en ;',
  '  dct:license <https://creativecommons.org/publicdomain/zero/1.0/> ;',
  '  owl:imports <http://id.loc.gov/ontologies/bibframe/> ;',
  '  rdfs:seeAlso <https://mooon.site/resource/vocab/maqam> , <https://mooon.site/resource/vocab/item-action> , <https://mooon.site/resource/bibframe-ar.ttl> , <https://mooon.site/resource/genres-ar.ttl> .',
  '',
  ...TERMS.map((t) => [
    `moonext:${t.name} a owl:${t.kind} ;`,
    `  rdfs:isDefinedBy <https://mooon.site/ontology/> ;`,
    `  rdfs:label ${lit(t.en)}@en , ${lit(t.ar)}@ar ;`,
    ...(t.sub ? [`  rdfs:subClassOf ${t.sub} ;`] : []),
    ...(t.domain ? [`  rdfs:domain ${t.domain} ;`] : []),
    ...(t.range ? [`  rdfs:range ${t.range} ;`] : []),
    ...(t.published ? [] : ['  skos:editorialNote "Used in Moon\'s editor; not yet in Moon\'s published data."@en ;']),
    `  skos:definition ${lit(t.def)}@en .`,
    '',
  ].join('\n')),
].join('\n');

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Moon's extension of BIBFRAME · امتداد مون</title>
<meta name="description" content="The few terms Moon uses beside BIBFRAME 3.0.1 and BFLC, among them the events Arabic manuscripts record (ijāzah, samāʿ, reading, copying, ownership, waqf), with their Arabic labels; as Turtle, CC0.">
<link rel="alternate" type="text/turtle" href="index.ttl">
<style>:root{--bg:#f8fafc;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--card:#fff}@media (prefers-color-scheme:dark){:root{--bg:#0b1020;--ink:#e5e7eb;--muted:#94a3b8;--line:#1f2937;--card:#111827}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,"Segoe UI",Tahoma,sans-serif}main{max-width:52rem;margin:0 auto;padding:2rem 1rem 4rem}
.t{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.8rem 1rem;margin:.6rem 0}.t:target{outline:2px solid var(--ink)}code{font-size:.9rem}.m{color:var(--muted);font-size:.9rem}.ar{direction:rtl}a{color:inherit}</style></head>
<body><main>
<h1>Moon's extension of BIBFRAME</h1><p class="m ar">امتداد مون لـ BIBFRAME</p>
<p>The few terms Moon uses beside <a href="https://id.loc.gov/ontologies/bibframe.html">BIBFRAME 3.0.1</a> and BFLC, at <code>${NS}</code>. As data: <a href="index.ttl">Turtle (OWL and SKOS, CC0)</a>. See also Moon's SKOS vocabularies, <a href="/resource/vocab/maqam">maqām</a> and <a href="/resource/vocab/item-action">copy actions</a>; <a href="/bibframe-ar.html">BIBFRAME in Arabic</a>; <a href="/resource/genres-ar.ttl">Arabic genre and form terms</a>; <a href="/open-data.html">open metadata</a>; <a href="/opac.html">the catalogue</a>.</p>
<p class="m">Hijri dates are kept as written, beside their EDTF form (<code>http://id.loc.gov/datatypes/edtf</code>).</p>
${TERMS.map((t) => `<div class="t" id="${t.name}"><b><code>moonext:${t.name}</code></b> · ${esc(t.en)} · <span class="ar">${esc(t.ar)}</span><div class="m">${t.kind.replace('Object', 'object ').replace('Datatype', 'datatype ').toLowerCase()}${t.sub ? ` · a kind of <code>${t.sub}</code>` : ''}${t.domain ? ` · on <code>${t.domain}</code>` : ''}${t.range ? ` · to <code>${t.range}</code>` : ''}${t.published ? '' : ' · in the editor, not yet published'}</div><p>${esc(t.def)}</p></div>`).join('\n')}
</main></body></html>
`;

mkdirSync('public/ontology', { recursive: true });
writeFileSync('public/ontology/index.ttl', ttl);
writeFileSync('public/ontology/index.html', html);
// Each term's own address answers, sending a person to its place on the page (and linking the data).
// Names that differ only in case (AccessibilityContent, accessibilityContent) cannot both be folders on Windows;
// those addresses are answered by public/404.html, which sends them to the same place.
const lower = new Map<string, number>();
for (const t of TERMS) lower.set(t.name.toLowerCase(), (lower.get(t.name.toLowerCase()) || 0) + 1);
for (const t of TERMS) {
  const dir = `public/ontology/${t.name}`;
  if ((lower.get(t.name.toLowerCase()) || 0) > 1) { if (existsSync(dir)) rmSync(dir, { recursive: true }); continue; }
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.html`, `<!doctype html><meta charset="utf-8"><title>moonext:${t.name}</title><link rel="alternate" type="text/turtle" href="../index.ttl"><meta http-equiv="refresh" content="0; url=../#${t.name}"><a href="../#${t.name}">moonext:${t.name}</a>\n`);
}
console.log(`${TERMS.length} terms`);
