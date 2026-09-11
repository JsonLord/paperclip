ALTER TABLE "companies" ADD COLUMN "firm_github_repo" text;
ALTER TABLE "companies" ADD COLUMN "firm_last_refreshed_at" timestamp with time zone;

CREATE TABLE "firm_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_repo" text NOT NULL,
	"commit_sha" text,
	"snapshot_json" jsonb NOT NULL,
	"context_markdown" text NOT NULL,
	"is_latest" boolean DEFAULT true NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "firm_snapshots" ADD CONSTRAINT "firm_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "firm_snapshots_company_idx" ON "firm_snapshots" USING btree ("company_id");
CREATE INDEX "firm_snapshots_latest_idx" ON "firm_snapshots" USING btree ("company_id","is_latest");
