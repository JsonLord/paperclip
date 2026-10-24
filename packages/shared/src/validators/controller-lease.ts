import { z } from "zod";

// GATE05-R WP2: durable single-controller ownership contracts.

export const acquireControllerLeaseSchema = z.object({
  controllerId: z.string().min(1).max(200),
  leaseTtlMs: z.number().int().positive().max(86_400_000).optional(),
});

export const verifyControllerLeaseSchema = z.object({
  controllerId: z.string().min(1).max(200),
  fencingToken: z.number().int().nonnegative(),
});

export const releaseControllerLeaseSchema = z.object({
  controllerId: z.string().min(1).max(200),
  fencingToken: z.number().int().nonnegative(),
  reason: z.string().min(1).max(500),
});

export type AcquireControllerLease = z.infer<typeof acquireControllerLeaseSchema>;
export type VerifyControllerLease = z.infer<typeof verifyControllerLeaseSchema>;
export type ReleaseControllerLease = z.infer<typeof releaseControllerLeaseSchema>;
