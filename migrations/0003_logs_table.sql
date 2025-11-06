-- Migration: Add logs table for application logging
-- Created: 2025-11-06

CREATE TABLE IF NOT EXISTS "logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar,
  "level" text NOT NULL,
  "message" text NOT NULL,
  "error_code" text,
  "source" text NOT NULL,
  "stack" text,
  "metadata" jsonb,
  "user_agent" text,
  "ip" text,
  "request_id" varchar,
  "timestamp" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraint with CASCADE on delete
DO $$ BEGIN
  ALTER TABLE "logs" ADD CONSTRAINT "logs_user_id_users_id_fk" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add index on timestamp for efficient querying
CREATE INDEX IF NOT EXISTS "logs_timestamp_idx" ON "logs" ("timestamp" DESC);

-- Add index on user_id for user-specific log queries
CREATE INDEX IF NOT EXISTS "logs_user_id_idx" ON "logs" ("user_id");

-- Add index on level for filtering by severity
CREATE INDEX IF NOT EXISTS "logs_level_idx" ON "logs" ("level");

-- Add index on request_id for correlating logs from same request
CREATE INDEX IF NOT EXISTS "logs_request_id_idx" ON "logs" ("request_id");
