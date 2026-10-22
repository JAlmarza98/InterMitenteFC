import { MatchEventType } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { elapsedSecondsInPeriod, segmentDurationSeconds } from "../matchClock/matchClock.service";
import { getStandingsOrNull, Standings } from "../league/league.service";
import {
  DEFAULT_LEAGUE_GOALS,
  RivalRecord,
  computeMatchRating,
  countGoalsWhileOnPitch,
  expectedGoals,
  matchGoalkeeperId,
  normalizeTeamName,
  outfieldRole,
  reconcileGoalSeconds,
  splitCards,
} from "./playerRating";

const RATED_EVENT_TYPES: MatchEventType[] = [
  "goal",
  "penalty_goal",
  "opponent_goal",
  "own_goal",
  "yellow_card",
  "red_card",
];

/** Regular periods per match: a match with no clock data (entered by hand)
 * is assumed to have lasted this many configured periods. */
const REGULAR_PERIODS = 2;

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

/**
 * Ratings for every player with playing time or a stat line in each of
 * `matchIds`, keyed by match id and then player id (`null`: nothing to
 * rate). The one place that assembles a rating's inputs, shared by the
 * match and season stats.
 */
export async function rateMatches(matchIds: string[]): Promise<Map<string, Map<string, number | null>>> {
  const ratings = new Map<string, Map<string, number | null>>();
  if (matchIds.length === 0) return ratings;
  const now = new Date();

  const [matches, segments, stats, events, topPlayers, standings, activeSeason] = await Promise.all([
    prisma.match.findMany({
      where: { id: { in: matchIds } },
      select: {
        id: true,
        opponent: true,
        status: true,
        teamScore: true,
        opponentScore: true,
        seasonId: true,
        periodLengthMinutes: true,
        periods: { include: { pauses: true } },
        formation: { select: { slots: { where: { slotKey: "gk" }, select: { playerId: true } } } },
      },
    }),
    prisma.playingTimeSegment.findMany({
      where: { matchId: { in: matchIds } },
      select: { matchId: true, playerId: true, startSecond: true, endSecond: true },
    }),
    prisma.matchPlayerStat.findMany({ where: { matchId: { in: matchIds } } }),
    prisma.matchEvent.findMany({
      where: { matchId: { in: matchIds }, type: { in: RATED_EVENT_TYPES } },
      select: { matchId: true, type: true, second: true, playerId: true },
    }),
    prisma.matchTopPlayer.findMany({ where: { matchId: { in: matchIds } } }),
    getStandingsOrNull(),
    prisma.season.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);

  const playerIds = [...new Set([...segments.map((s) => s.playerId), ...stats.map((s) => s.playerId)])];
  const players = new Map(
    (
      await prisma.player.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, position: true, secondaryPosition: true },
      })
    ).map((p) => [p.id, p])
  );
  // The league table is this season's: only this season's matches are
  // measured against it.
  const league = standings && activeSeason ? await leagueRecords(standings, activeSeason.id) : null;

  const segmentsByMatch = groupBy(segments, (s) => s.matchId);
  const statsByMatch = groupBy(stats, (s) => s.matchId);
  const eventsByMatch = groupBy(events, (e) => e.matchId);
  const topByMatch = groupBy(topPlayers, (t) => t.matchId);

  for (const match of matches) {
    const matchSegments = segmentsByMatch.get(match.id) ?? [];
    const matchStats = new Map((statsByMatch.get(match.id) ?? []).map((s) => [s.playerId, s]));
    const matchEvents = eventsByMatch.get(match.id) ?? [];
    const topRank = new Map((topByMatch.get(match.id) ?? []).map((t) => [t.playerId, t.rank]));

    const played = match.periods.reduce((sum, p) => sum + elapsedSecondsInPeriod(p, p.pauses, now), 0);
    const liveCurrentSecond = match.status === "live" ? played : null;
    const segmentsByPlayer = groupBy(matchSegments, (s) => s.playerId);
    const secondsByPlayer = new Map(
      [...segmentsByPlayer].map(([playerId, segs]) => [
        playerId,
        segs.reduce((sum, s) => sum + segmentDurationSeconds(s, liveCurrentSecond), 0),
      ])
    );
    const matchSeconds = Math.max(
      played > 0 ? played : match.periodLengthMinutes * REGULAR_PERIODS * 60,
      ...secondsByPlayer.values()
    );

    const ratedIds = [...new Set([...segmentsByPlayer.keys(), ...matchStats.keys()])];
    const goalkeeperId = matchGoalkeeperId(
      ratedIds.map((playerId) => ({
        playerId,
        position: players.get(playerId)?.position ?? null,
        secondaryPosition: players.get(playerId)?.secondaryPosition ?? null,
        secondsPlayed: secondsByPlayer.get(playerId) ?? 0,
        segments: segmentsByPlayer.get(playerId) ?? [],
      })),
      match.formation?.slots[0]?.playerId ?? null,
      matchSeconds
    );

    const { forSeconds, againstSeconds } = reconcileGoalSeconds(
      matchEvents,
      new Map([...matchStats].map(([id, s]) => [id, s.goals])),
      new Map([...matchStats].map(([id, s]) => [id, s.ownGoals])),
      match.teamScore,
      match.opponentScore
    );
    const { expectedFor, expectedAgainst } =
      league && match.seasonId === activeSeason?.id
        ? expectedGoals(league.records.get(normalizeTeamName(match.opponent)) ?? null, league.leagueGoals)
        : expectedGoals(null, DEFAULT_LEAGUE_GOALS);

    const matchRatings = new Map<string, number | null>();
    for (const playerId of ratedIds) {
      const stat = matchStats.get(playerId);
      const segs = segmentsByPlayer.get(playerId) ?? [];
      const secondsPlayed = secondsByPlayer.get(playerId) ?? 0;
      const share = secondsPlayed / matchSeconds;
      // No reliable goal timestamps: prorate the scoreline by minutes.
      const onPitch = (seconds: number[] | null, score: number | null) =>
        seconds ? countGoalsWhileOnPitch(seconds, segs, liveCurrentSecond) : (score ?? 0) * share;
      const cardSeconds = (type: MatchEventType) =>
        matchEvents.filter((e) => e.type === type && e.playerId === playerId).map((e) => e.second);
      const yellow = splitCards(cardSeconds("yellow_card"), stat?.yellowCards ?? 0, segs, secondsPlayed);
      const red = splitCards(cardSeconds("red_card"), stat?.redCards ?? 0, segs, secondsPlayed);
      const player = players.get(playerId);

      matchRatings.set(
        playerId,
        computeMatchRating({
          role: playerId === goalkeeperId ? "GK" : outfieldRole(player?.position ?? null, player?.secondaryPosition ?? null),
          secondsPlayed,
          matchSeconds,
          goals: stat?.goals ?? 0,
          penaltyGoals: stat?.penaltyGoals ?? 0,
          penaltiesWon: stat?.penaltiesWon ?? 0,
          assists: stat?.assists ?? 0,
          ownGoals: stat?.ownGoals ?? 0,
          keyActions: stat?.keyActions ?? 0,
          keyErrors: stat?.keyErrors ?? 0,
          yellowCards: yellow.onPitch,
          redCards: red.onPitch,
          benchYellowCards: yellow.bench,
          benchRedCards: red.bench,
          goalsForWhileOnPitch: onPitch(forSeconds, match.teamScore),
          goalsAgainstWhileOnPitch: onPitch(againstSeconds, match.opponentScore),
          expectedGoalsFor: expectedFor,
          expectedGoalsAgainst: expectedAgainst,
          topRank: topRank.get(playerId) ?? 0,
        })
      );
    }
    ratings.set(match.id, matchRatings);
  }
  return ratings;
}

