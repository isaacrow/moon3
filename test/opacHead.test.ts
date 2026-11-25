import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-ignore: the Worker is plain JavaScript.
import { workIdOf, bookHeadOf, withBookHead } from '../workers/resource-router/opacHead.js';
import { bookPageHtml, type BookFacts } from '../supabase/functions/server/seoPages.tsx';

// The catalogue page as GitHub Pages sends it, and a book's plain page as the server makes it.
const shell = readFileSync(new URL('../opac.html', import.meta.url), 'utf8');
const facts: BookFacts = {
  id: 'record-1', title: 'The epic of Gilgamesh & $1 "friends"', creator: 'Sandars, N. K.', year: '1960',
  subjects: ['Gilgamesh'], url: 'https://mooon.site/opac.html?work=record-1',
} as BookFacts;
const plain = bookPageHtml(facts);

test('workIdOf takes a record id and nothing else', () => {
  assert.equal(workIdOf(new URL('https://mooon.site/opac.html?work=record-1771342400925')), 'record-1771342400925');
  assert.equal(workIdOf(new URL('https://mooon.site/opac.html')), '');
  assert.equal(workIdOf(new URL('https://mooon.site/opac.html?work=%3Cscript%3E')), '');
});

test('bookHeadOf reads the head of the server\'s book page', () => {
  const book = bookHeadOf(plain);
  assert.ok(book);
  assert.match(book.title, /^The epic of Gilgamesh &#38; \$1 &#34;friends&#34; — Sandars/);
  assert.equal(book.canonical, 'https://mooon.site/opac.html?work=record-1');
  assert.ok(book.description.length > 0);
  assert.equal(JSON.parse(book.jsonLd)['@type'], 'Book');
  assert.equal(bookHeadOf('<!doctype html><p>Not found</p>'), null);
});

test('withBookHead gives the catalogue page the book\'s head, once each', () => {
  const book = bookHeadOf(plain)!;
  const html = withBookHead(shell, book);
  const count = (re: RegExp) => (html.match(re) || []).length;
  assert.equal(count(/<title>/g), 1);
  assert.ok(html.includes(`<title>${book.title}</title>`), 'title, with "$1" copied as it is');
  assert.equal(count(/rel="canonical"/g), 1);
  assert.ok(html.includes('<link rel="canonical" href="https://mooon.site/opac.html?work=record-1" />'));
  assert.equal(count(/name="description"/g), 1);
  assert.ok(html.includes(`<meta name="description" content="${book.description}" />`));
  assert.ok(html.includes('<meta property="og:type" content="book" />'));
  assert.equal(count(/id="schema-org-book"/g), 1);
  // The catalogue's own WebSite markup and the page's scripts are untouched.
  assert.ok(html.includes('"@type":"WebSite"'));
  assert.ok(html.includes('<div id="root"></div>'));
});
