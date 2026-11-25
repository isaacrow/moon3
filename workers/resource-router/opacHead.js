// A book's page in the catalogue (https://mooon.site/opac.html?work=<id>) is built in the reader's browser, so
// before its scripts run every book looks the same: the catalogue's own title and description. Search engines
// may read it that way. The Worker gives that page the book's own <head> before it leaves the edge: its title,
// description, canonical address, preview tags and schema.org Book markup, all taken from the plain page the
// Moon server already makes for the same book (https://mooon.site/resource/?book=<id>, seoPages.tsx).
// Readers get the same page as before; the catalogue's scripts take over the <head> from there.
// Pure string functions, so they are tested without a Worker (test/opacHead.test.ts).

/** A record id as the catalogue writes it, or '' for anything else (the page is then sent as it is). */
export function workIdOf(url) {
  const id = url.searchParams.get('work') || '';
  return /^[A-Za-z0-9._:-]{1,200}$/.test(id) ? id : '';
}

const pick = (html, re) => (html.match(re) || [])[1];

/**
 * The parts of the plain book page worth carrying over. Its values are already escaped for HTML by the server,
 * so they go back into the catalogue page as they are. Null when the page does not look like a book page.
 */
export function bookHeadOf(plainHtml) {
  const head = pick(plainHtml, /<head>([\s\S]*?)<\/head>/i);
  if (!head) return null;
  const title = pick(head, /<title>([^<]+)<\/title>/i);
  const description = pick(head, /<meta name="description" content="([^"]*)">/i);
  const canonical = pick(head, /<link rel="canonical" href="([^"]+)">/i);
  const jsonLd = pick(head, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!title || !canonical) return null;
  return { title, description: description || '', canonical, jsonLd: jsonLd || '' };
}

// Replacements are functions, so a "$" in a book's title is copied as it is (never read as a replace pattern).
const put = (html, re, tag) => html.replace(re, () => tag);
const beforeHeadEnd = (html, tag) => html.replace(/<\/head>/i, () => `    ${tag}\n  </head>`);
const replaceOrAdd = (html, re, tag) => (re.test(html) ? put(html, re, tag) : beforeHeadEnd(html, tag));

/** The catalogue page with the book's <head> in place of the catalogue's. */
export function withBookHead(shellHtml, book) {
  let html = shellHtml;
  html = put(html, /<title>[^<]*<\/title>/i, `<title>${book.title}</title>`);
  if (book.description) {
    html = replaceOrAdd(html, /<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${book.description}" />`);
    html = replaceOrAdd(html, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${book.description}" />`);
  }
  html = replaceOrAdd(html, /<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${book.canonical}" />`);
  html = replaceOrAdd(html, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${book.canonical}" />`);
  html = replaceOrAdd(html, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${book.title}" />`);
  html = put(html, /<meta property="og:type" content="[^"]*"\s*\/?>/i, '<meta property="og:type" content="book" />');
  // The catalogue's WebSite markup stays; the book's markup goes beside it, with the id the catalogue's own
  // script uses, so the page never carries two copies of it once the scripts run.
  if (book.jsonLd) html = beforeHeadEnd(html, `<script type="application/ld+json" id="schema-org-book">${book.jsonLd}</script>`);
  return html;
}
