import { parse } from 'yaml';
import {
  cardFileSchema,
  certificationRegistrySchema,
  curriculumSchema,
  lessonSchema,
  pathSchema,
  practiceSetSchema,
  practiceFileSchema,
  questionFileSchema,
  referenceVisualFileSchema,
  sourceFileSchema,
  unitMetadataSchema,
  type CertificationRegistry,
  type Curriculum,
  type Lesson,
  type LearningPath,
  type PracticeSet,
  type LearningUnit,
} from './schema';

const markdownModules = import.meta.glob('/content/units/*/unit.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

const yamlModules = import.meta.glob('/content/{units,paths,certifications,curricula,practice,lessons}/**/*.yaml', {
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
  const visuals = readYaml(`${directory}/visuals.yaml`, referenceVisualFileSchema);
  return {
    metadata,
    markdown: markdownModules[`${directory}/unit.md`],
    questions: questions.questions,
    cards: cards.cards,
    sources: sources.sources,
    practices: practice.practices,
    visuals: visuals.visuals,
  };
});

export const unitsBySlug = new Map(units.map((unit) => [unit.metadata.slug, unit]));
export const unitsById = new Map(units.map((unit) => [unit.metadata.id, unit]));

export const paths: LearningPath[] = Object.keys(yamlModules)
  .filter((path) => path.startsWith('/content/paths/'))
  .sort()
  .map((path) => pathSchema.parse(parse(yamlModules[path])));

export const practiceSets: PracticeSet[] = Object.keys(yamlModules)
  .filter((path) => path.startsWith('/content/practice/'))
  .sort()
  .map((path) => practiceSetSchema.parse(parse(yamlModules[path])));

export const lessons: Lesson[] = Object.keys(yamlModules)
  .filter((path) => path.startsWith('/content/lessons/'))
  .sort()
  .map((path) => lessonSchema.parse(parse(yamlModules[path])));

export const lessonsBySlug = new Map(lessons.map((lesson) => [lesson.slug, lesson]));
export const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

export const curricula: Curriculum[] = Object.keys(yamlModules)
  .filter((path) => path.startsWith('/content/curricula/'))
  .sort()
  .map((path) => curriculumSchema.parse(parse(yamlModules[path])));

export const certificationRegistry: CertificationRegistry = certificationRegistrySchema.parse(
  parse(yamlModules['/content/certifications/registry.yaml']),
);
