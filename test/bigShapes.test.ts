// BIG's monograph shapes (bigShapes.tsx) read from their DCTAP files, and checked on N-Triples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDctap, checkBig } from '../supabase/functions/server/bigShapes.tsx';

const BF = 'http://id.loc.gov/ontologies/bibframe/';
const T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const tr = (s: string, p: string, o: string) => `${s} <${p}> ${o} .`;

test("BIG's files are read: shapes, targets, severities, value kinds and value shapes", () => {
  const { shapes } = parseDctap();
  const work = shapes.get('big:Monograph:Work')!;
  assert.deepEqual(work.targets, [BF + 'Text', BF + 'Monograph']);
  const lang = work.rules.find((r) => r.property === BF + 'language')!;
  assert.equal(lang.severity, 'Violation');
  assert.deepEqual(lang.kinds, ['iri']);
  assert.equal(work.rules.find((r) => r.property === BF + 'title')!.valueShape, 'big:Title');
  assert.equal(shapes.get('big:Title')!.rules[0].repeatable, false);
  assert.ok(shapes.get('big:Monograph:Instance:Print') && shapes.get('big:Monograph:Instance:Electronic') && shapes.get('big:AdminMetadata'));
});

test('a complete print monograph has no violations; gaps are reported with their severity', () => {
  const w = '<https://mooon.site/resource/work/x>', i = '<https://mooon.site/resource/instance/x>', a = '<https://mooon.site/resource/admin/x>';
  const good = [
    tr(w, T, `<${BF}Text>`), tr(w, T, `<${BF}Monograph>`), tr(w, BF + 'title', '_:t1'), tr('_:t1', T, `<${BF}Title>`), tr('_:t1', BF + 'mainTitle', '"Book"'),
    tr(w, BF + 'language', '<http://id.loc.gov/vocabulary/languages/ara>'), tr(w, BF + 'content', '<http://id.loc.gov/vocabulary/contentTypes/txt>'), tr(w, BF + 'adminMetadata', a),
    tr(i, T, `<${BF}Print>`), tr(i, BF + 'instanceOf', w), tr(i, BF + 'title', '_:t2'), tr('_:t2', BF + 'mainTitle', '"Book"'), tr(i, BF + 'provisionActivity', '_:p'),
    tr('_:p', T, `<${BF}Publication>`), tr(i, BF + 'issuance', '<http://id.loc.gov/vocabulary/issuance/mono>'), tr(i, BF + 'media', '<http://id.loc.gov/vocabulary/mediaTypes/n>'),
    tr(i, BF + 'carrier', '<http://id.loc.gov/vocabulary/carriers/nc>'), tr(i, BF + 'adminMetadata', a),
    tr(a, T, `<${BF}AdminMetadata>`), tr(a, BF + 'creationDate', '"2026-11-26"'), tr(a, BF + 'assigner', '_:org'),
  ];
  const r = checkBig(good.join('\n'));
  for (const s of r.shapes.filter((x) => x.checked)) assert.equal(s.conforming, s.checked, s.label);
  assert.ok(r.results.every((x) => x.severity === 'Warning'), 'only recommendations left');

  const bad = good.filter((l) => !l.includes('language') && !l.includes('creationDate')).concat(tr('_:t1', BF + 'mainTitle', '"Second"'), tr(w, BF + 'content', '"text"'));
  const r2 = checkBig(bad.join('\n'));
  const find = (label: string, problem: string) => r2.results.find((x) => x.label === label && x.problem === problem);
  assert.equal(find('Language', 'missing')?.severity, 'Violation');
  assert.equal(find('Date Cataloged or Updated/Changed', 'missing')?.nodes, 1);
  assert.equal(find('Main Title', 'repeated')?.severity, 'Violation');
  assert.equal(find('Content Type', 'wrong kind')?.severity, 'Violation');
  assert.equal(r2.shapes.find((x) => x.shape === 'big:Monograph:Work')!.conforming, 0);
});

test('LC link coverage: Works linked to an LC Hub (expressionOf) or an LC Work (owl:sameAs)', async () => {
  const { lcLinkCoverage } = await import('../supabase/functions/server/bigShapes.tsx');
  const W = (id: string) => `<https://mooon.site/resource/work/${id}>`;
  const nt = [
    tr(W('a'), T, `<${BF}Work>`), tr(W('a'), BF + 'expressionOf', '<http://id.loc.gov/resources/hubs/h1>'),
    tr(W('b'), T, `<${BF}Work>`), tr(W('b'), 'http://www.w3.org/2002/07/owl#sameAs', '<http://id.loc.gov/resources/works/123>'),
    tr(W('c'), T, `<${BF}Work>`), tr(W('c'), BF + 'expressionOf', '<https://mooon.site/resource/hub/x>'),
    tr('<http://id.loc.gov/resources/works/123>', T, `<${BF}Work>`),
  ].join('\n');
  assert.deepEqual(lcLinkCoverage(nt), { works: 3, linked: 2, hubs: 1, lcWorks: 1 });
});
