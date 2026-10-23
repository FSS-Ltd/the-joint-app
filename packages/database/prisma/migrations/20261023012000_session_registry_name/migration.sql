-- Preserve records while adopting the canonical SessionRegistry name.
ALTER TABLE app."AppSession" RENAME TO "SessionRegistry";
ALTER TABLE app."SessionRegistry" RENAME CONSTRAINT "AppSession_pkey" TO "SessionRegistry_pkey";
ALTER TABLE app."SessionRegistry" RENAME CONSTRAINT "AppSession_userId_householdId_fkey" TO "SessionRegistry_userId_householdId_fkey";
ALTER INDEX app."AppSession_userId_idx" RENAME TO "SessionRegistry_userId_idx";
