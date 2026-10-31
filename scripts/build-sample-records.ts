// Regenerates the published sample records in public/records from their JSON source,
// through the same normalizer and serializers the editor uses.
// Run: npx tsx scripts/build-sample-records.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { toRdfXml, toTurtle } from '../src/services/rdfGraphBuilder';
import { normalizeBibframeWithReport } from '../src/services/bibframeNormalizer';

const dir = new URL('../public/records/', import.meta.url);

for (const name of ['al-qabasat', 'b125923']) {
  const source = JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8'));
  const { doc, changes } = normalizeBibframeWithReport(source);
  writeFileSync(new URL(`${name}.rdf`, dir), toRdfXml(doc));
  writeFileSync(new URL(`${name}.ttl`, dir), toTurtle(doc));
  writeFileSync(new URL(`${name}.jsonld`, dir), JSON.stringify(doc, null, 2) + '\n');
  if (name === 'al-qabasat') writeFileSync(new URL(`${name}.xml`, dir), toRdfXml(doc));
  console.log(`${name}: ${changes.length} kinds of fixes`);
}
