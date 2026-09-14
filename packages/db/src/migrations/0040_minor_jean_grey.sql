CREATE TABLE "resource_pack_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"version" text NOT NULL,
	"tier" text NOT NULL,
	"installed_path" text NOT NULL,
	"source_repo" text NOT NULL,
	"source_commit" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "required_skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "support_packs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "required_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "input_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "output_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "acceptance_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "cannot_complete_if" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_pack_snapshots" ADD CONSTRAINT "resource_pack_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_pack_snapshots_company_pack_version_uniq" ON "resource_pack_snapshots" USING btree ("company_id","pack_id","version");--> statement-breakpoint
CREATE INDEX "resource_pack_snapshots_company_tier_idx" ON "resource_pack_snapshots" USING btree ("company_id","tier");