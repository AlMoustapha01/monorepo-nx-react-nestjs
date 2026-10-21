ALTER TABLE "catalog"."products" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders"."orders" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;