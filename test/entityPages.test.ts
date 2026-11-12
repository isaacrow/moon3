// Plain pages for people, places and subjects: which entities a record names, the page, its schema.org markup, and
// text from the data that can never break out of the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityJsonLd, entityPageHtml, moonEntitiesOf, namesEntity, parseEntityParam } from '../supabase/functions/server/entityPages.tsx';
import { bookPageHtml } from '../supabase/functions/server/seoPages.tsx';

const AGENT = 'https://mooon.site/resource/agent/naguib-mahfouz-1';
const TOPIC = 'https://mooon.site/resource/topic/egypt-fiction-2';
const doc = { '@graph': [
  { '@id': 'https://mooon.site/resource/work/w1', '@type': 'bf:Work',
    'bf:contribution': { '@type': 'bf:Contribution', 'bf:agent': { '@id': AGENT, 'rdfs:label': 'نجيب محفوظ' } },
    'bf:subject': [{ '@id': TOPIC }, { '@id': 'http://id.loc.gov/authorities/subjects/sh1', 'rdfs:label': 'Outside' }] },
  { '@id': TOPIC, '@type': 'bf:Topic', 'rdfs:label': 'Egypt -- Fiction' },
] };

test('moonEntitiesOf: every Moon entity a record names, once, with a label; outside addresses left out', () => {
  assert.deepEqual(moonEntitiesOf(doc), [
    { kind: 'agent', id: 'naguib-mahfouz-1', label: 'نجيب محفوظ' },
    { kind: 'topic', id: 'egypt-fiction-2', label: 'Egypt -- Fiction' },
  ]);
  assert.equal(namesEntity(doc, 'agent', 'naguib-mahfouz-1'), true);
  assert.equal(namesEntity(doc, 'agent', 'naguib-mahfouz'), false, 'a shorter id is not a match');
});

test('parseEntityParam takes only a known kind and a clean id', () => {
  assert.deepEqual(parseEntityParam('agent/ali-abunimah-8007e742'), { kind: 'agent', id: 'ali-abunimah-8007e742' });
  assert.equal(parseEntityParam('hub/x'), null);
  assert.equal(parseEntityParam('agent/../../etc'), null);
  assert.equal(parseEntityParam(undefined), null);
});

const mahfouz = { id: 'naguib-mahfouz-1', kind: 'agent', label: 'نجيب محفوظ', variants: ['Maḥfūẓ, Najīb, 1911-2006', 'Mahfouz, Naguib'],
  sameAs: ['http://id.loc.gov/authorities/names/n82091918', 'http://www.wikidata.org/entity/Q7176'], data: { agentType: 'Person', birthDate: '1911-12-11', deathDate: '2006-08-30' } };

test('the page shows names, dates, outside links and books', () => {
  const html = entityPageHtml(mahfouz, [{ id: 'r1', title: 'Palace Walk', creator: 'نجيب محفوظ', year: '1990' }], (id) => `https://mooon.site/resource/?book=${id}`);
  assert.match(html, /<html lang="ar">/);
  assert.match(html, /<h1 dir="auto">نجيب محفوظ<\/h1>/);
  assert.match(html, /Mahfouz, Naguib/);
  assert.match(html, /1911-12-11/);
  assert.match(html, /Library of Congress<\/a> · <a href="http:\/\/www\.wikidata\.org\/entity\/Q7176">Wikidata/);
  assert.match(html, /href="https:\/\/mooon\.site\/resource\/\?book=r1"/);
  assert.match(html, /Books · الكتب \(1\)/);
  assert.match(entityPageHtml({ ...mahfouz, variants: [] }, [], () => ''), /No published book names it yet/);
});

test('schema.org: a Person with dates and sameAs; a subject is a DefinedTerm', () => {
  const person = JSON.parse(entityJsonLd(mahfouz));
  assert.equal(person['@type'], 'Person');
  assert.equal(person.birthDate, '1911-12-11');
  assert.deepEqual(person.alternateName, ['Maḥfūẓ, Najīb, 1911-2006', 'Mahfouz, Naguib']);
  assert.equal(person['@id'], 'https://mooon.site/resource/agent/naguib-mahfouz-1');
  assert.equal(JSON.parse(entityJsonLd({ id: 't', kind: 'topic', label: 'Sufism' }))['@type'], 'DefinedTerm');
  assert.equal(JSON.parse(entityJsonLd({ id: 'o', kind: 'agent', label: 'Penguin Books', data: { agentType: 'Organization' } }))['@type'], 'Organization');
});

test('text from the data cannot break out of the page or its markup', () => {
  const evil = { id: 'x', kind: 'agent', label: '</title><script>alert(1)</script>', variants: ['"><img src=x>'], note: '<b>n</b>', sameAs: ['javascript:alert(1)'] };
  const html = entityPageHtml(evil, [{ id: 'r"1', title: '<i>t</i>' }], (id) => `/b?${id}`);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /javascript:alert/, 'only web addresses become links');
  assert.doesNotMatch(entityJsonLd(evil), /<\/script/);
});

test('book pages link to the entities they name', () => {
  const html = bookPageHtml({ id: 'r1', title: 'Palace Walk', url: '', entities: moonEntitiesOf(doc) } as any);
  assert.match(html, /resource\/\?entity=agent%2Fnaguib-mahfouz-1/);
  assert.match(html, /Egypt -- Fiction/);
});

test('schema.org type from the entity file\'s lower-case types', () => {
  assert.equal(JSON.parse(entityJsonLd({ id: 'p', kind: 'agent', label: 'X', data: { agentType: 'person' } }))['@type'], 'Person');
  assert.equal(JSON.parse(entityJsonLd({ id: 'o', kind: 'agent', label: 'Penguin Books', data: { agentType: 'organization' } }))['@type'], 'Organization');
});
