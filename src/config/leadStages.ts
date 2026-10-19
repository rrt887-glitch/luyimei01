import type { LeadStage } from '../types/admin';

export type Tone = 'sky' | 'indigo' | 'amber' | 'violet' | 'emerald' | 'rose' | 'slate';

export interface StageConfig {
  key: LeadStage;
  label: string;
  tone: Tone;
}

/** One definition of the lead pipeline, shared by the dashboard, the CRM and the quotation picker. */
export const LEAD_STAGES: StageConfig[] = [
  { key: 'new', label: '新线索', tone: 'sky' },
  { key: 'following', label: '跟进中', tone: 'indigo' },
  { key: 'quoted', label: '已报价', tone: 'amber' },
  { key: 'negotiating', label: '谈判中', tone: 'violet' },
  { key: 'won', label: '已成交', tone: 'emerald' },
  { key: 'lost', label: '已归档', tone: 'slate' }
];

export const STAGE_BAR_COLORS: Record<LeadStage, string> = {
  new: '#38bdf8',
  following: '#6366f1',
  quoted: '#f2a516',
  negotiating: '#8b5cf6',
  won: '#10b981',
  lost: '#cbd5e1'
};

export function getStage(key: LeadStage | string | undefined): StageConfig {
  return LEAD_STAGES.find(s => s.key === key) || LEAD_STAGES[0];
}
