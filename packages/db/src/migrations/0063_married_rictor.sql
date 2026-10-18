CREATE TABLE "workforce_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"issue_id" uuid,
	"need" jsonb NOT NULL,
	"runtime" text NOT NULL,
	"phase" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"requested_by" text NOT NULL,
	"source_commit" text NOT NULL,
	"result" jsonb,
	"wakeup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workforce_imports" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"source_commit" text NOT NULL,
	"importer_version" text NOT NULL,
	"definition" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agency_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"state" text DEFAULT 'DORMANT' NOT NULL,
	"drift" text DEFAULT 'current' NOT NULL,
	"definition" jsonb NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_commit" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workforce_activations" ADD CONSTRAINT "workforce_activations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_activations" ADD CONSTRAINT "workforce_activations_member_id_workforce_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workforce_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_activations" ADD CONSTRAINT "workforce_activations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_imports" ADD CONSTRAINT "workforce_imports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_members" ADD CONSTRAINT "workforce_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_members" ADD CONSTRAINT "workforce_members_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_activation_event_idx" ON "workforce_activations" USING btree ("company_id","event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_members_company_agency_idx" ON "workforce_members" USING btree ("company_id","agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_members_native_idx" ON "workforce_members" USING btree ("agent_id");