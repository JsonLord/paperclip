import { z } from "zod";

// GATE05-R WP3: durable idempotent dispatch contracts.

export const activateDispatchSchema = z.object({
  agentId: z.string().min(1).max(64),
  issueId: z.string().min(1).max(64).optional(),
  activationKey: z.string().min(8).max(200),
  controllerId: z.string().min(1).max(200),
  fencingToken: z.number().int().nonnegative(),
});

export const reconcileDispatchSchema = z.object({
  activationKey: z.string().min(8).max(200),
  controllerId: z.string().min(1).max(200),
  fencingToken: z.number().int().nonnegative(),
  outcome: z.enum(["confirmed", "pre_allocation_failure", "unknown"]),
  runId: z.string().min(1).max(64).optional(),
  externalSessionId: z.string().min(1).max(200).optional(),
  errorCode: z.string().min(1).max(200).optional(),
  noSessionConfirmed: z.boolean().optional(),
});

export type ActivateDispatch = z.infer<typeof activateDispatchSchema>;
export type ReconcileDispatch = z.infer<typeof reconcileDispatchSchema>;
