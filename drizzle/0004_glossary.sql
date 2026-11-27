ALTER TABLE "ingredients" ADD COLUMN "sym" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "functions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "when_to_use" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "pregnancy" text;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "sort" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;