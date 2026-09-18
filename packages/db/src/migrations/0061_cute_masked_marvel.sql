CREATE TABLE "crowdfunding_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"version" text NOT NULL,
	"source_state_version" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"campaign" jsonb NOT NULL,
	"readiness" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowdfunding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"amount" text,
	"currency" text,
	"subject_ref" text,
	"evidence_ids" jsonb NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crowdfunding_campaigns" ADD CONSTRAINT "crowdfunding_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowdfunding_events" ADD CONSTRAINT "crowdfunding_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crowdfunding_campaigns_company_campaign_version_uniq" ON "crowdfunding_campaigns" USING btree ("company_id","campaign_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "crowdfunding_campaigns_company_fingerprint_uniq" ON "crowdfunding_campaigns" USING btree ("company_id","source_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "crowdfunding_events_company_event_uniq" ON "crowdfunding_events" USING btree ("company_id","event_id");