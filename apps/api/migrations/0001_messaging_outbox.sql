CREATE SCHEMA "messaging";
--> statement-breakpoint
CREATE TABLE "messaging"."outbox" (
	"id" text COLLATE "C" PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"published_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "messaging"."processed_events" (
	"handler" varchar(100) NOT NULL,
	"event_id" text COLLATE "C" NOT NULL,
	"tenant_id" uuid NOT NULL,
	"processed_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "processed_events_handler_event_id_pk" PRIMARY KEY("handler","event_id")
);
--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "messaging"."outbox" USING btree ("occurred_at") WHERE "messaging"."outbox"."published_at" is null;--> statement-breakpoint
CREATE INDEX "processed_events_processed_at_idx" ON "messaging"."processed_events" USING btree ("processed_at");