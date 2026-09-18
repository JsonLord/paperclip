CREATE TABLE "economic_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"model_db_id" uuid NOT NULL,
	"input_id" text NOT NULL,
	"name" text NOT NULL,
	"value" text,
	"unit" text NOT NULL,
	"currency" text,
	"period" text NOT NULL,
	"scope" text NOT NULL,
	"category" text NOT NULL,
	"classification" text NOT NULL,
	"confidence" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"formula" text,
	"channel" text,
	"account_ref" text,
	"observed_at" timestamp with time zone,
	"calculated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economic_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"model_db_id" uuid NOT NULL,
	"scenario_id" text NOT NULL,
	"name" text NOT NULL,
	"input_changes" jsonb NOT NULL,
	"outputs" jsonb NOT NULL,
	"maturity" text NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_assumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"model_db_id" uuid NOT NULL,
	"assumption_id" text NOT NULL,
	"statement" text NOT NULL,
	"value" text,
	"range" jsonb,
	"unit" text NOT NULL,
	"reason" text NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text NOT NULL,
	"sensitivity" text NOT NULL,
	"status" text NOT NULL,
	"owner" text NOT NULL,
	"validation_needed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_economic_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"version" integer NOT NULL,
	"unit" text NOT NULL,
	"revenue_model" text NOT NULL,
	"currency" text NOT NULL,
	"period" text NOT NULL,
	"variable_cost_definition" jsonb NOT NULL,
	"fixed_cost_definition" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ids" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economic_inputs" ADD CONSTRAINT "economic_inputs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_inputs" ADD CONSTRAINT "economic_inputs_model_db_id_unit_economic_models_id_fk" FOREIGN KEY ("model_db_id") REFERENCES "public"."unit_economic_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_scenarios" ADD CONSTRAINT "economic_scenarios_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_scenarios" ADD CONSTRAINT "economic_scenarios_model_db_id_unit_economic_models_id_fk" FOREIGN KEY ("model_db_id") REFERENCES "public"."unit_economic_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_assumptions" ADD CONSTRAINT "financial_assumptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_assumptions" ADD CONSTRAINT "financial_assumptions_model_db_id_unit_economic_models_id_fk" FOREIGN KEY ("model_db_id") REFERENCES "public"."unit_economic_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_economic_models" ADD CONSTRAINT "unit_economic_models_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "economic_inputs_company_input_uniq" ON "economic_inputs" USING btree ("company_id","input_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_scenarios_company_scenario_uniq" ON "economic_scenarios" USING btree ("company_id","scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_assumptions_company_assumption_uniq" ON "financial_assumptions" USING btree ("company_id","assumption_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_economic_models_company_model_version_uniq" ON "unit_economic_models" USING btree ("company_id","model_id","version");