import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { HttpError } from "../../middleware/errorHandler";

/** JSON service behind the standings table of the municipal league site
 * (campeonatosmunicipalesmostoles.org/Futbol7__empty.php) — the page itself
 * just feeds this to a jqGrid, so we skip the HTML entirely. */
const SOURCE_URL = "http://www.campeonatosmunicipalesmostoles.org/ser/clasifOptService.php";
const CACHE_MS = 10 * 60 * 1000;
const OUR_TEAM = "INTERMITENTE";

// Each row is a positional array: POS, crest, team, PTS, PJ, PG, PE, PP,
// GF, GC, DG, PS, INC, team id, competition id.
const sourceSchema = z.object({
  rows: z.array(z.object({ cell: z.array(z.string()).min(11) })),
});

export interface StandingRow {
  position: number;
  team: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  isOurTeam: boolean;
}

export interface Standings {
  division: string;
  fetchedAt: string;
  rows: StandingRow[];
}

export function parseStandings(body: unknown): StandingRow[] {
  return sourceSchema.parse(body).rows.map(({ cell }) => {
    const n = (i: number) => Number(cell[i]);
    return {
      position: n(0),
      team: cell[2],
      points: n(3),
      played: n(4),
      won: n(5),
      drawn: n(6),
      lost: n(7),
      goalsFor: n(8),
      goalsAgainst: n(9),
      goalDifference: n(10),
      isOurTeam: cell[2].toUpperCase().includes(OUR_TEAM),
    };
  });
}

let cache: Standings | null = null;

/** Cached for CACHE_MS — the league only updates after matchdays, and the
 * source site is slow. If it's down, a stale copy beats an error. */
export async function getStandings(): Promise<Standings> {
  if (cache && Date.now() - Date.parse(cache.fetchedAt) < CACHE_MS) return cache;
  try {
    const url = `${SOURCE_URL}?${new URLSearchParams({
      dato: env.LEAGUE_DIVISION,
      _search: "false",
      rows: "100",
      page: "1",
      sidx: "POS",
      sord: "asc",
    })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cache = {
      division: env.LEAGUE_DIVISION.split(",")[2] ?? "",
      fetchedAt: new Date().toISOString(),
      rows: parseStandings(await res.json()),
    };
    return cache;
  } catch (err) {
    logger.warn({ err }, "League standings fetch failed");
    if (cache) return cache;
    throw new HttpError(502, "No se ha podido obtener la clasificación de la liga");
  }
}
