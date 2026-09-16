CREATE TABLE "jules_manager_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"validation_id" uuid NOT NULL,
	"paperclip_run_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"confidence" integer NOT NULL,
	"reason" text NOT NULL,
	"passed_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision_instructions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requires_human" boolean NOT NULL,
	"recommended_wait_condition" text,
	"recommended_next_action" text,
	"provider" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jules_validation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid,
	"project_id" uuid,
	"issue_id" uuid,
	"agent_id" uuid NOT NULL,
	"paperclip_run_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"validated_commit" text NOT NULL,
	"contract_hash" text NOT NULL,
	"validator_version" text NOT NULL,
	"status" text NOT NULL,
	"hard_failure" boolean NOT NULL,
	"passed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "retry_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "retry_of_session_id" uuid;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "retry_of_run_id" uuid;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "retry_reason" text;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "wait_reason" text;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "wait_condition" text;--> statement-breakpoint
ALTER TABLE "jules_manager_decisions" ADD CONSTRAINT "jules_manager_decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_manager_decisions" ADD CONSTRAINT "jules_manager_decisions_session_id_jules_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."jules_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_manager_decisions" ADD CONSTRAINT "jules_manager_decisions_validation_id_jules_validation_results_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."jules_validation_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_manager_decisions" ADD CONSTRAINT "jules_manager_decisions_paperclip_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("paperclip_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_validation_results" ADD CONSTRAINT "jules_validation_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_validation_results" ADD CONSTRAINT "jules_validation_results_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_validation_results" ADD CONSTRAINT "jules_validation_results_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_validation_results" ADD CONSTRAINT "jules_validation_results_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_validation_results" ADD CONSTRAINT "jules_validation_results_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_validation_results" ADD CONSTRAINT "jules_validation_results_paperclip_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("paperclip_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_validation_results" ADD CONSTRAINT "jules_validation_results_session_id_jules_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."jules_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jules_manager_decisions_validation_uniq" ON "jules_manager_decisions" USING btree ("validation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jules_validation_results_commit_contract_uniq" ON "jules_validation_results" USING btree ("session_id","validated_commit","contract_hash","validator_version");--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD CONSTRAINT "jules_sessions_retry_of_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("retry_of_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;