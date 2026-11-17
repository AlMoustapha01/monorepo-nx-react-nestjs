ALTER TABLE "audit"."entries" ADD COLUMN "impersonator_id" uuid;--> statement-breakpoint
ALTER TABLE "messaging"."outbox" ADD COLUMN "impersonator_id" uuid;