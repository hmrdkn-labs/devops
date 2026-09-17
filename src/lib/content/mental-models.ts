import { parse } from 'yaml';
import { mentalModelSchema, type MentalModel } from './mental-model-schema';

const files = import.meta.glob('/content/mental-models/*.yaml', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

export const mentalModels: MentalModel[] = Object.keys(files).sort()
  .map((file) => mentalModelSchema.parse(parse(files[file])));
export const mentalModelsBySlug = new Map(mentalModels.map((model) => [model.slug, model]));
export const mentalModelsByUnitId = new Map<string, MentalModel[]>();
for (const model of mentalModels) {
  for (const unitId of model.unit_ids) {
    mentalModelsByUnitId.set(unitId, [...(mentalModelsByUnitId.get(unitId) ?? []), model]);
  }
}
