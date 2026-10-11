export interface AnatomyPage {
  slug: string;
  title: string;
  summary: string;
  module: string;
  order: number;
  revision: number;
  verifiedAt: string;
  unitIds: string[];
  objectiveIds: string[];
  sources: Array<{ title: string; url: string }>;
}
