// Cloudflare Worker on mooon.site/resource/*: makes Moon's record URIs resolve. GitHub Pages only
// serves files, so these addresses are passed to the Moon server, which answers with the published
// record as JSON-LD, Turtle or N-Triples, or sends a browser to the record's OPAC page. Every other
// address on mooon.site never reaches this Worker (see the route in wrangler.toml).
// It also opens the live rooms at mooon.site/live/records/<id>, where catalogers on the same
// record see each other (liveGate.js checks the ticket, liveRoom.js is the room).

// And it gives each book's catalogue page (mooon.site/opac.html?work=<id>) that book's own <head> for search
// engines (opacHead.js); the page itself still comes from GitHub Pages.

import { handleLive } from './liveGate.js';
import { workIdOf, bookHeadOf, withBookHead } from './opacHead.js';

export { LiveRoom } from './liveRoom.js';

/**
 * The book's <head>, read from the server's plain page for it, kept at the edge for an hour. Null when the book is
 * not published or the server is slow to answer (the catalogue page then goes out as it is, never held up long).
 */
async function bookHead(id, env, ctx) {
  const key = new Request(`https://mooon.site/__opac-head/${encodeURIComponent(id)}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit.json();
  let book = null;
  try {
    const r = await fetch(`${env.MOON_API}/resource/?book=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, apikey: env.SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) book = bookHeadOf(await r.text());
  } catch {
    return null;
  }
  if (book) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(book), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })));
  return book;
}

/** mooon.site/opac.html*: the page from GitHub Pages, with a book's own <head> when it is one book's page. */
async function cataloguePage(request, env, ctx) {
  const page = await fetch(request);
  const url = new URL(request.url);
  const id = url.pathname === '/opac.html' && request.method === 'GET' ? workIdOf(url) : '';
  if (!id || page.status !== 200 || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;
  const book = await bookHead(id, env, ctx);
  if (!book) return page;
  const response = new Response(withBookHead(await page.text(), book), page);
  response.headers.delete('Content-Length');
  response.headers.delete('ETag');
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The catalogue page is GitHub Pages' own; it is never passed to the Moon server like the addresses below.
    if (url.pathname.startsWith('/opac')) return cataloguePage(request, env, ctx);
    if (url.pathname.startsWith('/live/')) return handleLive(request, env);
    // The SPARQL endpoint also takes POSTed queries (and the browser's CORS preflight for them).
    const isSparql = url.pathname === '/resource/sparql';
    // Moon's MCP server for AI agents (JSON-RPC over POST; a cataloguer's X-Moon-Session for drafts).
    const isMcp = url.pathname === '/resource/mcp';
    if ((isSparql || isMcp) && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': isMcp ? 'Content-Type, Accept, X-Moon-Session, Mcp-Protocol-Version, Mcp-Session-Id' : 'Content-Type, Accept',
        'Access-Control-Max-Age': '86400',
      } });
    }
    const allowed = isSparql || isMcp ? ['GET', 'HEAD', 'POST'] : ['GET', 'HEAD'];
    if (!allowed.includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: allowed.join(', ') } });
    }
    // https://mooon.site/sitemap.xml (every published record's page, for search engines) is built by the server.
    // The public API (see /api.html): /resource/search searches the published catalogue only, and
    // /resource/authorities searches Moon's authority file.
    // One copy of the sitemap for everyone, whatever the query string (see the end of this function).
    const sitemapKey = new Request('https://mooon.site/sitemap.xml');
    if (url.pathname === '/sitemap.xml') {
      const kept = await caches.default.match(sitemapKey);
      if (kept) return kept;
    }
    let path = url.pathname;
    const search = new URLSearchParams(url.search);
    if (path === '/sitemap.xml') path = '/resource/sitemap.xml';
    else if (path === '/resource/search') { path = '/records/search'; search.set('view', 'published'); }
    else if (path === '/resource/authorities') path = '/authorities';
    const qs = search.toString();
    const target = `${env.MOON_API}${path}${qs ? `?${qs}` : ''}`;
    const upstream = await fetch(target, {
      method: request.method,
      body: request.method === 'POST' ? await request.text() : undefined,
      headers: {
        Accept: request.headers.get('Accept') || '*/*',
        ...(request.method === 'POST' ? { 'Content-Type': request.headers.get('Content-Type') || (isMcp ? 'application/json' : 'application/sparql-query') } : {}),
        ...(isMcp && request.headers.get('X-Moon-Session') ? { 'X-Moon-Session': request.headers.get('X-Moon-Session') } : {}),
        ...(isMcp && request.headers.get('Mcp-Protocol-Version') ? { 'Mcp-Protocol-Version': request.headers.get('Mcp-Protocol-Version') } : {}),
        // The public key the website itself uses; the server decides what may be shown (published only).
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
      // A browser's 303 to the OPAC page goes back to the browser as it is.
      redirect: 'manual',
    });
    const response = new Response(upstream.body, upstream);
    response.headers.set('Access-Control-Allow-Origin', '*');
    // Supabase sends every HTML page from its functions as text/plain; the record list at /resource/
    // is a web page, so label it as one.
    if ((url.pathname === '/resource' || url.pathname === '/resource/' || isSparql) && (response.headers.get('Content-Type') || '').startsWith('text/plain')) {
      response.headers.set('Content-Type', 'text/html; charset=utf-8');
    }
    // The sitemap gets the same treatment: search engines expect XML to say it is XML. It is kept at the edge
    // for an hour (as the server asks), so a search engine reading it is never kept waiting on the server.
    if (url.pathname === '/sitemap.xml' && response.status === 200) {
      response.headers.set('Content-Type', 'application/xml; charset=utf-8');
      response.headers.set('Cache-Control', 'public, max-age=3600');
      if (request.method === 'GET') ctx.waitUntil(caches.default.put(sitemapKey, response.clone()));
    }
    return response;
  },
};
