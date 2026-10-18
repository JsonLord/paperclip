ALTER TABLE "github_action_runs" ADD COLUMN "remote_url" text;--> statement-breakpoint
ALTER TABLE "jules_repository_leases" ADD COLUMN "dispatch_started_at" timestamp with time zone;