import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { compareRevisionManifests, type RevisionEntry } from '../../src/lib/content/revision';

interface Manifest { units: RevisionEntry[] }

const root = process.cwd();
const base = process.argv.find((argument) => argument.startsWith('--base='))?.slice(7) ?? 'origin/main';
const current = JSON.parse(await readFile(`${root}/public/content/v1/manifest.json`, 'utf8')) as Manifest;

let previous: Manifest;
try {
  previous = JSON.parse(execFileSync('git', ['show', `${base}:public/content/v1/manifest.json`], {
    cwd: root,
    encoding: 'utf8',
  })) as Manifest;
} catch {
  console.log(`No baseline manifest at ${base}; revision classification skipped for initial release.`);
  process.exit(0);
}

const errors = compareRevisionManifests(previous, current);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Revision classifications match content hashes.');
