import type { GoalLevel, GoalStatus } from "../constants.js";

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  level: GoalLevel;
  status: GoalStatus;
  parentId: string | null;
  ownerAgentId: string | null;
  requiredSkills: string[];
  supportPacks: GoalSupportPackRef[];
  requiredCapabilities: string[];
  inputPaths: string[];
  outputPaths: string[];
  acceptanceCriteria: string[];
  cannotCompleteIf: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalSupportPackRef {
  id: string;
  version?: string;
  required?: boolean;
}
