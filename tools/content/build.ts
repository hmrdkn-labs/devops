import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { parse } from 'yaml';
import {
  cardFileSchema,
  certificationRegistrySchema,
  pathSchema,
  practiceFileSchema,
  questionFileSchema,
  sourceFileSchema,
  unitMetadataSchema,
  type LearningPath,
  type LearningUnit,
} from '../../src/lib/content/schema';

const root = process.cwd();
const contentRoot = path.join(root, 'content');
const publicRoot = path.join(root, 'public');
const checkOnly = process.argv.includes('--check');

const sha256 = (value: unknown) =>
  createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

const readYaml = async <T>(file: string, schema: { parse(value: unknown): T }): Promise<T> =>
  schema.parse(parse(await readFile(file, 'utf8')));

async function loadUnits(): Promise<LearningUnit[]> {
  const directories = (await readdir(path.join(contentRoot, 'units'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(directories.map(async (directory) => {
    const base = path.join(contentRoot, 'units', directory);
    const metadata = await readYaml(path.join(base, 'metadata.yaml'), unitMetadataSchema);
    const questions = await readYaml(path.join(base, 'questions.yaml'), questionFileSchema);
    const cards = await readYaml(path.join(base, 'cards.yaml'), cardFileSchema);
    const sources = await readYaml(path.join(base, 'sources.yaml'), sourceFileSchema);
    const practices = await readYaml(path.join(base, 'practice.yaml'), practiceFileSchema);
    const markdown = await readFile(path.join(base, 'unit.md'), 'utf8');

    if (directory !== metadata.slug) {
      throw new Error(`${metadata.id}: directory must match slug ${metadata.slug}`);
    }
    for (const sidecar of [questions, cards, sources, practices]) {
      if (sidecar.unit_id !== metadata.id) {
        throw new Error(`${metadata.id}: sidecar unit_id mismatch`);
      }
    }
    if (questions.revision !== metadata.revision || cards.revision !== metadata.revision) {
      throw new Error(`${metadata.id}: question/card revision must match metadata revision`);
    }
    return {
      metadata,
      markdown,
      questions: questions.questions,
      cards: cards.cards,
      sources: sources.sources,
      practices: practices.practices,
    };
  }));
}

export function validateGraph(units: LearningUnit[], paths: LearningPath[], certificationIds: Set<string>) {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const aliases = new Set<string>();
  const objectiveIds = new Set<string>();
  const contentIds = new Set<string>();

  for (const unit of units) {
    const { metadata } = unit;
    if (ids.has(metadata.id)) throw new Error(`Duplicate unit ID: ${metadata.id}`);
    if (slugs.has(metadata.slug)) throw new Error(`Duplicate unit slug: ${metadata.slug}`);
    ids.add(metadata.id);
    slugs.add(metadata.slug);
  }

  for (const unit of units) {
    const { metadata } = unit;
    for (const alias of metadata.aliases) {
      if (aliases.has(alias) || ids.has(alias)) throw new Error(`Duplicate or active alias: ${alias}`);
      aliases.add(alias);
    }
    for (const objective of metadata.objectives) {
      if (objectiveIds.has(objective.id)) throw new Error(`Duplicate objective ID: ${objective.id}`);
      objectiveIds.add(objective.id);
    }
    for (const source of unit.sources) {
      if (contentIds.has(source.id)) throw new Error(`Duplicate source ID: ${source.id}`);
      contentIds.add(source.id);
    }
    for (const item of [...unit.questions, ...unit.cards, ...unit.practices]) {
      if (contentIds.has(item.id)) throw new Error(`Duplicate content ID: ${item.id}`);
      contentIds.add(item.id);
    }
    if (unit.sources.length === 0) throw new Error(`${metadata.id}: at least one source is required`);
    for (const mapping of metadata.certification_mappings) {
      if (!certificationIds.has(mapping.certification)) {
        throw new Error(`${metadata.id}: unknown certification ${mapping.certification}`);
      }
    }
    const localObjectives = new Set(metadata.objectives.map((objective) => objective.id));
    for (const prompt of [...unit.questions, ...unit.cards]) {
      for (const objectiveId of prompt.objective_ids) {
        if (!localObjectives.has(objectiveId)) {
          throw new Error(`${prompt.id}: unknown objective ${objectiveId}`);
        }
      }
    }
  }

  for (const unit of units) {
    for (const prerequisite of unit.metadata.prerequisites) {
      if (!ids.has(prerequisite)) throw new Error(`${unit.metadata.id}: broken prerequisite ${prerequisite}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(units.map((unit) => [unit.metadata.id, unit]));
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Prerequisite cycle detected at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of byId.get(id)?.metadata.prerequisites ?? []) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);

  for (const learningPath of paths) {
    const pathUnits = new Set<string>();
    for (const entry of learningPath.units) {
      if (!ids.has(entry.unit_id)) throw new Error(`${learningPath.id}: broken unit edge ${entry.unit_id}`);
      if (pathUnits.has(entry.unit_id)) throw new Error(`${learningPath.id}: duplicate path unit ${entry.unit_id}`);
      pathUnits.add(entry.unit_id);
    }
  }

  const cardTypes = units.flatMap((unit) => unit.cards.map((card) => card.type));
  const proportions = Object.fromEntries(
    ['short', 'prompt', 'scenario'].map((type) => [
      type,
      cardTypes.filter((candidate) => candidate === type).length / cardTypes.length,
    ]),
  );
  if (proportions.short < 0.5 || proportions.short > 0.7 ||
      proportions.prompt < 0.1 || proportions.prompt > 0.3 ||
      proportions.scenario < 0.1 || proportions.scenario > 0.3) {
    throw new Error(`Review mix must approximate 60/20/20; got ${JSON.stringify(proportions)}`);
  }
}

export function manifestEntry(unit: LearningUnit) {
  const objectiveHashes = Object.fromEntries(unit.metadata.objectives.map((objective) => {
    const questions = unit.questions.filter((question) => question.objective_ids.includes(objective.id));
    const cards = unit.cards.filter((card) => card.objective_ids.includes(objective.id));
    return [objective.id, sha256({ objective, questions, cards })];
  }));
  const masteryHash = sha256({
    objectives: unit.metadata.objectives,
    questions: unit.questions,
    cards: unit.cards,
  });
  const enrichmentHash = sha256({
    markdown: unit.markdown,
    practices: unit.practices,
    sources: unit.sources,
  });
  const editorialHash = sha256({
    title: unit.metadata.title,
    summary: unit.metadata.summary,
    aliases: unit.metadata.aliases,
    applicable_versions: unit.metadata.applicable_versions,
    prerequisites: unit.metadata.prerequisites,
    certification_mappings: unit.metadata.certification_mappings,
    verified_at: unit.metadata.verified_at,
  });
  return {
    id: unit.metadata.id,
    slug: unit.metadata.slug,
    title: unit.metadata.title,
    summary: unit.metadata.summary,
    revision: unit.metadata.revision,
    revision_impact: unit.metadata.revision_impact,
    status: unit.metadata.status,
    layer: unit.metadata.layer,
    prerequisites: unit.metadata.prerequisites,
    aliases: unit.metadata.aliases,
    objective_hashes: objectiveHashes,
    mastery_hash: masteryHash,
    enrichment_hash: enrichmentHash,
    editorial_hash: editorialHash,
    content_hash: sha256({ masteryHash, enrichmentHash, editorialHash }),
    raw_markdown_url: `/raw/v1/units/${unit.metadata.slug}/unit.md`,
  };
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/\`\`\`[\s\S]*?\`\`\`/g, ' ')
    .replace(/\`([^\`]+)\`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function xml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character] ?? character);
}

async function collectArchiveFiles(directory: string, prefix = ''): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry);
    const relative = path.join(prefix, entry);
    if ((await stat(absolute)).isDirectory()) {
      Object.assign(files, await collectArchiveFiles(absolute, relative));
    } else {
      files[relative] = strToU8(await readFile(absolute, 'utf8'));
    }
  }
  return files;
}

async function main() {
  const units = await loadUnits();
  const pathFiles = (await readdir(path.join(contentRoot, 'paths')))
    .filter((file) => file.endsWith('.yaml'))
    .sort();
  const paths = await Promise.all(pathFiles.map((file) =>
    readYaml(path.join(contentRoot, 'paths', file), pathSchema)));
  const certifications = await readYaml(
    path.join(contentRoot, 'certifications', 'registry.yaml'),
    certificationRegistrySchema,
  );

  validateGraph(units, paths, new Set(certifications.certifications.map((item) => item.id)));
  const entries = units.map(manifestEntry);
  const verifiedAt = units
    .map((unit) => unit.metadata.verified_at)
    .concat(certifications.verified_at)
    .sort()
    .at(-1) as string;
  const manifestBody = {
    schema_version: 1,
    content_version: '2026.08.1',
    generated_at: `${verifiedAt}T00:00:00.000Z`,
    canonical_base_url: 'https://devops.hamardikan.com',
    licenses: {
      prose_and_diagrams: 'CC-BY-SA-4.0',
      application_and_examples: 'MIT',
    },
    units: entries,
    paths,
    certifications,
  };
  const manifest = {
    ...manifestBody,
    manifest_sha256: sha256(manifestBody),
  };

  if (checkOnly) {
    console.log(`Validated ${units.length} units, ${paths.length} path, and ${units.reduce((total, unit) => total + unit.cards.length, 0)} cards.`);
    return;
  }

  const rawRoot = path.join(publicRoot, 'raw', 'v1');
  await rm(rawRoot, { recursive: true, force: true });
  await mkdir(path.join(publicRoot, 'content', 'v1'), { recursive: true });
  await mkdir(path.join(root, 'src', 'generated'), { recursive: true });
  await mkdir(rawRoot, { recursive: true });
  await cp(contentRoot, rawRoot, { recursive: true });
  await writeFile(
    path.join(publicRoot, 'content', 'v1', 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'src', 'generated', 'content-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const searchIndex = units.map((unit) => ({
    id: unit.metadata.id,
    slug: unit.metadata.slug,
    title: unit.metadata.title,
    summary: unit.metadata.summary,
    layer: unit.metadata.layer,
    text: stripMarkdown(unit.markdown),
    objective_titles: unit.metadata.objectives.map((objective) => objective.title),
  }));
  await writeFile(path.join(publicRoot, 'search-index.json'), `${JSON.stringify(searchIndex)}\n`);

  const referenceCatalog = units.flatMap((unit) =>
    unit.sources.map((source) => ({ ...source, unit_id: unit.metadata.id, unit_slug: unit.metadata.slug })));
  await writeFile(path.join(publicRoot, 'references.json'), `${JSON.stringify(referenceCatalog, null, 2)}\n`);

  const llms = [
    '# DevOps by hmrdkn-labs',
    '',
    '> Question-first, portable DevOps learning material. Prose is CC BY-SA 4.0; code is MIT.',
    '',
    ...units.map((unit) =>
      `- [${unit.metadata.title}](https://devops.hamardikan.com/raw/v1/units/${unit.metadata.slug}/unit.md): ${unit.metadata.summary}`),
    '',
  ].join('\n');
  await writeFile(path.join(publicRoot, 'llms.txt'), llms);
  const llmsFull = units.map((unit) =>
    `# ${unit.metadata.title}\n\nCanonical ID: ${unit.metadata.id}\n\n${unit.markdown.trim()}\n`).join('\n---\n\n');
  await writeFile(path.join(publicRoot, 'llms-full.txt'), llmsFull);

  const feedItems = units.map((unit) => `<entry><id>urn:hmrdkn-labs:${xml(unit.metadata.id)}</id><title>${xml(unit.metadata.title)}</title><link href="https://devops.hamardikan.com/learn/${unit.metadata.slug}"/><updated>${unit.metadata.verified_at}T00:00:00Z</updated><summary>${xml(unit.metadata.summary)}</summary></entry>`).join('');
  await writeFile(path.join(publicRoot, 'feed.xml'), `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>https://devops.hamardikan.com/</id><title>DevOps by hmrdkn-labs</title><updated>${verifiedAt}T00:00:00Z</updated><link href="https://devops.hamardikan.com/feed.xml" rel="self"/>${feedItems}</feed>\n`);

  const archive = zipSync(await collectArchiveFiles(contentRoot), { level: 9 });
  await writeFile(path.join(publicRoot, 'devops-content-v1.zip'), archive);
  console.log(`Built content artifacts for ${units.length} units; manifest ${manifest.manifest_sha256.slice(0, 12)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
