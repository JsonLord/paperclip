CREATE TABLE "financial_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"version" text NOT NULL,
	"source_state_version" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"template_id" text NOT NULL,
	"template_version" text NOT NULL,
	"horizon" jsonb NOT NULL,
	"canonical_model" jsonb NOT NULL,
	"decision" text NOT NULL,
	"status" text NOT NULL,
	"workbook_status" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"financial_plan_id" uuid NOT NULL,
	"assumption_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"value" text,
	"range" jsonb,
	"unit" text NOT NULL,
	"period" text NOT NULL,
	"start_period" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"basis" text NOT NULL,
	"confidence" text NOT NULL,
	"scenario" text NOT NULL,
	"sensitivity" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_plans" ADD CONSTRAINT "financial_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_plans" ADD CONSTRAINT "financial_plans_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_plans" ADD CONSTRAINT "financial_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_assumptions" ADD CONSTRAINT "forecast_assumptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_assumptions" ADD CONSTRAINT "forecast_assumptions_financial_plan_id_financial_plans_id_fk" FOREIGN KEY ("financial_plan_id") REFERENCES "public"."financial_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_plans_company_plan_version_uniq" ON "financial_plans" USING btree ("company_id","plan_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_plans_company_fingerprint_uniq" ON "financial_plans" USING btree ("company_id","source_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_assumptions_company_assumption_uniq" ON "forecast_assumptions" USING btree ("company_id","assumption_id","scenario");