-- SQL to run in Supabase SQL Editor
ALTER TABLE race_events DROP COLUMN end_time;
ALTER TABLE race_events ADD COLUMN duration_hours NUMERIC DEFAULT 2;
ALTER TABLE race_events ADD COLUMN actual_start_time TIMESTAMPTZ;
