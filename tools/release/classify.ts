import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';

const base = process.argv.find((argument) => argument.startsWith('--base='))?.slice(7) ?? 'origin/main';
let files: string[];
try {
  files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean);
} catch {
  files = ['initial-release'];
}

const generated = new Set([
  'public/content/v1/manifest.json',
  'public/devops-content-v1.zip',
  'public/feed.xml',
  'public/llms-full.txt',
  'public/llms.txt',
  'public/references.json',
  'public/search-index.json',
  'src/generated/content-manifest.json',
]);
const contentOnly = files.length > 0 && files.every((file) =>
  file.startsWith('content/') || file.startsWith('public/raw/v1/') || generated.has(file));
const releaseClass = contentOnly ? 'content-only' : 'application-or-schema';

console.log(JSON.stringify({ releaseClass, changedFiles: files }, null, 2));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `release_class=${releaseClass}\n`);
}
