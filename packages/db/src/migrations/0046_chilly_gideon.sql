CREATE TABLE "agent_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"hypothesis" text NOT NULL,
	"approach_a" text NOT NULL,
	"approach_b" text NOT NULL,
	"task_type" text,
	"status" text NOT NULL,
	"winning_approach" text,
	"runs_a" integer DEFAULT 0 NOT NULL,
	"runs_b" integer DEFAULT 0 NOT NULL,
	"kpi_results_a" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kpi_results_b" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"concluded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_kpi_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"metadata_key" text NOT NULL,
	"target_value" real,
	"direction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_kpi_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"observer_type" text NOT NULL,
	"observer_agent_id" uuid,
	"observer_user_id" uuid,
	"observation" text NOT NULL,
	"agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_taken" boolean DEFAULT false NOT NULL,
	"action_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"run_id" uuid,
	"task_completed" boolean,
	"self_assessment_score" real,
	"tokens_used" bigint,
	"cost_cents" integer,
	"duration_seconds" integer,
	"errors_encountered" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"project_id" uuid,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_project_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"adapter_type" text NOT NULL,
	"project_id" uuid,
	"session_id" text,
	"session_params" jsonb,
	"session_display_id" text,
	"last_run_id" uuid,
	"run_count" integer DEFAULT 0 NOT NULL,
	"total_input_tokens" bigint DEFAULT 0 NOT NULL,
	"total_output_tokens" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_exclusions" (
	"agent_id" uuid NOT NULL,
	"mcp_server_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_mcp_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"command" text NOT NULL,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transport_type" text NOT NULL,
	"transport_url" text,
	"source" text NOT NULL,
	"claude_code_config_path" text,
	"scope" text NOT NULL,
	"agent_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"change_notes" text,
	"previous_content" text,
	"new_content" text,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_experiments" ADD CONSTRAINT "agent_experiments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_experiments" ADD CONSTRAINT "agent_experiments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_definitions" ADD CONSTRAINT "agent_kpi_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_definitions" ADD CONSTRAINT "agent_kpi_definitions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_observations" ADD CONSTRAINT "agent_kpi_observations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpi_observations" ADD CONSTRAINT "agent_kpi_observations_observer_agent_id_agents_id_fk" FOREIGN KEY ("observer_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kpis" ADD CONSTRAINT "agent_kpis_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_project_sessions" ADD CONSTRAINT "agent_project_sessions_last_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_exclusions" ADD CONSTRAINT "agent_mcp_exclusions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_mcp_exclusions" ADD CONSTRAINT "agent_mcp_exclusions_mcp_server_id_company_mcp_servers_id_fk" FOREIGN KEY ("mcp_server_id") REFERENCES "public"."company_mcp_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_mcp_servers" ADD CONSTRAINT "company_mcp_servers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_mcp_servers" ADD CONSTRAINT "company_mcp_servers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_skill_id_company_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."company_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_change_log" ADD CONSTRAINT "skill_change_log_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_experiments_agent_idx" ON "agent_experiments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_experiments_company_idx" ON "agent_experiments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpi_definitions_company_idx" ON "agent_kpi_definitions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpi_observations_company_idx" ON "agent_kpi_observations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpis_agent_idx" ON "agent_kpis" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_kpis_company_idx" ON "agent_kpis" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agent_kpis_agent_created_idx" ON "agent_kpis" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_memories_agent_scope_idx" ON "agent_memories" USING btree ("agent_id","scope");--> statement-breakpoint
CREATE INDEX "agent_memories_agent_project_idx" ON "agent_memories" USING btree ("agent_id","project_id");--> statement-breakpoint
CREATE INDEX "agent_memories_company_idx" ON "agent_memories" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_project_sessions_agent_adapter_project_uniq" ON "agent_project_sessions" USING btree ("agent_id","adapter_type","project_id");--> statement-breakpoint
CREATE INDEX "agent_project_sessions_company_agent_idx" ON "agent_project_sessions" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "agent_mcp_exclusions_agent_mcp_idx" ON "agent_mcp_exclusions" USING btree ("agent_id","mcp_server_id");--> statement-breakpoint
CREATE INDEX "company_mcp_servers_company_idx" ON "company_mcp_servers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_mcp_servers_company_agent_idx" ON "company_mcp_servers" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX "skill_change_log_skill_idx" ON "skill_change_log" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_change_log_agent_idx" ON "skill_change_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "skill_change_log_company_idx" ON "skill_change_log" USING btree ("company_id");