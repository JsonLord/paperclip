CREATE TABLE "competitor_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"competitor_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"customer_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observed_offering" text,
	"pricing_claim" text,
	"pricing_source_id" text,
	"target_customer" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"claim_id" text NOT NULL,
	"claim" text NOT NULL,
	"classification" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"customer_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contradicts_claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"estimate_id" text NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"formula" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"value" text NOT NULL,
	"currency" text NOT NULL,
	"geography" text NOT NULL,
	"segment" text NOT NULL,
	"confidence" text NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"url" text,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone,
	"reliability" text NOT NULL,
	"content_hash" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_records" ADD CONSTRAINT "competitor_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_claims" ADD CONSTRAINT "market_claims_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_estimates" ADD CONSTRAINT "market_estimates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_estimates" ADD CONSTRAINT "market_estimates_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_sources" ADD CONSTRAINT "market_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_records_company_competitor_uniq" ON "competitor_records" USING btree ("company_id","competitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_claims_company_claim_uniq" ON "market_claims" USING btree ("company_id","claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_estimates_company_estimate_uniq" ON "market_estimates" USING btree ("company_id","estimate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_sources_company_source_uniq" ON "market_sources" USING btree ("company_id","source_id");--> statement-breakpoint
CREATE INDEX "market_sources_company_idx" ON "market_sources" USING btree ("company_id");