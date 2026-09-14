import { z } from "zod";

export const createJulesProfileSchema = z.object({
  name: z.string().min(1), secretRef: z.string().min(1), plan: z.string().optional(),
  sessionStartLimit: z.number().int().positive().default(15), sessionStartWindowSec: z.number().int().positive().default(86400),
  concurrentSessionLimit: z.number().int().positive().default(3), reserveSessionStarts: z.number().int().nonnegative().default(1),
  capabilities: z.array(z.string().min(1)).default([]),
});
export const bindJulesSourceSchema = z.object({
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/), source: z.string().min(1), startingBranch: z.string().min(1).default("main"),
  requiredCapabilities: z.array(z.string().min(1)).default([]), profileIds: z.array(z.string().uuid()).default([]),
});
export const julesCallbackSchema = z.object({ eventId: z.string().min(1), summary: z.string().optional() }).passthrough();
export type CreateJulesProfile = z.infer<typeof createJulesProfileSchema>;
export type BindJulesSource = z.infer<typeof bindJulesSourceSchema>;
