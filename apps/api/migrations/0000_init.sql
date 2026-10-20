CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE SCHEMA "orders";
--> statement-breakpoint
CREATE TYPE "catalog"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "orders"."order_status" AS ENUM('placed', 'cancelled');--> statement-breakpoint
CREATE TABLE "catalog"."products" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
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
CREATE TABLE "orders"."order_lines" (
	"order_id" text COLLATE "C" NOT NULL,
	"tenant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" text COLLATE "C" NOT NULL,
	"sku" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"unit_price_amount_minor" bigint NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_lines_order_id_position_pk" PRIMARY KEY("order_id","position")
);
--> statement-breakpoint
CREATE TABLE "orders"."orders" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "orders"."order_status" NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders"."order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_sku_key" ON "catalog"."products" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "products_tenant_keyset_idx" ON "catalog"."products" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_tenant_keyset_idx" ON "orders"."orders" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);