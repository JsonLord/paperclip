CREATE TABLE "company_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"deployment_id" text NOT NULL,
	"repository_binding_id" uuid NOT NULL,
	"provider" text DEFAULT 'huggingface_space' NOT NULL,
	"space_id" text NOT NULL,
	"space_url" text NOT NULL,
	"runtime_type" text NOT NULL,
	"deployment_ref" text,
	"health_endpoint" text NOT NULL,
	"main_endpoint" text NOT NULL,
	"current_revision" text,
	"health_state" text DEFAULT 'UNKNOWN' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone,
	"last_healthy_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"observation_id" text NOT NULL,
	"issue_id" uuid,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"source" text NOT NULL,
	"endpoint" text,
	"error_fingerprint" text NOT NULL,
	"status_code" integer,
	"summary" text NOT NULL,
	"raw_source_reference" text NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_commit" text,
	"affected_revision" text,
	"state" text DEFAULT 'OPEN' NOT NULL,
	"decision" text,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_deployments" ADD CONSTRAINT "company_deployments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_deployments" ADD CONSTRAINT "company_deployments_repository_binding_id_company_repository_bindings_id_fk" FOREIGN KEY ("repository_binding_id") REFERENCES "public"."company_repository_bindings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD CONSTRAINT "runtime_observations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD CONSTRAINT "runtime_observations_deployment_id_company_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."company_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_observations" ADD CONSTRAINT "runtime_observations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_deployments_company_deployment_uniq" ON "company_deployments" USING btree ("company_id","deployment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_deployments_company_space_uniq" ON "company_deployments" USING btree ("company_id","space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_observations_company_observation_uniq" ON "runtime_observations" USING btree ("company_id","observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_observations_deployment_fingerprint_uniq" ON "runtime_observations" USING btree ("deployment_id","error_fingerprint");--> statement-breakpoint
CREATE INDEX "runtime_observations_company_state_idx" ON "runtime_observations" USING btree ("company_id","state");