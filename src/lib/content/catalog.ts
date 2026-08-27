import { parse } from 'yaml';
import {
  cardFileSchema,
  certificationRegistrySchema,
  pathSchema,
  practiceFileSchema,
  questionFileSchema,
  sourceFileSchema,
  unitMetadataSchema,
  type CertificationRegistry,
  type LearningPath,
  type LearningUnit,
} from './schema';

const markdownModules = import.meta.glob('/content/units/*/unit.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const yamlModules = import.meta.glob('/content/{units,paths,certifications}/**/*.yaml', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const readYaml = <T>(path: string, parser: { parse(value: unknown): T }): T => {
  const raw = yamlModules[path];
  if (!raw) throw new Error(`Missing canonical content file: ${path}`);
  return parser.parse(parse(raw));
};

const unitDirs = Object.keys(markdownModules)
  .map((path) => path.replace(/\/unit\.md$/, ''))
  .sort();

export const units: LearningUnit[] = unitDirs.map((directory) => {
  const metadata = readYaml(`${directory}/metadata.yaml`, unitMetadataSchema);
  const questions = readYaml(`${directory}/questions.yaml`, questionFileSchema);
  const cards = readYaml(`${directory}/cards.yaml`, cardFileSchema);
  const sources = readYaml(`${directory}/sources.yaml`, sourceFileSchema);
  const practice = readYaml(`${directory}/practice.yaml`, practiceFileSchema);
  return {
    metadata,
    markdown: markdownModules[`${directory}/unit.md`],
    questions: questions.questions,
    cards: cards.cards,
    sources: sources.sources,
    practices: practice.practices,
  };
});

export const unitsBySlug = new Map(units.map((unit) => [unit.metadata.slug, unit]));
export const unitsById = new Map(units.map((unit) => [unit.metadata.id, unit]));

export const paths: LearningPath[] = Object.keys(yamlModules)
  .filter((path) => path.startsWith('/content/paths/'))
  .sort()
  .map((path) => pathSchema.parse(parse(yamlModules[path])));

export const certificationRegistry: CertificationRegistry = certificationRegistrySchema.parse(
  parse(yamlModules['/content/certifications/registry.yaml']),
);
