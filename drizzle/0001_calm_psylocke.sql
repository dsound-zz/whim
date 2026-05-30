ALTER TABLE "api_keys" ALTER COLUMN "calls_today" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "call_limit" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "call_limit" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "last_reset_at" timestamp DEFAULT now();