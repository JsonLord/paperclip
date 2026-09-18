ALTER TABLE "activation_definitions" ALTER COLUMN "version" SET DATA TYPE integer USING "version"::integer;--> statement-breakpoint
ALTER TABLE "activation_definitions" ADD COLUMN "segment_id" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "activation_definitions" ADD COLUMN "event_order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activation_definitions" ADD COLUMN "measurement_window" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_events" ADD COLUMN "reliability_observation_id" text;--> statement-breakpoint
ALTER TABLE "retention_events" ADD COLUMN "reliability_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "retention_windows" ADD COLUMN "rationale" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_windows" ADD COLUMN "window_type" text DEFAULT 'CUSTOM' NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_windows" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_events" ADD CONSTRAINT "retention_events_reliability_issue_id_issues_id_fk" FOREIGN KEY ("reliability_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;