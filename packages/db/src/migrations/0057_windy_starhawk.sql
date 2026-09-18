CREATE TABLE "business_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"version" text NOT NULL,
	"source_state_version" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"bpw_resource_version" text NOT NULL,
	"chapters" jsonb NOT NULL,
	"claim_evidence_map" jsonb NOT NULL,
	"sources" jsonb NOT NULL,
	"risks" jsonb NOT NULL,
	"readiness" jsonb NOT NULL,
	"decision" text NOT NULL,
	"status" text NOT NULL,
	"render_status" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_plans" ADD CONSTRAINT "business_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_plans_company_plan_version_uniq" ON "business_plans" USING btree ("company_id","plan_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "business_plans_company_fingerprint_uniq" ON "business_plans" USING btree ("company_id","source_fingerprint");