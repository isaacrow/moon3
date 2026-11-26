// FOLIO to Moon (folioLdImport.ts, plan step H11): FOLIO Data Export's linked-data file read into Moon editor records,
// against FOLIO's own export samples (test/fixtures/folio-ld, from lib-linked-data-rdf4ld v1.0.0, Apache-2.0), and
// one record round the whole way: FOLIO → Moon → Moon's file for FOLIO (folioInstanceLines) → Moon, nothing lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import jsonld from 'jsonld';
import { splitFolioLdExport, isFolioLdExport, importFolioLdExport, importFolioLdLine, isFolioResource } from '../src/services/folioLdImport';
import { buildW3CJsonLd } from '../src/services/w3cJsonLdBuilder';
import { folioInstanceLines, toJsonLines } from '../supabase/functions/server/folioLd.tsx';

const DIR = new URL('./fixtures/folio-ld/', import.meta.url);
const BASE = 'https://folio-test.example.org/linked-data-editor/resources/';

// As FOLIO's tests do: placeholders become the resources' numeric ids; as mod-data-export does: FOLIO's base address
// (ResourceUrlProvider) and one line per Instance, not pretty-printed.
let next = 1000;
const ids = new Map<string, string>();
const numberFor = (p: string) => { if (!ids.has(p)) ids.set(p, String(next++)); return ids.get(p)!; };
function asExported(name: string): any[] {
  const text = readFileSync(new URL(`${name}.json`, DIR), 'utf8')
    .replace(/http:\/\/test-tobe-changed\.folio\.com\/resources\/([A-Z0-9_]+)/g, (_m, p) => BASE + numberFor(`${name}:${p}`))
    .replace(/"_:([A-Z0-9_]+)"/g, (_m, p) => `"_:${p}_${numberFor(`${name}:_${p}`)}"`);
  return JSON.parse(text);
}
const NAMES = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
const exportFile = toJsonLines(NAMES.map(asExported));
const records = importFolioLdExport(exportFile);
const recordOf = async (name: string) => (await records)[NAMES.indexOf(name)];

/** Every @id anywhere in a value. */
const allIds = (v: any): string[] => (Array.isArray(v) ? v.flatMap(allIds) : v && typeof v === 'object'
  ? Object.entries(v).flatMap(([k, x]) => (k === '@id' ? [x as string] : allIds(x))) : []);
const list = (v: any) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

test('the export file is recognised: one record per line; other JSON-LD is not taken for it', () => {
  assert.equal(exportFile.trim().split('\n').length, NAMES.length);
  assert.equal(splitFolioLdExport(exportFile).length, NAMES.length);
  // One line saved pretty-printed is still FOLIO's.
  assert.equal(splitFolioLdExport(JSON.stringify(asExported('instance_titles'), null, 2)).length, 1);
  const lc = [{ '@id': 'http://id.loc.gov/resources/instances/1', '@type': ['http://id.loc.gov/ontologies/bibframe/Instance'] }];
  assert.equal(isFolioLdExport(JSON.stringify(lc)), false, 'an id.loc.gov record is not a FOLIO export');
  assert.equal(isFolioLdExport('{"work":{},"instance":{}}'), false);
  assert.equal(isFolioLdExport('not json'), false);
});

test('titles: the Instance keeps its title, parallel and variant titles, statements and dimensions', async () => {
  const r = await recordOf('instance_titles');
  assert.equal(r.title, 'Title mainTitle 1');
  const titles = list(r.instance['bf:title']);
  assert.deepEqual(titles.map((t) => list(t['@type'])[0]).sort(), ['bf:ParallelTitle', 'bf:Title', 'bf:VariantTitle']);
  const main = titles.find((t) => t['@type'] === 'bf:Title');
  assert.deepEqual(main['bf:mainTitle'], ['Title mainTitle 1', 'Title mainTitle 2']);
  assert.deepEqual(main['bflc:nonSortNum'], ['Title nonSortNum 1', 'Title nonSortNum 2']);
  assert.deepEqual(list(titles.find((t) => t['@type'] === 'bf:ParallelTitle')['bf:note']).map((n) => n['rdfs:label']), ['ParallelTitle note 1', 'ParallelTitle note 2']);
  assert.deepEqual(r.instance['bf:responsibilityStatement'], ['Instance responsibilityStatement 1', 'Instance responsibilityStatement 2']);
  assert.ok(r.folioInstance && isFolioResource(r.folioInstance));
  assert.ok(!allIds(r.instance).some(isFolioResource), 'no FOLIO address is left inside the record; Moon gives its own');
  assert.deepEqual(r.work['bf:adminMetadata']['bf:derivedFrom'], { '@id': r.folioInstance }, 'the source is recorded');
});

