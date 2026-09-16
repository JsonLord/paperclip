CREATE TABLE "jules_repository_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"session_id" uuid,
	"paperclip_run_id" uuid NOT NULL,
	"repository" text NOT NULL,
	"write_scopes" jsonb NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "jules_profiles" ADD COLUMN "capability_readiness" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jules_repository_leases" ADD CONSTRAINT "jules_repository_leases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_repository_leases" ADD CONSTRAINT "jules_repository_leases_profile_id_jules_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."jules_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_repository_leases" ADD CONSTRAINT "jules_repository_leases_session_id_jules_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."jules_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jules_repository_leases" ADD CONSTRAINT "jules_repository_leases_paperclip_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("paperclip_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jules_repository_leases_run_uniq" ON "jules_repository_leases" USING btree ("paperclip_run_id");--> statement-breakpoint
CREATE INDEX "jules_repository_leases_active_repo_idx" ON "jules_repository_leases" USING btree ("company_id","repository","released_at");