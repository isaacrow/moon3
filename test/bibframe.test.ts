import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Parser as N3Parser } from 'n3';
import { toTurtle, toRdfXml } from '../src/services/rdfGraphBuilder';
import { buildW3CJsonLd, jsonLdToNTriples } from '../src/services/w3cJsonLdBuilder';
import { normalizeBibframe, normalizeBibframeWithReport, findUnofficialTerms, isOfficialTerm, toBibframeJsonLdString } from '../src/services/bibframeNormalizer';
import { mintUriSet, BASE_URI } from '../src/services/uriMintingService';
import { realLocExamples } from '../src/app/utils/realLocExamples';
import { exampleWork, exampleInstance } from '../src/app/utils/exampleData';

const BF = 'http://id.loc.gov/ontologies/bibframe/';
const BFLC = 'http://id.loc.gov/ontologies/bflc/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

function parseTurtle(ttl: string): any[] {
  return new N3Parser().parse(ttl);
}

/** bf:/bflc: terms actually present in serialized triples (predicates and rdf:type objects). */
function unofficialInTriples(quads: any[]): string[] {
  const bad = new Set<string>();
  const check = (iri: string) => {
    for (const [prefix, ns] of [['bf', BF], ['bflc', BFLC]]) {
      if (iri.startsWith(ns) && !isOfficialTerm(`${prefix}:${iri.slice(ns.length)}`)) bad.add(`${prefix}:${iri.slice(ns.length)}`);
    }
  };
  for (const q of quads) {
    check(q.predicate.value);
    if (q.predicate.value === RDF_TYPE) check(q.object.value);
  }
  return [...bad].sort();
}

