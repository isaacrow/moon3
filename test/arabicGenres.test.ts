// Arabic genre and form terms (arabicGenres.tsx, plan step B2): labels in both languages, LCGFT matches as LC gives
// them, valid SKOS, and the catalogue showing genres in the reader's language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Parser } from 'n3';
import { ARABIC_GENRES, toTurtle, termFor, lcgftOf } from '../supabase/functions/server/arabicGenres.tsx';
import { valueLabel } from '../src/opac/facets';

test('each term: Arabic and English labels, a romanization, a broader term that exists, LCGFT as LC writes it', () => {
  const ids = new Set(ARABIC_GENRES.map((t) => t.id));
  assert.equal(ids.size, ARABIC_GENRES.length);
  for (const t of ARABIC_GENRES) {
    assert.match(t.ar, /[؀-ۿ]/, t.id);
    assert.ok(t.en && t.romanized, t.id);
    if (t.broader) assert.ok(ids.has(t.broader), `${t.id} broader`);
    const m = lcgftOf(t.id);
    if (t.lcgft) assert.ok(m && /^http:\/\/id\.loc\.gov\/authorities\/genreForms\/gf\d+$/.test(m.uri), `${t.id} is matched`);
    else assert.equal(m, undefined, `${t.id} has no match on purpose`);
  }
  assert.equal(lcgftOf('fatwas')!.label, 'Fatwas');
});

test('the SKOS parses; a narrower term is a broad match, not an exact one', () => {
  const ttl = toTurtle();
  const quads = new Parser().parse(ttl);
  assert.ok(quads.length > ARABIC_GENRES.length * 4);
  assert.match(ttl, /genres-ar\/diwan> a skos:Concept[\s\S]*?skos:broadMatch <http:\/\/id\.loc\.gov\/authorities\/genreForms\/gf2014026481>/);
  assert.match(ttl, /genres-ar\/novels> a skos:Concept[\s\S]*?skos:exactMatch <http:\/\/id\.loc\.gov\/authorities\/genreForms\/gf2015026020>/);
});

test('a genre is found by any of its names, and the catalogue shows it in the reader\'s language', () => {
  assert.equal(termFor('Poetry')!.id, 'poetry');
  assert.equal(termFor('شعر')!.id, 'poetry');
  assert.equal(termFor('fatawa')!.id, 'fatwas', 'diacritics aside');
  assert.equal(termFor('poetics'), undefined);
  assert.equal(termFor('fatāwá')!.id, 'fatwas');
  assert.equal(valueLabel('genre', 'Novels'), 'رواية', 'Arabic is the catalogue\'s default language');
  assert.equal(valueLabel('genre', 'Something local'), 'Something local');
});
