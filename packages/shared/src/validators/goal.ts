import { z } from "zod";
import { GOAL_LEVELS, GOAL_STATUSES } from "../constants.js";

export const createGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  level: z.enum(GOAL_LEVELS).optional().default("task"),
  status: z.enum(GOAL_STATUSES).optional().default("planned"),
  parentId: z.string().uuid().optional().nullable(),
  ownerAgentId: z.string().uuid().optional().nullable(),
  requiredSkills: z.array(z.string().min(1)).default([]),
  supportPacks: z.array(z.object({ id: z.string().min(1), version: z.string().min(1).optional(), required: z.boolean().default(true) })).default([]),
  requiredCapabilities: z.array(z.string().min(1)).default([]),
  inputPaths: z.array(z.string().min(1)).default([]),
  outputPaths: z.array(z.string().min(1)).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  cannotCompleteIf: z.array(z.string().min(1)).default([]),
});

export type CreateGoal = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = createGoalSchema.partial();

export type UpdateGoal = z.infer<typeof updateGoalSchema>;
