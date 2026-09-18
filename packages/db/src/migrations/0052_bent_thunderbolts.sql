CREATE TABLE "activation_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"activation_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"required_event_types" jsonb NOT NULL,
	"value_event_type" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"source_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_cost_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"cost_observation_id" text NOT NULL,
	"account_ref" text NOT NULL,
	"cost_type" text NOT NULL,
	"amount_minor" integer,
	"currency" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"provenance" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"allocation_formula" text,
	"evidence_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"outcome_id" text NOT NULL,
	"account_ref" text NOT NULL,
	"customer_ref" text,
	"offer_id" text NOT NULL,
	"offer_version" text,
	"value_hypothesis_id" text NOT NULL,
	"evidence_class" text NOT NULL,
	"observation" text NOT NULL,
	"measurement" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"window" text,
	"confidence" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"contradictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"account_ref" text,
	"customer_ref" text,
	"opportunity_ref" text,
	"offer_id" text,
	"session_ref" text,
	"user_ref" text,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"product_version" text,
	"deployment_revision" text,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"environment" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"retention_event_id" text NOT NULL,
	"window_id" uuid,
	"account_ref" text NOT NULL,
	"type" text NOT NULL,
	"stage" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"churn_reason" text,
	"churn_reason_provenance" text,
	"referred_account_ref" text,
	"channel" text,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"window_id" text NOT NULL,
	"account_ref" text NOT NULL,
	"model" text NOT NULL,
	"definition" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"required_signal" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"source_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "value_hypotheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"value_hypothesis_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"metric" text,
	"baseline" text,
	"target" text,
	"measurement_window" text NOT NULL,
	"evidence_required" jsonb NOT NULL,
	"source_ids" jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_definitions" ADD CONSTRAINT "activation_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_cost_observations" ADD CONSTRAINT "customer_cost_observations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_outcomes" ADD CONSTRAINT "customer_outcomes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_usage_events" ADD CONSTRAINT "product_usage_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_usage_events" ADD CONSTRAINT "product_usage_events_deployment_id_company_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."company_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_events" ADD CONSTRAINT "retention_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_events" ADD CONSTRAINT "retention_events_window_id_retention_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."retention_windows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_windows" ADD CONSTRAINT "retention_windows_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_hypotheses" ADD CONSTRAINT "value_hypotheses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activation_definitions_company_activation_uniq" ON "activation_definitions" USING btree ("company_id","activation_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_cost_observations_company_cost_uniq" ON "customer_cost_observations" USING btree ("company_id","cost_observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_outcomes_company_outcome_uniq" ON "customer_outcomes" USING btree ("company_id","outcome_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_usage_events_company_event_uniq" ON "product_usage_events" USING btree ("company_id","event_id");--> statement-breakpoint
CREATE INDEX "product_usage_events_account_time_idx" ON "product_usage_events" USING btree ("company_id","account_ref","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_events_company_event_uniq" ON "retention_events" USING btree ("company_id","retention_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_windows_company_window_uniq" ON "retention_windows" USING btree ("company_id","window_id");--> statement-breakpoint
CREATE UNIQUE INDEX "value_hypotheses_company_id_uniq" ON "value_hypotheses" USING btree ("company_id","value_hypothesis_id");