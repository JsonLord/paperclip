CREATE TABLE "commercial_commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"interaction_db_id" uuid,
	"commitment_id" text NOT NULL,
	"kind" text NOT NULL,
	"strength" integer NOT NULL,
	"binding_status" text NOT NULL,
	"paid_status" text NOT NULL,
	"amount_minor" integer,
	"currency" text,
	"source_ref" text NOT NULL,
	"verified_system_event_id" text,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prospect_db_id" uuid NOT NULL,
	"interaction_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"collector" text NOT NULL,
	"raw_provenance" jsonb NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"prospect_id" text NOT NULL,
	"account_name" text NOT NULL,
	"canonical_domain" text,
	"registry_id" text,
	"canonical_url" text,
	"contact_ref" text,
	"qualification" text NOT NULL,
	"qualification_rationale" jsonb NOT NULL,
	"field_provenance" jsonb NOT NULL,
	"suppressed" boolean DEFAULT false NOT NULL,
	"suppression_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quote_id" text NOT NULL,
	"prospect_db_id" uuid NOT NULL,
	"offer_id" text NOT NULL,
	"currency" text NOT NULL,
	"price_minor" integer NOT NULL,
	"billing_model" text NOT NULL,
	"scope" text NOT NULL,
	"terms" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"source_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "commercial_commitments" ADD CONSTRAINT "commercial_commitments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_commitments" ADD CONSTRAINT "commercial_commitments_interaction_db_id_sales_interactions_id_fk" FOREIGN KEY ("interaction_db_id") REFERENCES "public"."sales_interactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_interactions" ADD CONSTRAINT "sales_interactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_interactions" ADD CONSTRAINT "sales_interactions_prospect_db_id_sales_prospects_id_fk" FOREIGN KEY ("prospect_db_id") REFERENCES "public"."sales_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_prospects" ADD CONSTRAINT "sales_prospects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_quotes" ADD CONSTRAINT "sales_quotes_prospect_db_id_sales_prospects_id_fk" FOREIGN KEY ("prospect_db_id") REFERENCES "public"."sales_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_commitments_company_commitment_uniq" ON "commercial_commitments" USING btree ("company_id","commitment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_interactions_company_interaction_uniq" ON "sales_interactions" USING btree ("company_id","interaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_prospects_company_prospect_uniq" ON "sales_prospects" USING btree ("company_id","prospect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_prospects_company_domain_uniq" ON "sales_prospects" USING btree ("company_id","canonical_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_quotes_company_quote_uniq" ON "sales_quotes" USING btree ("company_id","quote_id");