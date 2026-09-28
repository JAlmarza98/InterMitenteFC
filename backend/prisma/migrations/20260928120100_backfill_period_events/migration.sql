-- Backfill period_start / period_end events for every period already played
-- before these events existed, so older matches get the same history as new
-- ones. Kept apart from the enum migration: Postgres won't let a new enum
-- value be used in the transaction that adds it.
--
-- `second` follows the same clock as the app (matchClock.service.ts): a
-- period's elapsed seconds are its wall-clock span minus its pauses, and a
-- period starts at the summed elapsed seconds of every earlier period. Only
-- an ended period gets an end event; a period still running gets it from
-- the app when it ends.
WITH elapsed AS (
  SELECT
    p.id,
    p."matchId",
    p.type,
    p."startedAt",
    p."endedAt",
    CASE p.type
      WHEN 'first_half' THEN 1
      WHEN 'second_half' THEN 2
      WHEN 'extra_first' THEN 3
      ELSE 4
    END AS ord,
    CASE
      WHEN p."endedAt" IS NULL THEN NULL
      ELSE GREATEST(
        0,
        FLOOR(
          EXTRACT(EPOCH FROM (p."endedAt" - p."startedAt"))
          - COALESCE(
            (
              SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(cp."resumedAt", p."endedAt") - cp."pausedAt")))
              FROM "MatchClockPause" cp
              WHERE cp."periodId" = p.id
            ),
            0
          )
        )
      )::INTEGER
    END AS secs
  FROM "MatchPeriod" p
  WHERE p."startedAt" IS NOT NULL
),
offsets AS (
  SELECT
    e.*,
    COALESCE(
      (SELECT SUM(e2.secs) FROM elapsed e2 WHERE e2."matchId" = e."matchId" AND e2.ord < e.ord),
      0
    )::INTEGER AS start_second
  FROM elapsed e
)
INSERT INTO "MatchEvent" ("id", "matchId", "type", "periodType", "second", "createdAt")
SELECT gen_random_uuid()::TEXT, "matchId", 'period_start'::"MatchEventType", type, start_second, "startedAt"
FROM offsets
UNION ALL
SELECT gen_random_uuid()::TEXT, "matchId", 'period_end'::"MatchEventType", type, start_second + secs, "endedAt"
FROM offsets
WHERE "endedAt" IS NOT NULL;
