import type { ID, ISODateString } from './common';

export type SkillSource = 'builtin' | 'marketplace' | 'user' | 'community';
export type SkillScanStatus = 'pending' | 'scanning' | 'passed' | 'rejected' | 'warning';

export interface Skill {
  name: string;
  description: string;
  source: SkillSource;
  enabled: boolean;
  installed_at?: ISODateString;
  scan_status?: SkillScanStatus;
  scan_result?: SkillScanResult;
  version?: string;
  author?: string;
  tags?: string[];
}

export interface SkillScanResult {
  status: SkillScanStatus;
  findings: SkillFinding[];
  scanned_at: ISODateString;
}

export interface SkillFinding {
  severity: 'info' | 'warning' | 'error';
  message: string;
  location?: string;
}

export type ID2 = ID; // re-export to satisfy tooling
