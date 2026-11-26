// Phase 13 S20: Moon's MCP server. Read tools are open; the only write makes a draft under a signed-in person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp, type McpDeps } from '../supabase/functions/server/mcp.tsx';

const doc = { '@graph': [{ '@id': 'w', '@type': 'bf:Work' }, { '@id': 'i', '@type': 'bf:Instance' }] };
const drafts: any[] = [];
const deps = (user: string | null = null): McpDeps => ({
  search: async (q, limit) => [{ id: 'r1', title: `About ${q}`, uri: 'https://mooon.site/resource/instance/r1' }].slice(0, limit),
  record: async (id) => (id === 'r1' ? { id, title: 'One', document: doc } : null),
  sparql: async (q) => `{"head":{"vars":["s"]},"q":${JSON.stringify(q)}}`,
  validate: () => ({ missing: [{ entity: 'Instance', field: 'extent', en: 'Extent' }] }),
  user,
  createDraft: async (input) => { drafts.push(input); return { id: 'mcp-1', version: 1 }; },
});
const call = (name: string, args: any, d = deps()) => handleMcp({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }, d, 'Claude');

test('initialize, list tools, notifications get no reply', async () => {
  const init = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x' } } }, deps());
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'moon');
  const old = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, deps());
  assert.equal(old.result.protocolVersion, '2025-11-25', 'an unknown version gets the latest');
  assert.equal(await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps()), null);
  const list = await handleMcp({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, deps());
  assert.deepEqual(list.result.tools.map((t: any) => t.name), ['search_records', 'get_record', 'sparql', 'validate_record', 'lookup_isbn', 'find_entities', 'create_draft']);
  assert.ok(list.result.tools.filter((t: any) => t.name !== 'create_draft').every((t: any) => t.annotations.readOnlyHint));
  assert.equal((await handleMcp({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, deps())).error.code, -32601);
  assert.equal((await handleMcp({ id: 5, method: 'x' }, deps())).error.code, -32600);
});

test('read tools', async () => {
  assert.equal((await call('search_records', { query: 'ابن خلدون', limit: 3 })).result.structuredContent.records[0].id, 'r1');
  assert.ok((await call('get_record', { id: 'r1' })).result.content[0].text.includes('bf:Work'));
  assert.equal((await call('get_record', { id: 'nope' })).result.isError, true);
  assert.equal((await call('get_record', { id: '../etc' })).result.isError, true);
  assert.ok((await call('sparql', { query: 'SELECT ?s WHERE { ?s ?p "DELETE me" }' })).result.content[0].text.includes('head'), 'a word in a string is not an update');
  assert.equal((await call('sparql', { query: 'DELETE WHERE { ?s ?p ?o }' })).result.isError, true);
  const v = (await call('validate_record', { document: doc })).result;
  assert.equal(v.structuredContent.ready, false);
  assert.match(v.content[0].text, /Instance: Extent/);
  assert.equal((await call('validate_record', { document: { '@graph': [] } })).result.isError, true);
  assert.equal((await call('no_such_tool', {})).error.code, -32602);
});

test('create_draft: only under a signed-in person, always a draft, with a note', async () => {
  assert.equal((await call('create_draft', { title: 'x', document: doc, note: 'n' })).result.isError, true, 'no session, no draft');
  assert.equal(drafts.length, 0);
  assert.equal((await call('create_draft', { title: 'x', document: doc }, deps('ali'))).result.isError, true, 'a note is required');
  const r = (await call('create_draft', { title: 'المقدمة', document: doc, note: 'From LC record n123' }, deps('ali'))).result;
  assert.equal(r.structuredContent.status, 'pending-review');
  assert.match(r.content[0].text, /not published/);
  assert.deepEqual(drafts[0], { title: 'المقدمة', document: doc, agent: 'Claude', note: 'From LC record n123' });
});

// D4: lookup_isbn and find_entities. Open Library's data is a hand-made object in its documented books API shape
// (jscmd=data), since the test runs without the network.
const OL = {
  title: 'Pride and prejudice', authors: [{ name: 'Jane Austen' }], publishers: [{ name: 'Penguin Books' }],
  publish_places: [{ name: 'London' }], publish_date: '2003', number_of_pages: 480, subjects: [{ name: 'Courtship' }, { name: 'Sisters' }],
};

test('lookup_isbn: a book Moon has is not catalogued again; otherwise a draft from Open Library, nothing saved', async () => {
  const { cleanIsbn, openLibraryToBibframe } = await import('../supabase/functions/server/mcp.tsx');
  const { missingForPublish } = await import('../supabase/functions/server/publishGate.tsx');
  assert.equal(cleanIsbn('978-0-14-143951-8'), '9780141439518');
  assert.equal(cleanIsbn('12345'), null);

  const have: any = await call('lookup_isbn', { isbn: '9780141439518' });
  assert.ok(have.result.structuredContent.inMoon.length, 'search found it in Moon');

  const before = drafts.length;
  const asked: string[] = [];
  const d = { ...deps(), search: async () => [], lookupIsbn: async (isbn: string) => { asked.push(isbn); return OL; } };
  const r: any = await call('lookup_isbn', { isbn: '978-0-14-143951-8' }, d);
  assert.deepEqual(asked, ['9780141439518']);
  const doc = r.result.structuredContent.document;
  const json = JSON.stringify(doc);
  for (const s of ['Pride and prejudice', 'Jane Austen', 'Penguin Books', 'London', '2003', '480 pages', 'Courtship', '9780141439518']) assert.ok(json.includes(s), s);
  assert.deepEqual(missingForPublish(doc).map((m) => m.field), [], 'a complete record by Moon\'s publish gate');
  assert.equal(drafts.length, before, 'nothing saved');
  assert.deepEqual(openLibraryToBibframe({}, '1')['@graph'][0]['bf:title']['bf:mainTitle'], 'Untitled');

  const none: any = await call('lookup_isbn', { isbn: '0306406152' }, { ...d, lookupIsbn: async () => null });
  assert.equal(none.result.isError, true);
});

test('find_entities: Moon\'s own first, then LC; a kind is one of three', async () => {
  const got: any[] = [];
  const d = { ...deps(), findEntities: async (name: string, kind: any) => { got.push([name, kind]); return [
    { label: 'Ibn Khaldūn', uri: 'https://mooon.site/resource/agent/ibn-khaldun', source: 'moon' as const, kind },
    { label: 'Ibn Khaldūn, 1332-1406', uri: 'http://id.loc.gov/authorities/names/n50052785', source: 'lc' as const, kind },
  ]; } };
  const r: any = await call('find_entities', { name: 'ابن خلدون', kind: 'nonsense' }, d);
  assert.deepEqual(got, [['ابن خلدون', 'agent']]);
  assert.equal(r.result.structuredContent.entities[0].source, 'moon');
  assert.match(r.result.content[0].text, /n50052785\t\(LC\)/);
  const list: any = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, deps());
  const names = list.result.tools.map((t: any) => t.name);
  assert.ok(names.includes('lookup_isbn') && names.includes('find_entities'));
});
