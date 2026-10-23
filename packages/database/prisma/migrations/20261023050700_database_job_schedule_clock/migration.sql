-- Prisma's now() default supplies host time, while claim eligibility uses the
-- PostgreSQL clock. Generate immediate schedules on that same authority and
-- truncate rather than round fractional milliseconds into the future.
-- Existing jobs, explicit schedules and retry backoffs remain unchanged.
ALTER TABLE app."Job" ALTER COLUMN "runAfter"
 SET DEFAULT date_trunc('milliseconds', clock_timestamp());
