import test from 'node:test';
import assert from 'node:assert/strict';
import { bookFactsOf, bookJsonLd, bookPageHtml, booksText, descriptionOf, esc, plainPageUrl } from '../supabase/functions/server/seoPages.tsx';

const doc = {
  '@graph': [
    { '@id': 'https://mooon.site/resource/work/w1', '@type': ['bf:Work'],
      'bf:title': { '@id': '_:t' }, 'bf:contribution': { '@id': '_:c' }, 'bf:subject': [{ '@id': '_:s1' }, { '@id': '_:s2' }],
      'bf:summary': { '@value': 'An ancient epic poem <b>from</b> Mesopotamia.' }, 'bf:language': { '@id': 'http://id.loc.gov/vocabulary/languages/eng' } },
    { '@id': '_:t', '@type': 'bf:Title', 'bf:mainTitle': 'The epic of Gilgamesh' },
    { '@id': '_:c', '@type': 'bf:Contribution', 'bf:agent': { '@id': '_:a' } },
    { '@id': '_:a', '@type': 'bf:Person', 'rdfs:label': 'Sandars, N. K.' },
    { '@id': '_:s1', 'rdfs:label': 'Gilgamesh' }, { '@id': '_:s2', 'rdfs:label': 'Epic poetry' },
    { '@id': 'https://mooon.site/resource/instance/i1', '@type': ['bf:Instance'],
      'bf:identifiedBy': { '@id': '_:i' }, 'bf:provisionActivity': { '@id': '_:p' } },
    { '@id': '_:i', '@type': 'bf:Isbn', 'rdf:value': '9780140441000' },
    { '@id': '_:p', '@type': 'bf:Publication', 'bf:date': '1960', 'bf:agent': { '@id': '_:pub' } },
    { '@id': '_:pub', 'rdfs:label': 'Penguin Books' },
  ],
};
const record = { id: 'record-1', title: 'The epic of Gilgamesh', document: doc };

test('bookFactsOf reads the facts of a published record', () => {
  const f = bookFactsOf(record);
  assert.equal(f.title, 'The epic of Gilgamesh');
  assert.equal(f.creator, 'Sandars, N. K.');
  assert.equal(f.year, '1960');
  assert.equal(f.isbn, '9780140441000');
  assert.equal(f.publisher, 'Penguin Books');
  assert.deepEqual(f.subjects, ['Gilgamesh', 'Epic poetry']);
  assert.equal(f.language, 'eng');
  assert.equal(f.workUri, 'https://mooon.site/resource/work/w1');
});

test('a record with nothing but a title still makes a page', () => {
  const f = bookFactsOf({ id: 'x', title: 'Only a title', document: { '@graph': [] } });
  const html = bookPageHtml(f);
  assert.match(html, /<h1 dir="auto">Only a title<\/h1>/);
  assert.doesNotMatch(html, /<dt>ISBN/);
});

test('the page is readable without scripts and says where the book lives', () => {
  const html = bookPageHtml(bookFactsOf(record));
  assert.match(html, /<title>The epic of Gilgamesh — Sandars, N\. K\. \| Moon Catalogue/);
  assert.match(html, /<h1 dir="auto">The epic of Gilgamesh<\/h1>/);
  assert.match(html, /rel="canonical" href="https:\/\/mooon\.site\/opac\.html\?work=record-1"/);
  assert.match(html, /property="og:title" content="The epic of Gilgamesh — Sandars, N\. K\."/);
  assert.match(html, /9780140441000/);
  assert.match(html, /work\/w1\.jsonld/);
});

test('text from a record can never break out of the page or its JSON-LD', () => {
  const evil = bookFactsOf({ id: 'e', title: '</title><script>alert(1)</script>"x', document: { '@graph': [] } });
  const html = bookPageHtml(evil);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(bookJsonLd(evil), /<\/script/);
  assert.equal(esc(`<a href="x">'&'</a>`), '&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;');
  const withSummary = bookPageHtml(bookFactsOf(record));
  assert.doesNotMatch(withSummary, /<b>from<\/b>/, 'markup in a summary is shown as text');
});

test('JSON-LD is a schema.org Book', () => {
  const data = JSON.parse(bookJsonLd(bookFactsOf(record)));
  assert.equal(data['@type'], 'Book');
  assert.equal(data.name, 'The epic of Gilgamesh');
  assert.equal(data.author.name, 'Sandars, N. K.');
  assert.equal(data.isbn, '9780140441000');
  assert.equal(data.inLanguage, 'eng');
  assert.deepEqual(data.sameAs, ['https://mooon.site/resource/work/w1']);
});

test('description is short and says what the book is', () => {
  const d = descriptionOf(bookFactsOf(record));
  assert.ok(d.length <= 280);
  assert.match(d, /^The epic of Gilgamesh — Sandars, N\. K\. \(1960\)\./);
});

test('booksText lists every book with the address of its page, and follows the list it is given', () => {
  const a = bookFactsOf(record);
  const b = bookFactsOf({ id: 'record-2', title: 'Another book', document: { '@graph': [] } });
  const one = booksText([a]);
  const two = booksText([a, b]);
  assert.match(one, /\(1\)/);
  assert.match(two, /\(2\)/);
  assert.ok(two.includes(`- Another book: ${plainPageUrl('record-2')}`));
  assert.ok(two.indexOf('Another book') < two.indexOf('The epic'), 'sorted by title');
  assert.ok(!one.includes('Another book'), 'a book not in the list is not in the text');
  assert.doesNotMatch(booksText([bookFactsOf({ id: 'u', title: 'Untitled', document: { '@graph': [] } })]), /: https/, 'empty Untitled records are left out');
});
