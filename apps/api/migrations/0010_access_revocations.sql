CREATE SCHEMA "access";
--> statement-breakpoint
CREATE TABLE "access"."revocations" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"revoked_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "revocations_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "access"."revocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "access"."revocations" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);