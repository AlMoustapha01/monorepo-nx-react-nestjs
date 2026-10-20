CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE TYPE "catalog"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "catalog"."products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"price_amount_minor" bigint NOT NULL,
	"price_currency" char(3) NOT NULL,
	"status" "catalog"."product_status" NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_sku_key" ON "catalog"."products" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "products_tenant_keyset_idx" ON "catalog"."products" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);