CREATE TABLE "jules_session_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"activity_id" text NOT NULL,
	"remote_created_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jules_sessions" ALTER COLUMN "status" SET DEFAULT 'QUEUED';--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "goal_id" uuid;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "issue_id" uuid;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "pull_request_title" text;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "pull_request_description" text;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "remote_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD COLUMN "reconciliation_error" text;--> statement-breakpoint
ALTER TABLE "jules_session_activities" ADD CONSTRAINT "jules_session_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_session_activities" ADD CONSTRAINT "jules_session_activities_session_id_jules_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."jules_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jules_session_activities_session_activity_uniq" ON "jules_session_activities" USING btree ("session_id","activity_id");--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD CONSTRAINT "jules_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD CONSTRAINT "jules_sessions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD CONSTRAINT "jules_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_sessions" ADD CONSTRAINT "jules_sessions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jules_capacity_events_session_event_uniq" ON "jules_capacity_events" USING btree ("session_id","event_type");
--> statement-breakpoint
UPDATE "jules_sessions" SET "agent_id" = "heartbeat_runs"."agent_id" FROM "heartbeat_runs" WHERE "jules_sessions"."paperclip_run_id" = "heartbeat_runs"."id" AND "jules_sessions"."agent_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "jules_sessions" ALTER COLUMN "agent_id" SET NOT NULL;
--> statement-breakpoint
UPDATE "jules_sessions" SET "status" = CASE lower("status")
  WHEN 'queued' THEN 'QUEUED'
  WHEN 'planning' THEN 'PLANNING'
  WHEN 'awaiting_plan_approval' THEN 'AWAITING_PLAN_APPROVAL'
  WHEN 'awaiting_user_feedback' THEN 'AWAITING_USER_FEEDBACK'
  WHEN 'in_progress' THEN 'IN_PROGRESS'
  WHEN 'paused' THEN 'PAUSED'
  WHEN 'failed' THEN 'FAILED'
  WHEN 'completed' THEN 'COMPLETED_UNVALIDATED'
  WHEN 'cancelled' THEN 'FAILED'
  WHEN 'orphaned' THEN 'ORPHANED'
  ELSE upper("status")
END;
