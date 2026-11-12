// Runs every test file in test/ — a new test file is picked up without editing package.json.
// (Before this, `npm test` listed the files by hand, and 27 test files were never run by CI.)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = readdirSync(new URL('../test/', import.meta.url))
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => `test/${f}`);
if (!files.length) { console.error('No test files found in test/'); process.exit(1); }
console.log(`Running ${files.length} test files`);
const run = spawnSync('npx', ['tsx', '--test', ...files], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(run.status ?? 1);