/** Each rival's league record with our own games against it taken out —
 * those are what's being rated — plus the league's goals per team and
 * match. The league site only updates a few days after each matchday, so
 * only our oldest games, up to as many as it already counts for us, are
 * taken out. */
async function leagueRecords(
  standings: Standings,
  seasonId: string
): Promise<{ leagueGoals: number; records: Map<string, RivalRecord> }> {
  const played = standings.rows.reduce((sum, r) => sum + r.played, 0);
  const leagueGoals =
    played > 0 ? standings.rows.reduce((sum, r) => sum + r.goalsFor, 0) / played : DEFAULT_LEAGUE_GOALS;
  const records = new Map(
    standings.rows.map((r) => [
      normalizeTeamName(r.team),
      { goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, played: r.played },
    ])
  );

  const ours = standings.rows.find((r) => r.isOurTeam);
  const finished = await prisma.match.findMany({
    where: { seasonId, status: "finished" },
    orderBy: { matchDate: "asc" },
    select: { opponent: true, competition: true, teamScore: true, opponentScore: true },
  });
  const leagueMatches = finished.filter((m) => !m.competition || normalizeTeamName(m.competition) === "LIGA");
  for (const m of leagueMatches.slice(0, ours?.played ?? leagueMatches.length)) {
    const record = records.get(normalizeTeamName(m.opponent));
    if (!record) continue;
    record.goalsFor -= m.opponentScore ?? 0;
    record.goalsAgainst -= m.teamScore ?? 0;
    record.played -= 1;
  }
  return { leagueGoals, records };
}
