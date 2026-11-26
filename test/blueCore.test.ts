// Copy cataloguing from Blue Core, against saved copies of real Blue Core and id.loc.gov responses
// (test/fixtures/bluecore), so the test needs no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchBlueCore, importFromBlueCore, lcLabels } from '../src/services/blueCore';
import { buildW3CJsonLd } from '../src/services/w3cJsonLdBuilder';
import { missingForPublish } from '../supabase/functions/server/publishGate.tsx';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/bluecore/${name}`, import.meta.url), 'utf8');
const WORK = 'https://dev.bcld.info/works/32cb9318-d522-4144-879e-5041d295a3d9';
const INSTANCE = 'https://dev.bcld.info/instances/c95fabaf-e221-423e-9c21-dd4112f7dcf8';

const requested: string[] = [];
const fakeFetch = (async (url: string) => {
  requested.push(String(url));
  const body = String(url).startsWith('https://dev.bcld.info/api/search/') ? fixture('search.json')
    : url === `https://dev.bcld.info/api/works/32cb9318-d522-4144-879e-5041d295a3d9` ? fixture('work.json')
    : url === `https://dev.bcld.info/api/instances/c95fabaf-e221-423e-9c21-dd4112f7dcf8` ? fixture('instance.json')
    : url === 'https://bibframe-json.org/v0.1/context/bibframe.jsonld' ? fixture('context.jsonld')
    : url === 'https://id.loc.gov/authorities/names/no2006101722.json' ? fixture('lc-name.json')
    : null;
  return body === null
    ? { ok: false, status: 404, json: async () => ({}) }
    : { ok: true, status: 200, json: async () => JSON.parse(body) };
}) as unknown as typeof fetch;

test('search lists Blue Core works with their romanized and Arabic titles', async () => {
  const { total, hits } = await searchBlueCore('qabasat', { type: 'works', fetchImpl: fakeFetch });
  assert.ok(total >= hits.length && hits.length > 0);
  const hit = hits.find((h) => h.uri === WORK)!;
  assert.match(hit.title, /^Qabasāt min ḥayāt/);
  assert.match(hit.titleArabic!, /^قبسات/);
  assert.ok(requested.some((u) => u.includes('q=qabasat') && u.includes('type=works')));
});

test('a Blue Core work comes in with its instance, as a Moon record', async () => {
  const rec = await importFromBlueCore({ type: 'works', uri: WORK }, fakeFetch);
  assert.ok(requested.includes('https://dev.bcld.info/api/instances/c95fabaf-e221-423e-9c21-dd4112f7dcf8'), 'the linked instance is fetched');
  const mains = JSON.stringify(rec.work['bf:title']);
  assert.ok(mains.includes('Qabasāt min') && mains.includes('قبسات من حياة'), 'both scripts of the title');
  assert.equal(rec.work['@id'], undefined, 'Moon mints its own URIs');
  assert.equal(rec.work['bf:adminMetadata']['bf:derivedFrom']['@id'], WORK, 'and records where the copy came from');
  // A name that arrived as a bare LC link now has LC's labels.
  const agent = JSON.stringify(rec.work['bf:contribution']);
  assert.ok(agent.includes('Jāʼizat Dubayy al-Dawlīyah') && agent.includes('جائزة دبي'), agent.slice(0, 300));
  // It is a complete record: the publish gate finds nothing missing.
  const uris = { work: 'https://mooon.site/resource/work/b1', instance: 'https://mooon.site/resource/instance/b1', item: 'https://mooon.site/resource/item/b1-1', expression: 'https://mooon.site/resource/expression/b1-1', admin: 'https://mooon.site/resource/admin/b1' };
  const doc = buildW3CJsonLd({ workData: rec.work, instanceData: rec.instance, uriSet: uris });
  assert.deepEqual(missingForPublish(doc).map((m) => m.field), []);
  const admin = doc['@graph'].find((n: any) => n['@type'] === 'bf:AdminMetadata');
  assert.deepEqual(admin['bf:derivedFrom'], [{ '@id': WORK }], 'the source stays in the exported AdminMetadata');
});

