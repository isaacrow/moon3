// The fixed test set for the public round-trip report (plan step A2): records from the Library of Congress
// catalogue (LC's bibliographic records carry no copyright restriction), fetched once from LC's SRU server and kept
// in test/fixtures/round-trip/lc-set.xml so every run of the report reads the same records.
//   npx tsx scripts/round-trip-set.mts        (fetches again; the report then changes, see round-trip-report.mts)
import { writeFileSync, mkdirSync } from 'node:fs';

// Each search adds a few records; together they cover Arabic (romanized with 880 script fields) and English books,
// translations, series, conferences, editors and subject strings with subdivisions.
const SEARCHES: Array<[string, number]> = [
  ['dc.title="muqaddimah" and dc.creator="ibn khaldun"', 4],
  ['dc.title="nahj al-balaghah"', 4],
  ['dc.title="tarikh baghdad"', 4],
  ['dc.title="karbala"', 4],
  ['dc.title="al-balaghah"', 4],
  ['dc.title="diwan" and dc.creator="mutanabbi"', 4],
  ['dc.title="bibframe"', 3],
  ['dc.title="linked data" and dc.subject="libraries"', 4],
  ['dc.title="cataloging" and dc.subject="rda"', 4],
  ['dc.title="hamlet" and dc.creator="shakespeare"', 3],
  ['dc.title="proceedings" and dc.subject="information retrieval"', 4],
  ['dc.title="arabic manuscripts" and dc.subject="catalogs"', 4],
  ['dc.title="history of iraq"', 4],
];

const records: string[] = [];
const seen = new Set<string>();
for (const [query, n] of SEARCHES) {
  const url = `http://lx2.loc.gov:210/LCDB?operation=searchRetrieve&version=1.1&recordSchema=marcxml&maximumRecords=${n}&query=${encodeURIComponent(query)}`;
  const xml = await (await fetch(url)).text();
  for (const m of xml.matchAll(/<record xmlns="http:\/\/www\.loc\.gov\/MARC21\/slim">[\s\S]*?<\/record>/g)) {
    const id = m[0].match(/<controlfield tag="001">([^<]+)</)?.[1]?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    records.push(m[0].replace(/ xmlns="http:\/\/www\.loc\.gov\/MARC21\/slim"/, ''));
  }
  console.log(`${query}: ${records.length} so far`);
}
mkdirSync('test/fixtures/round-trip', { recursive: true });
writeFileSync('test/fixtures/round-trip/lc-set.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Records from the Library of Congress catalogue (lx2.loc.gov SRU), fetched by scripts/round-trip-set.mts -->\n<collection xmlns="http://www.loc.gov/MARC21/slim">\n${records.join('\n')}\n</collection>\n`);
console.log(`${records.length} records written`);
