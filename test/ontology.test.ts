// Moon's extension of BIBFRAME (public/ontology/index.ttl, built by scripts/build-ontology.mts, plan step F1):
// it parses, and it defines every moonext: term the published data uses and every kind of transmission event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Parser } from 'n3';
import { EVENT_KINDS } from '../src/services/transmission';

const ttl = readFileSync('public/ontology/index.ttl', 'utf8');
const quads = new Parser().parse(ttl);
const NS = 'https://mooon.site/ontology/';
const defined = new Set(quads.filter((q) => q.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy').map((q) => q.subject.value));

test('every moonext: term the published output writes is defined, with a label in English and Arabic', () => {
  // moonext:marcField is named there only to be taken out: the kept MARC is never published.
  const used = [...new Set(readFileSync('supabase/functions/server/publishedOutput.tsx', 'utf8').match(/moonext:[A-Za-z]+/g) || [])].filter((t) => t !== 'moonext:marcField');
  assert.ok(used.length >= 6);
  for (const t of used) assert.ok(defined.has(NS + t.slice(8)), `${t} is defined`);
  const labels = quads.filter((q) => q.subject.value === NS + 'Expression' && q.predicate.value.endsWith('#label')).map((q) => (q.object as any).language);
  assert.deepEqual(labels.sort(), ['ar', 'en']);
});

test('transmission events are bf:Event, each kind a TransmissionEvent', () => {
  const sub = (s: string) => quads.find((q) => q.subject.value === NS + s && q.predicate.value.endsWith('#subClassOf'))?.object.value;
  assert.equal(sub('TransmissionEvent'), 'http://id.loc.gov/ontologies/bibframe/Event');
  for (const k of Object.keys(EVENT_KINDS)) assert.equal(sub(k[0].toUpperCase() + k.slice(1)), NS + 'TransmissionEvent', k);
});
