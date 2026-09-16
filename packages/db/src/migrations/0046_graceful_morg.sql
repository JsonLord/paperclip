CREATE TABLE "founderos_content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"repository" text NOT NULL,
	"ref" text NOT NULL,
	"commit" text NOT NULL,
	"package_root" text DEFAULT 'company-package' NOT NULL,
	"registry_version" text NOT NULL,
	"content_version" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "founderos_system_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"system_id" text NOT NULL,
	"system_version" text NOT NULL,
	"project_id" uuid NOT NULL,
	"source_repository" text NOT NULL,
	"source_commit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_template_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"parent_goal_id" uuid,
	"template_id" text NOT NULL,
	"template_version" text NOT NULL,
	"system_id" text NOT NULL,
	"source_repository" text NOT NULL,
	"source_commit" text NOT NULL,
	"contract_snapshot" jsonb NOT NULL,
	"lifecycle" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "founderos_content_sources" ADD CONSTRAINT "founderos_content_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founderos_system_activations" ADD CONSTRAINT "founderos_system_activations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founderos_system_activations" ADD CONSTRAINT "founderos_system_activations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_template_instances" ADD CONSTRAINT "goal_template_instances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_template_instances" ADD CONSTRAINT "goal_template_instances_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_template_instances" ADD CONSTRAINT "goal_template_instances_parent_goal_id_goals_id_fk" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "founderos_content_sources_company_repo_commit_uniq" ON "founderos_content_sources" USING btree ("company_id","repository","commit");--> statement-breakpoint
CREATE INDEX "founderos_content_sources_company_idx" ON "founderos_content_sources" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "founderos_system_activations_company_system_uniq" ON "founderos_system_activations" USING btree ("company_id","system_id","system_version");--> statement-breakpoint
CREATE UNIQUE INDEX "founderos_system_activations_project_uniq" ON "founderos_system_activations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_template_instances_active_logical_uniq" ON "goal_template_instances" USING btree ("company_id","template_id","template_version","parent_goal_id","lifecycle");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_template_instances_goal_uniq" ON "goal_template_instances" USING btree ("goal_id");