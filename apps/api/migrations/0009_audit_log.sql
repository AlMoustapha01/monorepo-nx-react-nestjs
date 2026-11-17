CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TABLE "audit"."entries" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" varchar(100),
	"details" jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"trace_id" varchar(32)
);
--> statement-breakpoint
ALTER TABLE "audit"."entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "entries_tenant_occurred_idx" ON "audit"."entries" USING btree ("tenant_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_tenant_actor_idx" ON "audit"."entries" USING btree ("tenant_id","actor_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_tenant_action_idx" ON "audit"."entries" USING btree ("tenant_id","action","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit"."entries" AS PERMISSIVE FOR ALL TO public USING (coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);