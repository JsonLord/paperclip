CREATE TABLE "pitch_decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"deck_id" text NOT NULL,
	"version" text NOT NULL,
	"source_state_version" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"resource_version" text NOT NULL,
	"slides" jsonb NOT NULL,
	"claim_map" jsonb NOT NULL,
	"readiness" jsonb NOT NULL,
	"render_status" text NOT NULL,
	"decision" text NOT NULL,
	"status" text NOT NULL,
	"compiled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD CONSTRAINT "pitch_decks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD CONSTRAINT "pitch_decks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_decks" ADD CONSTRAINT "pitch_decks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pitch_decks_company_deck_version_uniq" ON "pitch_decks" USING btree ("company_id","deck_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "pitch_decks_company_fingerprint_uniq" ON "pitch_decks" USING btree ("company_id","source_fingerprint");