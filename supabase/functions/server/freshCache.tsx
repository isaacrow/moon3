/**
 * A value kept in memory and served at once (plan step B3): read at most once a minute; after that the copy in hand
 * is served while a new one is read in the background (stale while revalidate), so a reader never waits for the
 * rebuild unless nothing has been read yet, or the copy is over an hour old. clear() drops it (a record was published).
 */
export function freshCache<T>(load: () => Promise<T>, maxAge = 60_000, maxStale = 60 * 60_000, now: () => number = Date.now) {
  let held: { at: number; value: T } | null = null;
  let loading: Promise<T> | null = null;
  let generation = 0;
  const refresh = (): Promise<T> => {
    if (!loading) {
      const gen = generation;
      const mine: Promise<T> = load()
        .then((value) => { if (gen === generation) held = { at: now(), value }; return value; })
        .finally(() => { if (loading === mine) loading = null; });
      loading = mine;
    }
    return loading;
  };
  return {
    async get(): Promise<T> {
      const age = held ? now() - held.at : Infinity;
      if (held && age < maxAge) return held.value;
      if (held && age < maxStale) {
        const job = refresh().catch((e) => console.error('Catalogue refresh:', e));
        try { (globalThis as any).EdgeRuntime?.waitUntil?.(job); } catch { /* the promise still runs */ }
        return held.value;
      }
      return refresh();
    },
    // A read already under way may be older than what was just published: the next reader starts a new one.
    clear() { held = null; loading = null; generation++; },
  };
}
