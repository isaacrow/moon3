// The category model (src/opac/category.ts, plan step B1): one category per Work and one format per edition,
// from what BIBFRAME records already say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, formatOf, CATEGORIES, FORMATS } from '../src/opac/category';

const V = 'http://id.loc.gov/vocabulary';
const work = (x: any = {}) => ({ '@type': ['bf:Work', 'bf:Text'], 'bf:content': { '@id': `${V}/contentTypes/txt` }, ...x });
const print = (x: any = {}) => ({ '@type': ['bf:Instance', 'bf:Print'], 'bf:media': { '@id': `${V}/mediaTypes/n` }, 'bf:carrier': { '@id': `${V}/carriers/nc` }, ...x });

test('every category and format has a name in both languages', () => {
  for (const x of [...Object.values(CATEGORIES), ...Object.values(FORMATS)]) assert.ok(x.ar && x.en);
});

test('categories from types, content, issuance and genres', () => {
  assert.equal(categoryOf(work(), [print()]), 'book');
  assert.equal(categoryOf(work(), [{ '@type': ['bf:Instance', 'bf:Manuscript'] }]), 'manuscript');
  assert.equal(categoryOf(work({ 'bf:genreForm': { 'rdfs:label': 'مخطوطات' } }), []), 'manuscript');
  assert.equal(categoryOf(work({ 'bf:content': { '@id': `${V}/contentTypes/cri` } }), []), 'map');
  assert.equal(categoryOf({ '@type': 'bf:Cartography' }, []), 'map');
  assert.equal(categoryOf(work({ 'bf:content': { '@id': `${V}/contentTypes/ntm` } }), []), 'score');
  assert.equal(categoryOf(work({ 'bf:content': { '@id': `${V}/contentTypes/spw` } }), []), 'audio');
  assert.equal(categoryOf(work({ 'bf:content': { '@id': `${V}/contentTypes/tdi` } }), []), 'video');
  assert.equal(categoryOf(work({ 'bf:content': { 'rdfs:label': 'still image' } }), []), 'image');
  assert.equal(categoryOf(work({ 'bf:content': { '@id': `${V}/contentTypes/cod` } }), []), 'software');
  assert.equal(categoryOf(work(), [print({ 'bf:issuance': { '@id': `${V}/issuance/serl` } })]), 'periodical');
  assert.equal(categoryOf(work({ 'bf:genreForm': [{ 'rdfs:label': 'مجلة' }] }), []), 'periodical');
  assert.equal(categoryOf(work({ 'bf:genreForm': [{ 'rdfs:label': 'Articles' }] }), []), 'article');
  assert.equal(categoryOf({}, []), 'book', 'a record that says nothing is a book');
});

test('formats from the Instance type, media and carrier, or the words on it', () => {
  assert.equal(formatOf(print()), 'print');
  assert.equal(formatOf({ '@type': 'bf:Electronic' }), 'online');
  assert.equal(formatOf({ '@type': 'bf:Instance', 'bf:carrier': { '@id': `${V}/carriers/cr` } }), 'online');
  assert.equal(formatOf({ '@type': 'bf:Instance', 'bf:media': { '@id': `${V}/mediaTypes/h` } }), 'microform');
  assert.equal(formatOf({ '@type': 'bf:Instance', 'bf:carrier': { '@id': `${V}/carriers/sd` } }), 'audio');
  assert.equal(formatOf({ '@type': ['bf:Instance', 'bf:Manuscript'] }), 'handwritten');
  assert.equal(formatOf({ '@type': 'bf:Instance' }, 'manuscript'), 'handwritten');
  assert.equal(formatOf({ '@type': 'bf:Tactile' }), 'braille');
  assert.equal(formatOf({ carrierType: 'مجلد مطبوع (Book)' }), 'print', 'the OPAC\'s own words');
  assert.equal(formatOf({ carrierType: 'online resource' }), 'online');
  assert.equal(formatOf({ '@type': 'bf:Instance' }), undefined, 'nothing said, nothing guessed');
});
