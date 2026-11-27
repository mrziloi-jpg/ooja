DROP INDEX "consult_slot_idx";--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "meeting_link" text;--> statement-breakpoint
ALTER TABLE "consultations" ADD COLUMN "reminded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "consult_user_idx" ON "consultations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consult_slot_idx" ON "consultations" USING btree ("starts_at") WHERE status <> 'canceled';