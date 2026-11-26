// The catalogue's cache (freshCache.tsx, plan step B3): fresh copies served, old ones served while a new one is
// read, a reader waits only when there is nothing yet (or it is over an hour old), and clear() drops it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshCache } from '../supabase/functions/server/freshCache.tsx';

test('stale while revalidate', async () => {
  let clock = 0, loads = 0;
  let release: (() => void) | null = null;
  const cache = freshCache(async () => { loads++; const n = loads; await new Promise<void>((r) => { release = r; }); return `v${n}`; }, 60_000, 3_600_000, () => clock);

  const first = cache.get();                       // nothing yet: the reader waits
  release!(); assert.equal(await first, 'v1');
  clock = 30_000; assert.equal(await cache.get(), 'v1'); assert.equal(loads, 1, 'fresh: no new read');

  clock = 90_000;
  assert.equal(await cache.get(), 'v1', 'old copy served at once');
  assert.equal(loads, 2, 'and a new one read in the background');
  assert.equal(await cache.get(), 'v1'); assert.equal(loads, 2, 'one read at a time');
  release!(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(await cache.get(), 'v2', 'the new copy, once read');

  cache.clear();
  const afterClear = cache.get();                  // cleared (a record was published): the next reader waits for it
  assert.equal(loads, 3);
  release!(); assert.equal(await afterClear, 'v3');

  clock = 90_000 + 4_000_000;                      // over an hour old: too old to serve
  const old = cache.get(); assert.equal(loads, 4);
  release!(); assert.equal(await old, 'v4');
});

test('a read finished after clear() does not bring back the old copy', async () => {
  let clock = 0, n = 0;
  let release: (() => void) | null = null;
  const cache = freshCache(async () => { n++; const v = n; await new Promise<void>((r) => { release = r; }); return v; }, 60_000, 3_600_000, () => clock);
  const p = cache.get(); release!(); await p;
  clock = 100_000; await cache.get();              // a background read starts (v2)
  const pending = release!;
  cache.clear();                                    // published meanwhile
  pending(); await new Promise((r) => setTimeout(r, 0));
  const next = cache.get(); release!();
  assert.equal(await next, 3, 'the read started before clear() is not kept');
});

test('published while a read is under way: the next reader gets a new read, not the older one', async () => {
  const releases: Array<() => void> = [];
  let n = 0;
  const cache = freshCache(async () => { n++; const v = n; await new Promise<void>((r) => releases.push(r)); return v; }, 60_000, 3_600_000, () => 0);
  const first = cache.get();       // read 1 under way
  cache.clear();                   // a record was published meanwhile
  const second = cache.get();      // must not share read 1
  assert.equal(n, 2);
  releases[0](); releases[1]();
  assert.equal(await first, 1);
  assert.equal(await second, 2);
  assert.equal(await cache.get(), 2, 'read 1 was not kept');
});
