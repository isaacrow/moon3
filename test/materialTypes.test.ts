// New record: the kind of material and print / electronic set the template and the values the MARC view reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, materialById, materialStart, materialMetadata } from '../src/app/utils/materialTypes';
import { getTemplate } from '../src/services/templateEngine';
import { PROFILES, profileDefaults } from '../supabase/functions/server/profiles.tsx';
import { bibframeToMarc } from '../src/services/marc/bibframeToMarc';

test('every material has a template and a profile, six kinds and four rare ones', () => {
  assert.equal(MATERIALS.length, 10);
  assert.equal(MATERIALS.filter((m) => m.rare).length, 4);
  for (const m of MATERIALS) {
    assert.ok(getTemplate(m.templateId), `template ${m.templateId}`);
    assert.ok(PROFILES[m.templateId], `profile ${m.templateId}`);
  }
});

test('pictures and stamps use the still-image profile', () => {
  const d = profileDefaults(PROFILES['still-image']);
  assert.equal(d.work['bf:content']['@id'], 'http://id.loc.gov/vocabulary/contentTypes/sti');
  assert.equal(materialById('stamp')!.templateId, 'still-image');
  assert.equal(materialStart(materialById('stamp')!, 'print').instance['bf:carrier']['@id'], 'http://id.loc.gov/vocabulary/carriers/no');
});

test('electronic means computer media and an online resource', () => {
  const s = materialStart(materialById('rare-book')!, 'electronic');
  assert.equal(s.instance['bf:media']['@id'], 'http://id.loc.gov/vocabulary/mediaTypes/c');
  assert.equal(s.instance['bf:carrier']['@id'], 'http://id.loc.gov/vocabulary/carriers/cr');
  assert.deepEqual(materialMetadata(materialById('rare-book')!, 'electronic'), { materialType: 'rare-book', carrierKind: 'electronic', rare: true });
});

const marcOf = (id: string, carrier: 'print' | 'electronic') => {
  const s = materialStart(materialById(id)!, carrier);
  const doc = { '@graph': [
    { '@id': 'w', '@type': 'bf:Work', 'bf:title': { 'bf:mainTitle': 'T' }, ...s.work },
    { '@id': 'i', '@type': 'bf:Instance', 'bf:instanceOf': { '@id': 'w' }, 'bf:title': { '@type': 'bf:Title', 'bf:mainTitle': 'T' }, ...s.instance },
  ] };
  return bibframeToMarc(doc as any, { recordId: 'x', now: new Date('2026-11-20T10:00:00Z') });
};

test('the MARC Leader follows the choice: book a/m, journal a/s, map e, picture k', () => {
  assert.equal(marcOf('book', 'print').leader.slice(6, 8), 'am');
  assert.equal(marcOf('journal', 'print').leader.slice(6, 8), 'as');
  assert.equal(marcOf('map', 'print').leader[6], 'e');
  assert.equal(marcOf('picture', 'print').leader[6], 'k');
});

test('an electronic book is coded online in 008/23', () => {
  const f008 = marcOf('book', 'electronic').fields.find((f: any) => f.tag === '008') as any;
  assert.equal(f008.data[23], 'o');
});
