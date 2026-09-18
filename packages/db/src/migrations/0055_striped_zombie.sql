CREATE TABLE "business_model_canvases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"canvas_id" text NOT NULL,
	"version" text NOT NULL,
	"source_state_version" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"open_questions" jsonb NOT NULL,
	"stale_dependencies" jsonb NOT NULL,
	"overall_evidence_coverage" text NOT NULL,
	"decision" text NOT NULL,
	"status" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_model_canvases" ADD CONSTRAINT "business_model_canvases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_model_canvases" ADD CONSTRAINT "business_model_canvases_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_model_canvases" ADD CONSTRAINT "business_model_canvases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_model_canvases_company_canvas_uniq" ON "business_model_canvases" USING btree ("company_id","canvas_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "business_model_canvases_company_fingerprint_uniq" ON "business_model_canvases" USING btree ("company_id","source_fingerprint");