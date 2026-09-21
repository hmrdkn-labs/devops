import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { practiceSetSchema } from '../../src/lib/content/schema';

const practice = practiceSetSchema.parse(parse(readFileSync(
  new URL('../../content/practice/kcna-mcq.yaml', import.meta.url),
  'utf8',
)));

export const kcnaQuestionCount = practice.questions.length;
export const kcnaAllQuestionsLabel = `All ${kcnaQuestionCount}`;
