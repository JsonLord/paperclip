CREATE TABLE "company_repository_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"repository" text NOT NULL,
	"repository_id" text,
	"default_branch" text NOT NULL,
	"import_ref" text NOT NULL,
	"import_commit" text NOT NULL,
	"workspace_root" text DEFAULT '/' NOT NULL,
	"firm_path" text DEFAULT 'firm/' NOT NULL,
	"founderos_path" text DEFAULT '.founderos/' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "founderos_bootstraps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"repository_binding_id" uuid NOT NULL,
	"context_version" text NOT NULL,
	"source_repository" text NOT NULL,
	"source_commit" text NOT NULL,
	"installed_commit" text,
	"status" text NOT NULL,
	"native_ids" jsonb,
	"seed_inspection" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"drift" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_repository_bindings" ADD CONSTRAINT "company_repository_bindings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founderos_bootstraps" ADD CONSTRAINT "founderos_bootstraps_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "founderos_bootstraps" ADD CONSTRAINT "founderos_bootstraps_repository_binding_id_company_repository_bindings_id_fk" FOREIGN KEY ("repository_binding_id") REFERENCES "public"."company_repository_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_repository_bindings_company_uniq" ON "company_repository_bindings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_repository_bindings_repo_idx" ON "company_repository_bindings" USING btree ("repository");--> statement-breakpoint
CREATE UNIQUE INDEX "founderos_bootstraps_company_version_uniq" ON "founderos_bootstraps" USING btree ("company_id","context_version");--> statement-breakpoint
CREATE INDEX "founderos_bootstraps_company_status_idx" ON "founderos_bootstraps" USING btree ("company_id","status");