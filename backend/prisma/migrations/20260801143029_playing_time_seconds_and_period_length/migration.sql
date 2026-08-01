-- Track match period length per match (default 30 min, was hardcoded 45)
ALTER TABLE "Match" ADD COLUMN "periodLengthMinutes" INTEGER NOT NULL DEFAULT 30;

-- Store playing-time segment bounds in elapsed seconds instead of whole
-- minutes, so quick substitutions don't all collapse to the same "0'".
ALTER TABLE "PlayingTimeSegment" RENAME COLUMN "startMinute" TO "startSecond";
ALTER TABLE "PlayingTimeSegment" RENAME COLUMN "endMinute" TO "endSecond";

-- Existing data was stored in whole minutes; scale it up to keep it valid
-- (loses no information it didn't already lose, and stays consistent).
UPDATE "PlayingTimeSegment" SET "startSecond" = "startSecond" * 60;
UPDATE "PlayingTimeSegment" SET "endSecond" = "endSecond" * 60 WHERE "endSecond" IS NOT NULL;
