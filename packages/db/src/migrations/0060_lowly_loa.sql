CREATE TABLE "campaign_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"content_id" text,
	"channel" text NOT NULL,
	"variant" text,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"provider_publication_id" text,
	"subject_ref" text,
	"qualification" text NOT NULL,
	"attribution" text NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_atoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"atom_id" text NOT NULL,
	"atom_type" text NOT NULL,
	"source_claim_ids" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"classification" text NOT NULL,
	"maturity" text NOT NULL,
	"allowed_language" text NOT NULL,
	"privacy_state" text NOT NULL,
	"freshness" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"strategy_id" text NOT NULL,
	"version" text NOT NULL,
	"kind" text NOT NULL,
	"source_state_version" text NOT NULL,
	"contract" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gtm_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"contract" jsonb NOT NULL,
	"message_map" jsonb NOT NULL,
	"status" text NOT NULL,
	"decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_atoms" ADD CONSTRAINT "content_atoms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_strategies" ADD CONSTRAINT "content_strategies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gtm_campaigns" ADD CONSTRAINT "gtm_campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_events_company_event_uniq" ON "campaign_events" USING btree ("company_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_atoms_company_atom_uniq" ON "content_atoms" USING btree ("company_id","atom_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_strategies_company_id_version_uniq" ON "content_strategies" USING btree ("company_id","strategy_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "gtm_campaigns_company_campaign_uniq" ON "gtm_campaigns" USING btree ("company_id","campaign_id");