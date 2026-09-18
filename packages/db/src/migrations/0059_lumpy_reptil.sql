CREATE TABLE "content_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"content_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"platform" text NOT NULL,
	"archetype" text NOT NULL,
	"objective" text NOT NULL,
	"audience" text NOT NULL,
	"source_claim_ids" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"capability_ids" jsonb NOT NULL,
	"copy" jsonb NOT NULL,
	"media" jsonb NOT NULL,
	"claim_maturity" text NOT NULL,
	"approval_id" uuid,
	"approval_status" text NOT NULL,
	"publication_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publishing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"platform" text NOT NULL,
	"display_name" text,
	"capabilities" jsonb NOT NULL,
	"status" text NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"publication_id" text NOT NULL,
	"content_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"provider" text NOT NULL,
	"platform" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_publication_id" text,
	"status" text NOT NULL,
	"public_url" text,
	"failure_code" text,
	"failure_summary" text,
	"retry_eligible" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_candidates" ADD CONSTRAINT "content_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_candidates" ADD CONSTRAINT "content_candidates_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_accounts" ADD CONSTRAINT "publishing_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_publications" ADD CONSTRAINT "social_publications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_candidates_company_content_uniq" ON "content_candidates" USING btree ("company_id","content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_accounts_company_provider_account_uniq" ON "publishing_accounts" USING btree ("company_id","provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_publications_company_publication_uniq" ON "social_publications" USING btree ("company_id","publication_id");