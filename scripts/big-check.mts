/** Checks an N-Triples file (default: the live dump) against BIG's monograph shapes and prints the report. */
import fs from 'node:fs';
import { checkBig } from '../supabase/functions/server/bigShapes.tsx';
const src = process.argv[2];
const nt = src ? fs.readFileSync(src, 'utf8') : await (await fetch('https://mooon.site/resource/dump.nt')).text();
const r = checkBig(nt);
console.log(`BIG ${r.version}`);
for (const s of r.shapes) console.log(`  ${s.label}: ${s.conforming}/${s.checked} without violations (${s.withWarnings} with warnings only)`);
for (const x of r.results) console.log(`  ${x.severity.padEnd(9)} ${String(x.nodes).padStart(4)}  ${x.shape} ${x.label} — ${x.problem}`);
