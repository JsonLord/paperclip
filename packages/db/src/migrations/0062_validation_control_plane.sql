CREATE TABLE "github_action_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"paperclip_run_id" uuid NOT NULL,
	"issue_id" uuid,
	"repository" text NOT NULL,
	"workflow" text NOT NULL,
	"ref" text NOT NULL,
	"external_run_id" text,
	"status" text DEFAULT 'prepared' NOT NULL,
	"conclusion" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"artifacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dispatched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_action_runs_paperclip_run_id_unique" UNIQUE("paperclip_run_id")
);
--> statement-breakpoint
CREATE TABLE "jules_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_key" text NOT NULL,
	"daily_starts" integer DEFAULT 90 NOT NULL,
	"window_sec" integer DEFAULT 86400 NOT NULL,
	"concurrency" integer DEFAULT 3 NOT NULL,
	CONSTRAINT "jules_pools_account_key_unique" UNIQUE("account_key")
);
--> statement-breakpoint
CREATE TABLE "nodepad_bindings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"base_url" text NOT NULL,
	"workspace_id" text NOT NULL,
	"api_key_secret_ref" uuid NOT NULL,
	"snapshot" jsonb,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "validation_programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"ceo_agent_id" uuid NOT NULL,
	"vision_goal_id" uuid NOT NULL,
	"direction_issue_id" uuid NOT NULL,
	"phase" text DEFAULT 'EXPLORE' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phase_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"pauses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phase_adjustments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy" jsonb NOT NULL,
	"founder_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_programmes_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "validation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"phase" text NOT NULL,
	"actor_id" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "validation_task" jsonb;--> statement-breakpoint
ALTER TABLE "jules_profiles" ADD COLUMN "pool_id" uuid;--> statement-breakpoint
ALTER TABLE "github_action_runs" ADD CONSTRAINT "github_action_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_action_runs" ADD CONSTRAINT "github_action_runs_paperclip_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("paperclip_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_action_runs" ADD CONSTRAINT "github_action_runs_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodepad_bindings" ADD CONSTRAINT "nodepad_bindings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_programmes" ADD CONSTRAINT "validation_programmes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_programmes" ADD CONSTRAINT "validation_programmes_ceo_agent_id_agents_id_fk" FOREIGN KEY ("ceo_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_programmes" ADD CONSTRAINT "validation_programmes_vision_goal_id_goals_id_fk" FOREIGN KEY ("vision_goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_programmes" ADD CONSTRAINT "validation_programmes_direction_issue_id_issues_id_fk" FOREIGN KEY ("direction_issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_records" ADD CONSTRAINT "validation_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nodepad_binding_workspace_idx" ON "nodepad_bindings" USING btree ("base_url","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_records_company_key_idx" ON "validation_records" USING btree ("company_id","kind","idempotency_key");--> statement-breakpoint
INSERT INTO "jules_pools" ("id", "account_key", "daily_starts", "window_sec", "concurrency")
VALUES ('00000000-0000-4000-8000-000000000090', 'paperclip-validation-shared', 90, 86400, 3)
ON CONFLICT DO NOTHING;

--> statement-breakpoint
ALTER TABLE "jules_profiles" ALTER COLUMN "pool_id" SET DEFAULT '00000000-0000-4000-8000-000000000090';--> statement-breakpoint
UPDATE "jules_profiles" SET "pool_id" = '00000000-0000-4000-8000-000000000090' WHERE "pool_id" IS NULL;--> statement-breakpoint
ALTER TABLE "jules_profiles" ALTER COLUMN "pool_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jules_profiles" ADD CONSTRAINT "jules_profiles_pool_id_jules_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."jules_pools"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "github_action_runs" ADD COLUMN "credential_secret_ref" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "validation_programmes" ADD COLUMN "runtime_bindings" jsonb DEFAULT '{}'::jsonb NOT NULL;