test('starting from an instance fetches its work', async () => {
  requested.length = 0;
  const rec = await importFromBlueCore({ type: 'instances', uri: INSTANCE }, fakeFetch);
  assert.ok(requested.includes('https://dev.bcld.info/api/works/32cb9318-d522-4144-879e-5041d295a3d9'));
  assert.ok(rec.work['bf:title'] && rec.instance['bf:title']);
});

test('LC labels: a link that is not an LC authority gives nothing, and a failure does not throw', async () => {
  assert.deepEqual(await lcLabels('https://example.org/x', fakeFetch), []);
  assert.deepEqual(await lcLabels('http://id.loc.gov/authorities/names/n00000000', fakeFetch), []);
});

test('one record both ways: Blue Core → Moon → Blue Core\'s shape → Moon, nothing lost', async () => {
  const { importBlueCoreResources } = await import('../src/services/blueCore');
  const { toBlueCore, BLUE_CORE_CONTEXT } = await import('../supabase/functions/server/blueCoreExport.tsx');
  const context = JSON.parse(fixture('context.jsonld'))['@context'];
  const uris = { work: 'https://mooon.site/resource/work/b1', instance: 'https://mooon.site/resource/instance/b1', item: 'https://mooon.site/resource/item/b1-1', expression: 'https://mooon.site/resource/expression/b1-1', admin: 'https://mooon.site/resource/admin/b1' };
  const first = await importBlueCoreResources(context, [JSON.parse(fixture('work.json')), JSON.parse(fixture('instance.json'))]);
  const moon = buildW3CJsonLd({ workData: first.work, instanceData: first.instance, uriSet: uris });

  const out = toBlueCore(moon);
  assert.deepEqual(out.map((r) => r.type).sort(), ['instances', 'works']);
  const w = out.find((r) => r.type === 'works')!, i = out.find((r) => r.type === 'instances')!;
  assert.equal(w.data['@context'], BLUE_CORE_CONTEXT);
  assert.ok(Array.isArray(w.data.title) && !('bf:title' in w.data), 'terms without the bf: prefix, values in lists');
  assert.ok(w.data['@type'].includes('Work'));
  assert.deepEqual(i.data.instanceOf, [{ '@id': uris.work }], 'the Instance names its Work by address');
  assert.ok(!JSON.stringify(out).includes('"_:'), 'blank nodes written in place');

  const back = await importBlueCoreResources(context, out.map((r) => r.data));
  const again = buildW3CJsonLd({ workData: back.work, instanceData: back.instance, uriSet: uris });
  // What a cataloguer would check, compared both ways.
  const facts = (doc: any) => {
    const all = JSON.stringify(doc);
    const texts = (re: RegExp) => [...new Set((all.match(re) || []))].sort();
    return {
      titles: texts(/Qabasāt min ḥayāt[^"]*|قبسات من حياة[^"]*/g),
      lccn: texts(/"[0-9]{10}"/g),
      links: texts(/http:\/\/id\.loc\.gov\/(?:authorities|rwo|vocabulary)\/[^"]+/g),
      dates: texts(/"(?:19|20)\d\d"/g),
    };
  };
  assert.deepEqual(facts(again), facts(moon));
  assert.ok(facts(moon).titles.length >= 2 && facts(moon).links.length >= 3, 'the comparison has something in it');
});

test('Blue Core export: a type said twice (bf:Work and Work) is written once', async () => {
  const { toBlueCore } = await import('../supabase/functions/server/blueCoreExport.tsx');
  const [w] = toBlueCore({ '@graph': [{ '@id': 'https://mooon.site/resource/work/x', '@type': ['bf:Work', 'Work', 'bf:Text'] }] });
  assert.deepEqual(w.data['@type'], ['Work', 'Text']);
});
