CREATE TABLE "dispatch_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"issue_id" uuid,
	"activation_key" text NOT NULL,
	"fencing_token" bigint NOT NULL,
	"controller_id" text NOT NULL,
	"state" text DEFAULT 'INTENT' NOT NULL,
	"run_id" uuid,
	"external_session_id" text,
	"error_code" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dispatch_intents" ADD CONSTRAINT "dispatch_intents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_intents_activation_uniq" ON "dispatch_intents" USING btree ("activation_key");
--> statement-breakpoint
CREATE INDEX "dispatch_intents_company_state_idx" ON "dispatch_intents" USING btree ("company_id", "state");
--> statement-breakpoint
CREATE INDEX "dispatch_intents_agent_idx" ON "dispatch_intents" USING btree ("agent_id");
