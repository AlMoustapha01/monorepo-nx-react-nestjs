CREATE SCHEMA "feature_flags";
--> statement-breakpoint
CREATE TABLE "feature_flags"."tenant_overrides" (
	"tenant_id" uuid NOT NULL,
	"flag" varchar(100) NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "tenant_overrides_tenant_id_flag_pk" PRIMARY KEY("tenant_id","flag")
);
--> statement-breakpoint
ALTER TABLE "feature_flags"."tenant_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "feature_flags"."tenant_overrides" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);