const qabasat = JSON.parse(readFileSync(new URL('../public/records/al-qabasat.json', import.meta.url), 'utf8'));
const graphOf = (doc: any) => normalizeBibframe(doc)['@graph'];
const byType = (graph: any[], t: string) => graph.find(n => all(n['@type']).includes(t));
const all = (v: any): any[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const first = (v: any) => all(v)[0];
const text = (v: any) => { const x = first(v); return typeof x === 'object' ? x['@value'] : x; };

test('Ontology term list is generated from BIBFRAME 3.0.1 and BFLC', () => {
  for (const t of ['bf:Work', 'bf:Instance', 'bf:Item', 'bf:contribution', 'bf:mainTitle', 'bf:PrimaryContribution', 'bflc:nonSortNum']) {
    assert.ok(isOfficialTerm(t), `${t} should be official`);
  }
  for (const t of ['bf:creator', 'bf:Expression', 'bf:isbn', 'bf:publisher', 'bf:hasTitle']) {
    assert.ok(!isOfficialTerm(t), `${t} is not in the ontology`);
  }
});

test('Every bundled example serializes to Turtle with only official BIBFRAME terms', () => {
  const docs: [string, any][] = [
    ['al-qabasat.json', qabasat],
    ['exampleData', { work: exampleWork, instance: exampleInstance }],
    ...realLocExamples.map((e: any) => [e.id, e.data] as [string, any])
  ];
  for (const [name, doc] of docs) {
    const quads = parseTurtle(toTurtle(doc));
    assert.ok(quads.length > 5, `${name}: expected triples`);
    assert.deepEqual(unofficialInTriples(quads), [], `${name}: Turtle uses terms not in BIBFRAME 3.0.1`);
    assert.deepEqual(findUnofficialTerms(normalizeBibframe(doc)), [], `${name}: JSON-LD uses unofficial terms`);
  }
});

test('RDF/XML and N-Triples contain no invented terms', () => {
  const xml = toRdfXml(qabasat);
  for (const bad of ['bf:creator', 'bf:creatorUri', 'bf:contentType', 'bf:Expression']) {
    assert.ok(!xml.includes(`<${bad}`), `RDF/XML still has ${bad}`);
  }
  const nt = jsonLdToNTriples(normalizeBibframe(qabasat) as any);
  assert.ok(!nt.includes(`${BF}creator>`));
});

test('al-qabasat: plain-text duplicates are removed, structured values kept', () => {
  const graph = graphOf(qabasat);
  const work = byType(graph, 'bf:Work');
  // The author appears once (the creator/creatorUri/contribution text copies are gone);
  // the copyist from additionalContributors is a separate, real contribution.
  const author = 'http://id.loc.gov/authorities/names/n85043844';
  const agents = all(work['bf:contribution']).map((c: any) => first(c['bf:agent']));
  assert.equal(agents.filter((a: any) => a['@id'] === author).length, 1);
  assert.equal(all(work['bf:contribution']).length, 2);
  assert.ok(agents.every((a: any) => !String(a['rdfs:label']).includes('مؤلف')), 'no "(مؤلف)" text copy of the author');
  assert.equal(all(work['bf:language']).length, 1, 'language "ara" and its URI are the same fact');
  // The LCC number appeared three times (literal, classificationLcc, structured): kept once. The DDC number is separate.
  const classes = all(work['bf:classification']).map((c: any) => c['@type']).sort();
  assert.deepEqual(classes, ['bf:ClassificationDdc', 'bf:ClassificationLcc']);
  assert.equal(work['bf:mainTitle'], undefined, 'mainTitle belongs inside bf:Title');
  const title = first(work['bf:title']);
  assert.equal(all(title['bf:mainTitle']).length, 1, 'duplicate mainTitle values collapsed');
});

test('al-qabasat: shelf mark moves to the Item', () => {
  const graph = graphOf(qabasat);
  for (const t of ['bf:Work', 'bf:Instance']) assert.equal(byType(graph, t)?.['bf:shelfMark'], undefined, `${t} has no shelf mark`);
  const item = byType(graph, 'bf:Item');
  assert.ok(all(item?.['bf:shelfMark']).length, 'Item holds the shelf mark');
});

test('Invented terms are rewritten to their BIBFRAME equivalents', () => {
  const { doc, changes } = normalizeBibframeWithReport({
    '@graph': [{
      '@id': 'https://example.org/i/1',
      '@type': 'bf:Instance',
      isbn: '9780062316097',
      publisher: 'Harper',
      placeOfPublication: 'New York',
      publicationDate: '2015',
      statementOfResponsibility: 'Yuval Noah Harari',
      contentType: 'txt',
      'bf:governmentPublication': 'f'
    }]
  });
  const inst = doc['@graph'][0];
  assert.deepEqual(first(inst['bf:identifiedBy'])['@type'], 'bf:Isbn');
  assert.equal(text(first(inst['bf:identifiedBy'])['rdf:value']), '9780062316097');
  const pub = first(inst['bf:provisionActivity']);
  assert.equal(pub['@type'], 'bf:Publication');
  assert.equal(first(pub['bf:agent'])['rdfs:label'], 'Harper');
  assert.equal(first(pub['bf:place'])['rdfs:label'], 'New York');
  assert.equal(text(inst['bf:responsibilityStatement']), 'Yuval Noah Harari');
  assert.equal(first(inst['bf:content'])['@id'], 'http://id.loc.gov/vocabulary/contentTypes/txt');
  assert.ok(inst['bflc:governmentPubType']);
  assert.ok(changes.some(c => c.startsWith('bf:isbn -> bf:identifiedBy')));
});

test('Unknown custom fields are kept under moonext:, not claimed as bf:', () => {
  const doc = normalizeBibframe({ '@type': 'bf:Work', 'bf:dissertationYear': '1999', 'bf:Object3D': 'x' });
  const work = doc['@graph'][0];
  assert.equal(text(work['moonext:dissertationYear']), '1999');
  assert.equal(work['bf:dissertationYear'], undefined);
  assert.deepEqual(findUnofficialTerms(doc), []);
  assert.ok(parseTurtle(toTurtle(doc)).some(q => q.predicate.value.endsWith('/ontology/dissertationYear')));
});

test('Expressions are bf:Work (BIBFRAME has no Expression class)', () => {
  const uriSet = mintUriSet('t1');
  const doc = buildW3CJsonLd({ workData: { title: 'W' }, instanceData: { title: 'I' }, uriSet, enableExpression: true });
  assert.deepEqual(findUnofficialTerms(doc), []);
  const expr = doc['@graph'].find((n: any) => n['@id'] === uriSet.expression)!;
  assert.equal(expr['@type'], 'bf:Work');
  assert.ok(expr['bf:expressionOf']);
});

test('Minted URIs never use the id.loc.gov namespace', () => {
  for (const uri of Object.values(mintUriSet('abc'))) {
    assert.ok(uri.startsWith(BASE_URI), uri);
    assert.ok(!uri.includes('id.loc.gov'), uri);
  }
  const graph = graphOf(qabasat);
  for (const n of graph) assert.ok(!String(n['@id']).startsWith('http://id.loc.gov/resources/'), `local record minted as LC: ${n['@id']}`);
});

test('Normalizing twice changes nothing, and JSON-LD downloads are normalized', () => {
  const once = normalizeBibframe(qabasat);
  assert.deepEqual(normalizeBibframe(once), once);
  const json = JSON.parse(toBibframeJsonLdString(qabasat));
  assert.ok(Array.isArray(json['@graph']));
  assert.deepEqual(findUnofficialTerms(json), []);
});
