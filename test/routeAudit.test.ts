// The server's routes, checked from its source: a route that changes data, or that fetches from outside,
// must check who is asking. Anything left open on purpose is listed here, with the reason, so a new
// open route cannot slip in unnoticed: adding one makes this test fail until it is either guarded
// or listed (and the list is reviewed in the pull request).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SERVER = readFileSync(new URL('../supabase/functions/server/index.tsx', import.meta.url), 'utf8').split(/\r?\n/);

// Same prefixes as the server's global gate (index.tsx, "Routes that spend paid API credit…").
const SESSION_ANY_METHOD = ['/ai/', '/ai-router/', '/isbndb/'];
const SESSION_WRITES = ['/favorites', '/moon/authorities/import', '/moon/triplestore/', '/moon/versions/', '/moon/discovery/import', '/ld4/', '/import-bibframe-rdf', '/authority/clear-cache'];
const CHECKS = /getSession\(|isAdminSession\(|commentAccess\(|coverAccess\(|reviewRecord\(|isJobCall|MOON_JOB_TOKEN|authMiddleware\.require|auth\.getUser\(/;

interface Route { method: string; path: string; line: number; body: string }

function routes(): Route[] {
  const starts: { i: number; method: string; path: string }[] = [];
  SERVER.forEach((l, i) => {
    const m = l.match(/^app\.(get|post|put|delete|patch|all)\(\s*["'`]([^"'`]+)/);
    if (m) starts.push({ i, method: m[1].toUpperCase(), path: m[2].replace('/make-server-49c0e13c', '') });
  });
  return starts.map((s, k) => ({ method: s.method, path: s.path, line: s.i + 1, body: SERVER.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : SERVER.length).join('\n') }));
}

const guarded = (r: Route) =>
  CHECKS.test(r.body) ||
  SESSION_ANY_METHOD.some((p) => r.path.startsWith(p)) ||
  (r.method !== 'GET' && SESSION_WRITES.some((p) => r.path.startsWith(p)));

/** Open on purpose. Each is public reading, computation on what the caller sends, or has its own limit. */
const OPEN_WRITES: Record<string, string> = {
  'POST /profiles/dctap/convert': 'turns a pasted DCTAP table into SHACL; nothing is stored (documented in api.html)',
  'POST /engine/process': 'computes on what is sent; nothing stored',
  'POST /sparql/query': 'read-only query on a copy of the data',
  'POST /sparql/discover': 'read-only',
  'POST /ontology/validate': 'checks what is sent',
  'POST /ontology/literalToUri': 'looks up a term',
  'POST /graph/build': 'computes on what is sent',
  'POST /graph/validate': 'checks what is sent',
  'POST /graph/to-turtle': 'converts what is sent',
  'POST /graph/stats': 'counts what is sent',
  'POST /ask': 'Ask Moon: public, with a daily cap, off until the key is set',
  'POST /resource/sparql': 'public SPARQL endpoint (read-only), in the open-data promise',
  'POST /resource/reconcile': 'public reconciliation API',
  'POST /resource/oai': 'public OAI-PMH',
  'POST /opac/visit': 'anonymous visit counter: no names, bots skipped, one count per visitor per day',
  'POST /opac/event': 'anonymous reader insights (device, language, country, source, searches): same daily hashed key as the visit counter, bots and staff skipped, a cap per visitor per day',
  'POST /moon/authorities/:id/duplicates': 'reads the authority file',
  'POST /moon/discover': 'searches outside sources for the discovery page',
  'POST /scriptshifter/trans': 'transliteration through the ScriptShifter service (fixed address)',
};

/** Open reads that go out to another site: a fixed address only, never one the caller supplies. */
const OPEN_FETCHES = new Set(['GET /scriptshifter/languages', 'GET /scriptshifter/options/:lang', 'POST /scriptshifter/trans']);

test('every route that changes data checks who is asking, unless listed as open on purpose', () => {
  const open = routes().filter((r) => r.method !== 'GET' && !guarded(r)).map((r) => `${r.method} ${r.path}`);
  const unlisted = open.filter((k) => !(k in OPEN_WRITES));
  assert.deepEqual(unlisted, [], `these routes change data and check nobody: ${unlisted.join(', ')}. Guard them, or list them in OPEN_WRITES with the reason.`);
});

test('the list of open routes has no entry that no longer exists or is now guarded', () => {
  const open = new Set(routes().filter((r) => !guarded(r)).map((r) => `${r.method} ${r.path}`));
  const stale = Object.keys(OPEN_WRITES).filter((k) => !open.has(k));
  assert.deepEqual(stale, [], `remove from OPEN_WRITES: ${stale.join(', ')}`);
});

test('no open route fetches from an address the caller supplies', () => {
  for (const r of routes()) {
    if (guarded(r) || !/\bfetch\(/.test(r.body)) continue;
    assert.ok(OPEN_FETCHES.has(`${r.method} ${r.path}`), `${r.method} ${r.path} (line ${r.line}) fetches from outside with no sign-in: guard it or list it in OPEN_FETCHES after checking the address is fixed`);
  }
});

test('the old routes that were closed stay closed', () => {
  const all = new Set(routes().map((r) => `${r.method} ${r.path}`));
  for (const gone of [
    'GET /load-bibframe', 'GET /viaf/search', 'GET /viaf/details/:viafId', 'GET /search-bibframe', 'GET /search-authority',
    'POST /parse-jsonld', 'POST /parse-rdfxml', 'GET /moon-engine/records', 'GET /moon-engine/records/:id',
    'POST /auth/refresh', 'POST /auth/inspect', 'GET /auth/oauth/:provider', 'GET /moon/users/:id', 'GET /moon/institutions',
    'GET /favorites', 'POST /favorites', 'GET /moon/versions/:entityType/:entityId',
  ]) assert.equal(all.has(gone), false, `${gone} was closed on purpose`);
});

test('the sign-in routes are the only way in: no route reads a Supabase user token', () => {
  const stillThere = routes().filter((r) => /auth\.getUser\(/.test(r.body)).map((r) => `${r.method} ${r.path}`);
  // These are the J-Cricket review routes; Moon people have no Supabase user token, so nobody can use them.
  // They are listed so they are looked at, not forgotten: moving them to Moon's own sessions is a later step.
  assert.ok(stillThere.every((k) => /\/jcricket\//.test(k)), `unexpected: ${stillThere.join(', ')}`);
});
