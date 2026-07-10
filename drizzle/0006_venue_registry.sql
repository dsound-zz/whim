-- Venue registry: canonical venue identity + alias table.
-- Adds resolver-owned columns to `venues` and the `venue_aliases` lookup table.

ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "parent_venue_id" uuid;

CREATE INDEX IF NOT EXISTS "venues_normalized_name_idx" ON "venues" ("normalized_name");

CREATE TABLE IF NOT EXISTS "venue_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "alias" text NOT NULL,
  "normalized_alias" text NOT NULL,
  "source_type" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "venue_aliases_normalized_idx" ON "venue_aliases" ("normalized_alias");
CREATE INDEX IF NOT EXISTS "venue_aliases_venue_idx" ON "venue_aliases" ("venue_id");
