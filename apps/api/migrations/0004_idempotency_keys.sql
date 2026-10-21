CREATE SCHEMA "idempotency";
--> statement-breakpoint
CREATE TABLE "idempotency"."keys" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"fingerprint" char(64) NOT NULL,
	"response" jsonb,
	"created_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "keys_tenant_id_user_id_key_pk" PRIMARY KEY("tenant_id","user_id","key")
);
--> statement-breakpoint
CREATE INDEX "keys_expires_at_idx" ON "idempotency"."keys" USING btree ("expires_at");