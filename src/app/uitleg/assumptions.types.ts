export type AssumptionTheme = 'opwek' | 'balans' | 'kosten' | 'waterstof' | 'kritisch';

export type AssumptionEntry = {
  id: string;
  theme: AssumptionTheme;
  title: string;
  assumption: string;
  formula: string;
  source: string;
  impact: string;
  criticalNote: string;
  isAdjustable: boolean;
  adjustableVia?: string;
  tags: string[];
};

export type AssumptionQaAnswer = {
  answer: string;
  confidence: 'hoog' | 'middel' | 'laag';
  matchedEntries: AssumptionEntry[];
};

export type GlobalPictureItem = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
};

export type FaqEntry = {
  id: string;
  question: string;
  shortAnswer: string;
  detailedAnswer: string;
  detailedBullets?: string[];
  relatedAssumptionIds: string[];
  tags: string[];
};
