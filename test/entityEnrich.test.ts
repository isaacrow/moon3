// Filling entities from their LC and Wikidata links: names in both scripts, dates, nothing replaced, wrong links caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichedEntityBody, enrichmentOf, MAX_NEW_NAMES, nameKey, namesAgree } from '../src/services/entityEnrich';

const draft = (label: string, variants: string[] = [], details: Record<string, string> = {}, kind = 'agent', sources = ['lc']) =>
  ({ kind, agentType: 'Person', label, variants, sameAs: [], note: '', details, data: {}, sources } as any);

test('adds the other script first, and dates a person lacks', () => {
  const x = enrichmentOf({ id: 'k', kind: 'agent', label: 'Akram Fouad Khater', variants: [] },
    [draft('Khater, Akram Fouad, 1960-', ['أكرم فؤاد خاطر', 'Akram Khater'], { birthDate: '1960-12-03' })])!;
  assert.equal(x.names[0], 'أكرم فؤاد خاطر', 'the Arabic form comes first');
  assert.ok(x.names.includes('Khater, Akram Fouad, 1960-'));
  assert.equal(x.dates.birthDate, '1960-12-03');
  assert.equal(x.firstArabic, true);
  assert.equal(x.agree, 'same');
});

test('never adds a name the entity already has, however it is spelled', () => {
  assert.equal(nameKey('Maḥfūẓ, Najīb'), nameKey('mahfuz najib'));
  assert.equal(nameKey('أحمد'), nameKey('احمد'));
  const x = enrichmentOf({ id: 'm', kind: 'agent', label: 'نجيب محفوظ', variants: ['Mahfuz, Najib'] },
    [draft('Maḥfūẓ, Najīb', ['نجيب محفوظ', 'Mahfouz, Naguib'])])!;
  assert.deepEqual(x.names, ['Mahfouz, Naguib']);
  assert.equal(x.firstLatin, false, 'it already had a Latin form');
});

test('keeps dates the entity has, and gives dates to people only', () => {
  const kept = enrichmentOf({ id: 'a', kind: 'agent', label: 'Abū Nuwās', data: { birthDate: '757' } },
    [draft('Abū Nuwās', [], { birthDate: '0756~', deathDate: '0810~' })])!;
  assert.deepEqual(kept.dates, { deathDate: '0810~' });
  const place = enrichmentOf({ id: 'p', kind: 'place', label: 'Cairo (Egypt)' },
    [draft('Cairo (Egypt)', ['القاهرة'], { birthDate: '969' }, 'place')])!;
  assert.deepEqual(place.dates, {});
  assert.deepEqual(place.names, ['القاهرة']);
});

test('only Arabic and Latin names; Hebrew, Cyrillic and web addresses are left out', () => {
  const x = enrichmentOf({ id: 'n', kind: 'agent', label: 'أبو نواس' },
    [draft('Abū Nuwās, approximately 756-approximately 810', ['אבו־נוואס', 'Абу Нувас', 'https://example.org/x', 'Abu Nuwas'])])!;
  assert.deepEqual(x.names, ['Abū Nuwās, approximately 756-approximately 810', 'Abu Nuwas'], 'the plain form without accents or dates is kept too');
});

test('a record of another kind gives nothing; nothing new gives null', () => {
  assert.equal(enrichmentOf({ id: 's', kind: 'agent', label: 'X' }, [draft('Islands--Antarctica', [], {}, 'topic')]), null);
  assert.equal(enrichmentOf({ id: 'e', kind: 'agent', label: 'Same' }, [draft('Same')]), null);
  assert.equal(enrichmentOf({ id: 'e', kind: 'agent', label: 'Same' }, [null]), null);
});

test('at most MAX_NEW_NAMES names in one go', () => {
  const many = Array.from({ length: 30 }, (_, i) => `Form ${String.fromCharCode(65 + i)} Smith`);
  const x = enrichmentOf({ id: 'z', kind: 'agent', label: 'Smith, John' }, [draft('Smith, John', many)])!;
  assert.equal(x.names.length, MAX_NEW_NAMES);
});

test('namesAgree catches a link to the wrong person', () => {
  assert.equal(namesAgree(['Ali Abunimah'], ['Abunimah, Ali', 'علي أبو نعمة']), 'same');
  assert.equal(namesAgree(['al-Ghazzālī'], ['Ghazzali, 1058-1111']), 'same');
  assert.equal(namesAgree(['الغزالي، أبو حامد'], ['أبو حامد الغزالي']), 'same', 'Arabic parts, "al" and "abu" ignored');
  assert.equal(namesAgree(['John Smith'], ['Eberhard, Birgit']), 'differs');
  assert.equal(namesAgree(['الميرداماد، محمد باقر'], ['Eberhard, Birgit']), 'unknown', 'different scripts: a person must look');
});

test('the saved entity keeps every field it had, with the additions', () => {
  const e = { id: 'k', kind: 'agent', label: 'Akram Fouad Khater', variants: ['A. Khater'], sameAs: ['http://id.loc.gov/authorities/names/n1'],
    data: { agentType: 'Person', occupation: 'historian' }, note: 'Professor at NC State', version: 7 };
  const body = enrichedEntityBody(e, { id: 'k', names: ['أكرم فؤاد خاطر'], dates: { birthDate: '1960-12-03' }, agree: 'same', firstArabic: true, firstLatin: false, from: ['lc'] });
  assert.deepEqual(body, {
    label: 'Akram Fouad Khater',
    variants: ['A. Khater', 'أكرم فؤاد خاطر'],
    sameAs: ['http://id.loc.gov/authorities/names/n1'],
    data: { agentType: 'Person', occupation: 'historian', birthDate: '1960-12-03' },
    note: 'Professor at NC State',
    version: 7,
  });
  assert.equal((enrichedEntityBody({ id: 'x', kind: 'agent', label: 'X' }, { id: 'x', names: [], dates: {}, agree: 'same', firstArabic: false, firstLatin: false, from: [] }) as any).note, null);
});
