CREATE TABLE "controller_leases" (
"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"company_id" uuid NOT NULL,
"controller_id" text NOT NULL,
"fencing_token" bigint DEFAULT 1 NOT NULL,
"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
"lease_expires_at" timestamp with time zone NOT NULL,
"renewed_at" timestamp with time zone,
"release_reason" text,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "controller_leases" ADD CONSTRAINT "controller_leases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "controller_leases_company_uniq" ON "controller_leases" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "controller_leases_expiry_idx" ON "controller_leases" USING btree ("lease_expires_at");
