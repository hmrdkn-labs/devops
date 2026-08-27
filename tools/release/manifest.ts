import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

async function hashTree(relativeRoots: string[]) {
  const entries: Array<{ path: string; sha256: string }> = [];
  async function visit(relative: string) {
    const absolute = path.join(root, relative);
    if ((await stat(absolute)).isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) await visit(path.join(relative, name));
    } else {
      entries.push({ path: relative.split(path.sep).join('/'), sha256: sha256(await readFile(absolute)) });
    }
  }
  for (const relative of relativeRoots) await visit(relative);
  return {
    entries,
    sha256: sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join('\n')),
  };
}

function git(...arguments_: string[]) {
  try {
    return execFileSync('git', arguments_, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'uncommitted';
  }
}

const content = JSON.parse(await readFile(path.join(root, 'public/content/v1/manifest.json'), 'utf8')) as {
  content_version: string;
  manifest_sha256: string;
};
const source = await hashTree([
  '.dev.vars.example', '.github', '.openai', 'CONTEXT.md', 'CONTRIBUTING.md',
  'LICENSE', 'LICENSE-CONTENT.md', 'NOTICE.md', 'README.md', 'SECURITY.md',
  'astro.config.ts', 'content', 'db', 'docs', 'drizzle', 'drizzle.config.ts',
  'package-lock.json', 'package.json', 'playwright.config.ts', 'src', 'tests',
  'tools', 'tsconfig.json', 'vitest.config.ts', 'wrangler.e2e.jsonc', 'wrangler.jsonc',
]);
const migrations = (await readdir(path.join(root, 'drizzle')))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const sourceCommit = process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD');
const commitDate = sourceCommit === 'uncommitted'
  ? content.content_version
  : git('show', '-s', '--format=%cI', sourceCommit);
const release = {
  schema_version: 1,
  source_commit: sourceCommit,
  source_commit_date: commitDate,
  content_version: content.content_version,
  content_manifest_sha256: content.manifest_sha256,
  source_tree_sha256: source.sha256,
  package_lock_sha256: sha256(await readFile(path.join(root, 'package-lock.json'))),
  migrations: await Promise.all(migrations.map(async (name) => ({
    name,
    sha256: sha256(await readFile(path.join(root, 'drizzle', name))),
  }))),
  bindings: ['DB'],
  runtime: 'cloudflare-worker',
};
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'release-manifest.json'), `${JSON.stringify(release, null, 2)}\n`);
console.log(`Release manifest ${source.sha256.slice(0, 12)} for ${sourceCommit.slice(0, 12)}.`);
