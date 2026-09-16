CREATE TABLE "artifact_staleness" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"artifact" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_id" text NOT NULL,
	"affected_dependency" text NOT NULL,
	"stale_since" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"interaction_db_id" uuid NOT NULL,
	"evidence_id" text NOT NULL,
	"evidence_class" text NOT NULL,
	"kind" text NOT NULL,
	"statement" text NOT NULL,
	"reference_location" text,
	"extractor" text NOT NULL,
	"confidence" integer NOT NULL,
	"contradicts_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"interaction_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text NOT NULL,
	"participant_ref" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"collector" text NOT NULL,
	"raw_provenance" jsonb NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"content_hash" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_waits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"reason" text NOT NULL,
	"wake_conditions" jsonb NOT NULL,
	"status" text DEFAULT 'WAITING_FOR_MARKET' NOT NULL,
	"woken_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"woken_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "artifact_staleness" ADD CONSTRAINT "artifact_staleness_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_evidence" ADD CONSTRAINT "customer_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_evidence" ADD CONSTRAINT "customer_evidence_interaction_db_id_customer_interactions_id_fk" FOREIGN KEY ("interaction_db_id") REFERENCES "public"."customer_interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_waits" ADD CONSTRAINT "market_waits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_waits" ADD CONSTRAINT "market_waits_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_waits" ADD CONSTRAINT "market_waits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_waits" ADD CONSTRAINT "market_waits_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_staleness_artifact_evidence_uniq" ON "artifact_staleness" USING btree ("company_id","artifact","evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_evidence_company_evidence_uniq" ON "customer_evidence" USING btree ("company_id","evidence_id");--> statement-breakpoint
CREATE INDEX "customer_evidence_interaction_idx" ON "customer_evidence" USING btree ("interaction_db_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_interactions_company_interaction_uniq" ON "customer_interactions" USING btree ("company_id","interaction_id");--> statement-breakpoint
CREATE INDEX "customer_interactions_goal_idx" ON "customer_interactions" USING btree ("goal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_waits_issue_status_uniq" ON "market_waits" USING btree ("issue_id","status");--> statement-breakpoint
CREATE INDEX "market_waits_company_idx" ON "market_waits" USING btree ("company_id");