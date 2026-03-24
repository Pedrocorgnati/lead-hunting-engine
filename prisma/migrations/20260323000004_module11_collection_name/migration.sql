-- Migration: module11_collection_name
-- Add user-friendly name field to collection_jobs (module-11-scraper-pipeline)

ALTER TABLE "collection_jobs"
  ADD COLUMN IF NOT EXISTS "name" VARCHAR(255);
