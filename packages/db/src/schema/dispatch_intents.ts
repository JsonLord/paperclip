import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// GATE05-R WP3: durable idempotent dispatch ledger.
//
// The October 24 incident showed a qualification wake could be attempted several
// times for the same activation, with no persistent record proving whether a
// provider session had already been created. This table makes one campaign
// activation key map to exactly one dispatch record; every state transition is
// a compare-and-swap on the current state, and a replayed key is answered from
// the stored row instead of waking anything again.
//
// State machine (transitions are CAS-guarded in the service layer):
//   INTENT -> DISPATCHED -> CONFIRMED
//                        -> FAILED    (pre-allocation: no provider session exists)
//                        -> UNKNOWN   (session may exist; reconcile before any retry)
// Re-dispatching a FAILED activation requires a NEW activation key; a key that
// reached UNKNOWN blocks forever until explicitly reconciled.
export const dispatchIntents = pgTable(
  "dispatch_intents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    companyId: uuid("company_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    issueId: uuid("issue_id"),
    activationKey: text("activation_key").notNull(),
    fencingToken: bigint("fencing_token", { mode: "number" }).notNull(),
    controllerId: text("controller_id").notNull(),
    // INTENT | DISPATCHED | CONFIRMED | FAILED | UNKNOWN
    state: text("state").notNull().default("INTENT"),
    runId: uuid("run_id"),
    externalSessionId: text("external_session_id"),
    errorCode: text("error_code"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("dispatch_intents_activation_uniq").on(table.activationKey),
    index("dispatch_intents_company_state_idx").on(table.companyId, table.state),
    index("dispatch_intents_agent_idx").on(table.agentId),
  ],
);
