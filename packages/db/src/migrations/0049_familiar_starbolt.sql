CREATE TABLE "demand_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"experiment_db_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"subject_ref" text,
	"channel" text NOT NULL,
	"landing_path" text NOT NULL,
	"raw_event_source" text NOT NULL,
	"traffic_qualification" text NOT NULL,
	"environment" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"experiment_id" text NOT NULL,
	"version" integer NOT NULL,
	"offer_id" text NOT NULL,
	"hypothesis" text NOT NULL,
	"target_segment" text NOT NULL,
	"channel" text NOT NULL,
	"variants" jsonb NOT NULL,
	"primary_metric" text NOT NULL,
	"secondary_metrics" jsonb NOT NULL,
	"success_threshold" text NOT NULL,
	"failure_threshold" text NOT NULL,
	"minimum_sample" integer NOT NULL,
	"stop_conditions" jsonb NOT NULL,
	"duration" text NOT NULL,
	"external_actions" jsonb NOT NULL,
	"budget_limit_cents" integer NOT NULL,
	"deployment_target" text NOT NULL,
	"analytics_plan" text NOT NULL,
	"ethical_disclosure" text NOT NULL,
	"decision_rules" jsonb NOT NULL,
	"contract_hash" text NOT NULL,
	"launched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_hypotheses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"offer_id" text NOT NULL,
	"target_segment_id" text NOT NULL,
	"problem_claim_ids" jsonb NOT NULL,
	"jtbd_ids" jsonb NOT NULL,
	"value_proposition" text NOT NULL,
	"delivery_form" text NOT NULL,
	"scope" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"price_hypothesis" text,
	"pricing_status" text NOT NULL,
	"risk_reversal" text,
	"cta" text NOT NULL,
	"switching_assumptions" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"assumption_ids" jsonb NOT NULL,
	"confidence" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demand_events" ADD CONSTRAINT "demand_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_events" ADD CONSTRAINT "demand_events_experiment_db_id_demand_experiments_id_fk" FOREIGN KEY ("experiment_db_id") REFERENCES "public"."demand_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_experiments" ADD CONSTRAINT "demand_experiments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_experiments" ADD CONSTRAINT "demand_experiments_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_experiments" ADD CONSTRAINT "demand_experiments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_hypotheses" ADD CONSTRAINT "offer_hypotheses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demand_events_experiment_event_uniq" ON "demand_events" USING btree ("experiment_db_id","event_id");--> statement-breakpoint
CREATE INDEX "demand_events_experiment_idx" ON "demand_events" USING btree ("experiment_db_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demand_experiments_company_exp_version_uniq" ON "demand_experiments" USING btree ("company_id","experiment_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_hypotheses_company_offer_uniq" ON "offer_hypotheses" USING btree ("company_id","offer_id");