test('publication, distribution, manufacture and production; identifiers with their status', async () => {
  const p = await recordOf('instance_provisions');
  const kinds = list(p.instance['bf:provisionActivity']).map((a) => list(a['@type']).find((t: string) => t !== 'bf:ProvisionActivity')).sort();
  assert.deepEqual(kinds, ['bf:Distribution', 'bf:Manufacture', 'bf:Production', 'bf:Publication']);
  const pub = list(p.instance['bf:provisionActivity']).find((a) => list(a['@type']).includes('bf:Publication'));
  assert.deepEqual(list(pub['bf:place']).map((x) => x['@id']).sort(), ['http://id.loc.gov/vocabulary/countries/kz', 'http://id.loc.gov/vocabulary/countries/ru']);
  assert.ok(list(pub['bflc:simpleAgent']).includes('publication simple agent 1'));

  const i = await recordOf('instance_identifiers');
  const byType = Object.fromEntries(list(i.instance['bf:identifiedBy']).map((x) => [x['@type'], x]));
  assert.equal(byType['bf:Isbn']['rdf:value'], '0850598370');
  assert.deepEqual(byType['bf:Isbn']['bf:status'], { '@id': 'http://id.loc.gov/vocabulary/mstatus/cancinv' });
  assert.equal(byType['bf:Lccn']['rdf:value'].trim(), '2010470075');
  assert.equal(byType['bf:Ean']['rdf:value'], '780696204364');
});

test('FOLIO\'s HRID and Inventory UUID are read from its admin metadata', async () => {
  const r = await recordOf('instance_admin_metadata');
  assert.equal(r.hrid, 'in00123');
  assert.equal(r.inventoryId, 'FOLIO_UUID');
  assert.equal(list(r.instance['bf:adminMetadata'])[0]['bf:creationDate'], '2025-11-19');
});

test('the Work: its type, contributions with LC names and roles, subjects and genres', async () => {
  const a = await recordOf('work_agent_lccn');
  assert.deepEqual(list(a.work['@type']).sort(), ['bf:Monograph', 'bf:Work']);
  assert.ok(a.folioWork && isFolioResource(a.folioWork));
  assert.deepEqual(a.work['bf:adminMetadata']['bf:derivedFrom'], { '@id': a.folioWork }, 'derived from FOLIO\'s Work');
  const primary = list(a.work['bf:contribution']).find((c) => list(c['@type']).includes('bf:PrimaryContribution'));
  assert.deepEqual(primary['bf:agent'], { '@id': 'http://id.loc.gov/rwo/agents/n2021004098' });
  assert.deepEqual(list(primary['bf:role']).map((x) => x['@id']).sort(), ['http://id.loc.gov/vocabulary/relators/aut', 'http://id.loc.gov/vocabulary/relators/pbd']);
  assert.ok(!('bf:instanceOf' in a.instance) && !('bf:hasInstance' in a.work), 'links between FOLIO\'s resources are left for Moon to rebuild');

  const n = await recordOf('work_agent_no_lccn');
  const agents = list(n.work['bf:contribution']).map((c) => c['bf:agent']);
  assert.deepEqual(agents.map((x) => x['rdfs:label']).sort(), ['Contributor Agent', 'Creator Agent']);

  const s = await recordOf('work_subjects_simple_no_lccn');
  assert.ok(list(s.work['bf:subject']).length >= 4);
  const g = await recordOf('work_genre_no_lccn');
  assert.equal(list(g.work['bf:genreForm'])[0]['rdfs:label'], 'Fiction');
});

test('both ways: FOLIO → Moon → Moon\'s file for FOLIO → Moon keeps titles, contributions and types', async () => {
  const uris = { work: 'https://mooon.site/resource/work/f1', instance: 'https://mooon.site/resource/instance/f1', item: 'https://mooon.site/resource/item/f1-1', expression: 'https://mooon.site/resource/expression/f1-1', admin: 'https://mooon.site/resource/admin/f1' };
  for (const name of ['work_titles', 'work_agent_lccn']) {
    const first = await recordOf(name);
    const moon = buildW3CJsonLd({ workData: first.work, instanceData: first.instance, uriSet: uris });
    const flat: any = await jsonld.flatten(moon as any);
    const lines = folioInstanceLines(Array.isArray(flat) ? flat : flat['@graph']);
    assert.equal(lines.length, 1, `${name}: one line for FOLIO`);
    assert.ok(lines[0].some((n: any) => n['@id'] === uris.work), `${name}: the Work goes with its Instance`);
    const back = await importFolioLdLine(lines[0]);
    const titles = (e: any) => list(e?.['bf:title']).flatMap((t) => list(t['bf:mainTitle'])).sort();
    const agentsFirst = list(first.work['bf:contribution']).length;
    assert.ok(name === 'work_titles' ? titles(first.work).length >= 3 && titles(first.instance).length >= 3 : agentsFirst === 2, `${name}: the sample has something to compare`);
    assert.deepEqual(titles(back.instance), titles(first.instance), `${name}: Instance titles`);
    assert.deepEqual(titles(back.work), titles(first.work), `${name}: Work titles`);
    const agents = (e: any) => list(e?.['bf:contribution']).map((c) => c['bf:agent']?.['@id']).sort();
    assert.deepEqual(agents(back.work), agents(first.work), `${name}: contributions`);
    assert.ok(list(back.work['@type']).some((t: string) => t === 'bf:Monograph' || t === 'bf:Serial'), `${name}: the Work's kind`);
  }
});
