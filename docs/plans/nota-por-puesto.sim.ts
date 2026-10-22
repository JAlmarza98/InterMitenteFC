/**
 * Simulador del plan "nota por puesto" (ver nota-por-puesto.md).
 * Compara la fórmula actual (importada del backend) con la revisada, en:
 *   1. temporadas simuladas de fútbol 7 (50', mucha rotación, como los partidos reales);
 *   2. los partidos reales ya jugados (anonimizados: solo posición y números);
 *   3. ejemplos sueltos.
 * Los pesos a ajustar están en `R`.
 *
 *   cd backend && npx tsx ../docs/plans/nota-por-puesto.sim.ts
 *   G=4 SEASONS=100 npx tsx ../docs/plans/nota-por-puesto.sim.ts   # liga más goleadora
 */
import { computeMatchRating, RatingInput } from "../../backend/src/modules/stats/playerRating";

type Role = "GK" | "DEF" | "MID" | "FWD";
const ROLES: Role[] = ["GK", "DEF", "MID", "FWD"];

// ---------- Revised rating: weights to tune ----------
const R = {
  base: 5,
  // Personal events: same value for every position.
  goal: 1.2,
  penaltyGoal: 0.9,
  assist: 0.7,
  penaltyWon: 0.5,
  yellowCard: -0.6,
  redCard: -2.0,
  ownGoal: -1.5,
  keyAction: 0.8, // ⭐ (Opción C)
  keyError: -0.8, // ⚠️ (Opción C)
  // Cards shown while not on the pitch: fixed and harsh, regardless of minutes.
  benchYellow: -3.6,
  benchRed: -10,
  // Top 3 of the match chosen by an admin (Opción B).
  top3: [1.5, 1.0, 0.5],
  // Team result while on the pitch vs. what's expected against that rival.
  defense: { GK: 0.8, DEF: 0.5, MID: 0.25, FWD: 0.05 } as Record<Role, number>,
  attack: { GK: 0, DEF: 0.05, MID: 0.25, FWD: 0.4 } as Record<Role, number>,
  // The team can lift you a lot but only sink you this much; below that it
  // has to be something of yours (cards, own goal, ⚠️).
  contextMin: -1.5,
  contextMax: 3,
  // A worse-than-expected team result only counts this fraction: the team
  // context rewards in full but blames by half (individual blame comes from
  // cards, own goals and ⚠️).
  negativeContextScale: 0.5,
  // sqrt(duration / minutes played) on personal events, capped.
  maxMinutesFactor: 2,
  // Also apply that factor to the team context (same "less time, same
  // output, more merit" rule for both).
  contextTimesFactor: true,
};
// Quick tuning without editing: R_OVERRIDE='{"defense":{"GK":0.8,...}}'
Object.assign(R, JSON.parse(process.env.R_OVERRIDE ?? "{}"));

interface RevisedInput {
  role: Role;
  secondsPlayed: number;
  /** Real duration of the match (sum of its periods), not the configured one. */
  matchSeconds: number;
  goals: number;
  penaltyGoals: number;
  assists: number;
  penaltiesWon: number;
  yellowCards: number; // shown on the pitch
  redCards: number; // shown on the pitch
  benchYellowCards: number;
  benchRedCards: number;
  ownGoals: number;
  keyActions: number;
  keyErrors: number;
  goalsForWhileOnPitch: number;
  goalsAgainstWhileOnPitch: number;
  /** Expected goals for/against in the whole match, from the rival's league record. */
  expectedFor: number;
  expectedAgainst: number;
  top3Rank: 0 | 1 | 2 | 3;
}

function revisedRating(x: RevisedInput): number | null {
  const offPitch = x.benchYellowCards * R.benchYellow + x.benchRedCards * R.benchRed;
  if (x.secondsPlayed <= 0) return offPitch ? clamp10(R.base + offPitch) : null;
  const share = Math.min(1, x.secondsPlayed / x.matchSeconds);
  const factor = Math.min(R.maxMinutesFactor, Math.sqrt(x.matchSeconds / x.secondsPlayed));
  const pen = Math.min(x.penaltyGoals, x.goals);
  const personal =
    (x.goals - pen) * R.goal +
    pen * R.penaltyGoal +
    x.assists * R.assist +
    x.penaltiesWon * R.penaltyWon +
    x.yellowCards * R.yellowCard +
    x.redCards * R.redCard +
    x.ownGoals * R.ownGoal +
    x.keyActions * R.keyAction +
    x.keyErrors * R.keyError;
  const soften = (v: number) => (v < 0 ? v * R.negativeContextScale : v);
  const context =
    (soften((x.expectedAgainst * share - x.goalsAgainstWhileOnPitch) * R.defense[x.role]) +
      soften((x.goalsForWhileOnPitch - x.expectedFor * share) * R.attack[x.role])) *
    (R.contextTimesFactor ? factor : 1);
  const top3 = x.top3Rank ? R.top3[x.top3Rank - 1] : 0;
  return clamp10(
    R.base + personal * factor + Math.min(R.contextMax, Math.max(R.contextMin, context)) + top3 + offPitch
  );
}

function clamp10(v: number) {
  return Math.round(Math.min(10, Math.max(0, v)) * 10) / 10;
}

// ---------- RNG (seeded, so runs are reproducible) ----------
let seed = 12345;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function normal() {
  return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
}
function poisson(lambda: number) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > limit);
  return k - 1;
}
function pick<T>(items: T[], weight: (t: T) => number): T | null {
  const ws = items.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function shuffle<T>(a: T[]) {
  return a
    .map((x) => [rnd(), x] as const)
    .sort((p, q) => p[0] - q[0])
    .map((p) => p[1]);
}

// ---------- 1. Simulated seasons ----------
// Assumptions taken from the real matches: ~50' (2x25'), ~3 goals per team
// (league average 2.9), 15-18 substitutions per match, one goalkeeper who
// plays the whole match.
const ENV = {
  matchSeconds: 3000,
  leagueGoals: Number(process.env.G ?? 2.9),
  strengthSd: 0.35, // rival-to-rival variation
  estimateSd: 0.25, // how far the standings-based estimate is off
  penaltiesPerMatch: 0.3,
  penaltyConversion: 0.75,
  assistRate: 0.6,
  ownGoalShare: 0.04,
  yellowsPerMatch: 0.5,
  redsPerMatch: 0.03,
  changesPerRotatingSlot: 3, // Poisson mean; 4 rotating slots -> ~16 subs
};
const SCORE_W: Record<Role, number> = { GK: 0.03, DEF: 0.7, MID: 2.5, FWD: 5 };
const ASSIST_W: Record<Role, number> = { GK: 0.3, DEF: 1.2, MID: 3, FWD: 2 };
const PEN_WON_W: Record<Role, number> = { GK: 0, DEF: 0.7, MID: 2, FWD: 3 };
const CARD_W: Record<Role, number> = { GK: 0.3, DEF: 1.5, MID: 1.2, FWD: 0.8 };
const OG_W: Record<Role, number> = { GK: 1, DEF: 3, MID: 1, FWD: 0.3 };

// Squad of 11 (1 GK, 4 DEF, 4 MID, 2 FWD) over the app's four formations.
const SQUAD: { id: number; role: Role }[] = [
  { id: 0, role: "GK" },
  ...[1, 2, 3, 4].map((id) => ({ id, role: "DEF" as Role })),
  ...[5, 6, 7, 8].map((id) => ({ id, role: "MID" as Role })),
  ...[9, 10].map((id) => ({ id, role: "FWD" as Role })),
];
const FORMATIONS: Role[][] = [
  ["GK", "DEF", "DEF", "MID", "MID", "MID", "FWD"],
  ["GK", "DEF", "DEF", "DEF", "MID", "MID", "FWD"],
  ["GK", "DEF", "DEF", "DEF", "MID", "FWD", "FWD"],
  ["GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD"],
];

interface SimLine {
  role: Role;
  playerId: number;
  secondsPlayed: number;
  goals: number;
  penaltyGoals: number;
  penaltiesWon: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  goalsForWhileOnPitch: number;
  goalsAgainstWhileOnPitch: number;
  expectedFor: number;
  expectedAgainst: number;
}

function simulateMatch(): SimLine[] {
  const D = ENV.matchSeconds;
  const formation = FORMATIONS[Math.floor(rnd() * FORMATIONS.length)];
  const byRole: Record<Role, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of shuffle(SQUAD)) byRole[p.role].push(p.id);
  const used = new Set<number>();
  const take = (r: Role) => {
    const id = byRole[r].find((x) => !used.has(x));
    if (id !== undefined) used.add(id);
    return id;
  };
  const roleOf = new Map(SQUAD.map((p) => [p.id, p.role]));
  const role = (id: number) => roleOf.get(id)!;

  // Rolling substitutions: each bench player shares one slot with its
  // starter, swapping in and out several times.
  const seg = new Map<number, [number, number][]>();
  const add = (id: number, a: number, b: number) => {
    if (b > a) seg.set(id, [...(seg.get(id) ?? []), [a, b]]);
  };
  const starters = formation.map((r) => ({ role: r, starter: take(r)! }));
  for (const { role: slotRole, starter } of starters) {
    const partner = slotRole === "GK" ? undefined : take(slotRole) ?? take("MID") ?? take("DEF") ?? take("FWD");
    if (partner === undefined) {
      add(starter, 0, D);
      continue;
    }
    const changes = Array.from({ length: 1 + poisson(ENV.changesPerRotatingSlot - 1) }, () => Math.round(rnd() * D)).sort(
      (a, b) => a - b
    );
    let owner = starter;
    let from = 0;
    for (const t of changes) {
      add(owner, from, t);
      owner = owner === starter ? partner : starter;
      from = t;
    }
    add(owner, from, D);
  }
  const onPitch = (t: number) =>
    [...seg.entries()].filter(([, ss]) => ss.some(([a, b]) => t >= a && t < b)).map(([id]) => id);

  const stats = new Map<number, Omit<SimLine, "role" | "playerId" | "secondsPlayed" | "goalsForWhileOnPitch" | "goalsAgainstWhileOnPitch" | "expectedFor" | "expectedAgainst">>();
  const s = (id: number) => {
    if (!stats.has(id)) {
      stats.set(id, { goals: 0, penaltyGoals: 0, penaltiesWon: 0, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0 });
    }
    return stats.get(id)!;
  };

  const strength = Math.exp(normal() * ENV.strengthSd);
  const lambdaFor = ENV.leagueGoals * strength;
  const lambdaAgainst = ENV.leagueGoals / strength;
  const expectedFor = lambdaFor * Math.exp(normal() * ENV.estimateSd);
  const expectedAgainst = lambdaAgainst * Math.exp(normal() * ENV.estimateSd);
  const forTimes: number[] = [];
  const againstTimes: number[] = [];

  for (let i = poisson(ENV.penaltiesPerMatch); i > 0; i--) {
    const t = Math.floor(rnd() * D);
    const ps = onPitch(t);
    const winner = pick(ps, (id) => PEN_WON_W[role(id)]);
    if (winner !== null) s(winner).penaltiesWon++;
    if (rnd() < ENV.penaltyConversion) {
      const taker = pick(ps, (id) => (role(id) === "FWD" ? 10 : role(id) === "MID" ? 3 : 0.2))!;
      s(taker).goals++;
      s(taker).penaltyGoals++;
      forTimes.push(t);
    }
  }
  const openPlayFor = poisson(Math.max(0, lambdaFor - ENV.penaltiesPerMatch * ENV.penaltyConversion));
  for (let i = 0; i < openPlayFor; i++) {
    const t = Math.floor(rnd() * D);
    const ps = onPitch(t);
    const scorer = pick(ps, (id) => SCORE_W[role(id)])!;
    s(scorer).goals++;
    forTimes.push(t);
    if (rnd() < ENV.assistRate) {
      const assister = pick(ps.filter((x) => x !== scorer), (id) => ASSIST_W[role(id)]);
      if (assister !== null) s(assister).assists++;
    }
  }
  for (let i = poisson(lambdaAgainst); i > 0; i--) {
    const t = Math.floor(rnd() * D);
    againstTimes.push(t);
    if (rnd() < ENV.ownGoalShare) {
      const og = pick(onPitch(t), (id) => OG_W[role(id)]);
      if (og !== null) s(og).ownGoals++;
    }
  }
  for (let i = poisson(ENV.yellowsPerMatch); i > 0; i--) {
    const p = pick(onPitch(Math.floor(rnd() * D)), (id) => CARD_W[role(id)]);
    if (p !== null) s(p).yellowCards++;
  }
  for (let i = poisson(ENV.redsPerMatch); i > 0; i--) {
    const t = Math.floor(rnd() * D);
    const p = pick(onPitch(t), (id) => CARD_W[role(id)]);
    if (p !== null) {
      s(p).redCards++;
      seg.set(p, seg.get(p)!.map(([a, b]) => [a, Math.min(b, Math.max(a, t))] as [number, number]));
    }
  }

  return [...seg].map(([id, ss]) => {
    const inside = (t: number) => ss.some(([a, b]) => t >= a && t < b);
    return {
      ...s(id),
      role: role(id),
      playerId: id,
      secondsPlayed: ss.reduce((acc, [a, b]) => acc + (b - a), 0),
      goalsForWhileOnPitch: forTimes.filter(inside).length,
      goalsAgainstWhileOnPitch: againstTimes.filter(inside).length,
      expectedFor,
      expectedAgainst,
    };
  });
}

function currentRating(l: SimLine) {
  return computeMatchRating({ ...l, isGoalkeeper: l.role === "GK" });
}
function revisedFromSim(l: SimLine) {
  return revisedRating({
    ...l,
    matchSeconds: ENV.matchSeconds,
    benchYellowCards: 0,
    benchRedCards: 0,
    keyActions: 0,
    keyErrors: 0,
    top3Rank: 0,
  });
}

const SEASONS = Number(process.env.SEASONS ?? 300);
const MATCHES_PER_SEASON = 22;
const FORMULAS = { actual: currentRating, revisada: revisedFromSim };
type FormulaName = keyof typeof FORMULAS;
const perMatch = {} as Record<FormulaName, Record<Role, number[]>>;
for (const f of Object.keys(FORMULAS) as FormulaName[]) perMatch[f] = { GK: [], DEF: [], MID: [], FWD: [] };
for (let season = 0; season < SEASONS; season++) {
  for (let i = 0; i < MATCHES_PER_SEASON; i++) {
    const lines = simulateMatch();
    for (const f of Object.keys(FORMULAS) as FormulaName[]) {
      for (const l of lines) {
        const r = FORMULAS[f](l);
        if (r !== null) perMatch[f][l.role].push(r);
      }
    }
  }
}

const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))].toFixed(1);
const share = (xs: number[], pred: (x: number) => boolean) => `${((100 * xs.filter(pred).length) / xs.length).toFixed(0)}%`;

console.log(`## 1. Temporadas simuladas: liga de ${ENV.leagueGoals} goles por equipo, ${SEASONS} x ${MATCHES_PER_SEASON} partidos de 50'`);
for (const f of Object.keys(FORMULAS) as FormulaName[]) {
  console.log(`\n### ${f}`);
  console.log("puesto | media | p10 | p90 | >=7.5 | <4.5");
  for (const r of ROLES) {
    const xs = perMatch[f][r];
    console.log(`${r} | ${mean(xs)} | ${pct(xs, 0.1)} | ${pct(xs, 0.9)} | ${share(xs, (x) => x >= 7.5)} | ${share(xs, (x) => x < 4.5)}`);
  }
}

// ---------- 2. Real matches (2026/27, anonymized) ----------
// Extracted read-only from production on 2026-10-22. Goal events already
// reconciled with the corrected totals (one double tap and one phantom
// penalty dropped). gk = who actually played in goal (formation slot, or
// else: the profile goalkeeper if he played, else whoever played the whole
// match without coming off).
// [match, profile position, gk, seconds, G, penalty G, A, penalties won, Y, R, OG, team goals for / against while on pitch, rating in production]
const REAL_MATCHES = [
  // Rival's record with our match taken out: GF, GC and games played.
  { name: "3-1 vs Sparta", seconds: 3045, oppGF: 13, oppGC: 4, oppPJ: 2 },
  { name: "3-6 vs Manzanitas", seconds: 2975, oppGF: 6, oppGC: 3, oppPJ: 2 },
  { name: "3-3 vs Bonbon420", seconds: 2968, oppGF: 3, oppGC: 5, oppPJ: 2 },
];
const LEAGUE_GOALS = 104 / 36; // per team and match, standings at that date
const PRIOR_MATCHES = 2; // shrink a rival's short record towards the league average
const REAL_ROWS: [number, string, number, number, number, number, number, number, number, number, number, number, number, number][] = [
  [0, "Extremo", 0, 1843, 0, 0, 0, 0, 0, 0, 0, 1, 0, 5.4],
  [0, "Lateral", 0, 1518, 0, 0, 0, 0, 0, 0, 0, 2, 0, 5.4],
  [0, "Central", 0, 1463, 0, 0, 0, 0, 0, 0, 0, 1, 1, 5],
  [0, "Central", 0, 2527, 1, 0, 0, 0, 0, 0, 0, 2, 1, 7.1],
  [0, "Central", 0, 2434, 1, 0, 0, 0, 0, 0, 0, 3, 0, 7.6],
  [0, "Central", 1, 3045, 0, 0, 0, 0, 0, 0, 0, 3, 1, 5.6],
  [0, "Lateral", 0, 1226, 1, 0, 0, 0, 0, 0, 0, 1, 1, 8.7],
  [0, "Centrocampista", 0, 2297, 0, 0, 2, 0, 0, 0, 0, 3, 1, 7.8],
  [0, "Delantero", 0, 1640, 0, 0, 0, 0, 0, 0, 0, 2, 1, 5.2],
  [0, "Polivalente", 0, 1091, 0, 0, 0, 0, 0, 0, 0, 1, 0, 5.4],
  [0, "Extremo", 0, 2231, 0, 0, 0, 0, 0, 0, 0, 2, 1, 5.2],
  [1, "Lateral", 0, 1538, 0, 0, 0, 0, 0, 0, 0, 1, 5, 4.2],
  [1, "Central", 0, 1824, 0, 0, 0, 0, 0, 0, 0, 2, 2, 5.2],
  [1, "Lateral", 0, 1012, 0, 0, 0, 0, 0, 0, 0, 1, 5, 4.2],
  [1, "Central", 0, 2328, 2, 0, 0, 0, 0, 0, 1, 3, 6, 6],
  [1, "Central", 1, 2975, 0, 0, 0, 0, 0, 0, 0, 3, 6, 4.6],
  [1, "Centrocampista", 0, 1258, 0, 0, 0, 0, 0, 0, 0, 1, 3, 4.6],
  [1, "Lateral", 0, 1034, 0, 0, 0, 0, 0, 0, 0, 2, 4, 4.6],
  [1, "Centrocampista", 0, 2283, 0, 0, 2, 0, 0, 0, 0, 2, 3, 7.2],
  [1, "Lateral", 0, 1443, 0, 0, 0, 0, 0, 0, 0, 2, 4, 4.6],
  [1, "Delantero", 0, 1374, 0, 0, 0, 0, 0, 0, 0, 1, 2, 5],
  [1, "Polivalente", 0, 1656, 0, 0, 0, 0, 0, 0, 0, 1, 1, 5.2],
  [1, "Extremo", 0, 2100, 1, 0, 1, 0, 0, 0, 0, 2, 1, 8.7],
  [2, "Extremo", 0, 2684, 0, 0, 0, 1, 0, 0, 0, 3, 3, 5.7],
  [2, "Lateral", 0, 2034, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4.8],
  [2, "Lateral", 0, 1642, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4.8],
  [2, "Portero", 1, 2968, 0, 0, 0, 0, 0, 0, 0, 3, 3, 5],
  [2, "Central", 0, 2968, 1, 0, 0, 0, 0, 0, 0, 3, 3, 6.5],
  [2, "Centrocampista", 0, 2224, 0, 0, 0, 0, 0, 0, 0, 2, 2, 5],
  [2, "Lateral", 0, 1715, 0, 0, 0, 0, 0, 0, 0, 3, 2, 5.2],
  [2, "Polivalente", 0, 2083, 0, 0, 0, 0, 0, 0, 0, 2, 2, 5],
  [2, "Extremo", 0, 2458, 2, 1, 0, 0, 0, 0, 0, 3, 2, 8.3],
  [2, "Central", 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1.4], // yellow from the bench
];
const realRole = (position: string, gk: number): Role =>
  gk ? "GK" : position === "Central" || position === "Lateral" ? "DEF" : position === "Delantero" ? "FWD" : "MID";

console.log(`\n## 2. Partidos reales (sin top 3 ni acciones ⭐/⚠️, que aún no existen)`);
console.log("partido | puesto (ficha) | min | en el campo | G-A | producción -> revisada");
for (const [m, position, gk, secs, G, P, A, PW, Y, Rd, OG, gf, ga, prod] of REAL_ROWS) {
  const match = REAL_MATCHES[m];
  const expected = (goals: number) => (goals + PRIOR_MATCHES * LEAGUE_GOALS) / (match.oppPJ + PRIOR_MATCHES);
  const onBench = secs === 0;
  const revised = revisedRating({
    role: realRole(position, gk),
    secondsPlayed: secs,
    matchSeconds: match.seconds,
    goals: G,
    penaltyGoals: P,
    assists: A,
    penaltiesWon: PW,
    yellowCards: onBench ? 0 : Y,
    redCards: onBench ? 0 : Rd,
    benchYellowCards: onBench ? Y : 0,
    benchRedCards: onBench ? Rd : 0,
    ownGoals: OG,
    keyActions: 0,
    keyErrors: 0,
    goalsForWhileOnPitch: gf,
    goalsAgainstWhileOnPitch: ga,
    expectedFor: expected(match.oppGC),
    expectedAgainst: expected(match.oppGF),
    top3Rank: 0,
  });
  const label = gk ? `${position} (de portero)` : position;
  console.log(
    `${match.name} | ${label} | ${Math.round(secs / 60)}' | ${gf}-${ga} | ${G}-${A}${Y ? " TA" : ""}${OG ? " PP" : ""} | ${prod} -> ${revised}`
  );
}

// ---------- 3. Examples (50' match, rival of league average: 2.9 / 2.9) ----------
const quiet: RevisedInput = {
  role: "MID", secondsPlayed: 3000, matchSeconds: 3000, goals: 0, penaltyGoals: 0, assists: 0, penaltiesWon: 0,
  yellowCards: 0, redCards: 0, benchYellowCards: 0, benchRedCards: 0, ownGoals: 0, keyActions: 0, keyErrors: 0,
  goalsForWhileOnPitch: 0, goalsAgainstWhileOnPitch: 0, expectedFor: 2.9, expectedAgainst: 2.9, top3Rank: 0,
};
const EXAMPLES: [string, Partial<RevisedInput>][] = [
  ["Portero, gana 3-1", { role: "GK", goalsForWhileOnPitch: 3, goalsAgainstWhileOnPitch: 1 }],
  ["Portero, gana 3-1, 2 paradones ⭐", { role: "GK", goalsForWhileOnPitch: 3, goalsAgainstWhileOnPitch: 1, keyActions: 2 }],
  ["Portero, gana 3-1, 2 ⭐ y 🥇", { role: "GK", goalsForWhileOnPitch: 3, goalsAgainstWhileOnPitch: 1, keyActions: 2, top3Rank: 1 }],
  ["Portero, pierde 2-3", { role: "GK", goalsForWhileOnPitch: 2, goalsAgainstWhileOnPitch: 3 }],
  ["Portero, pierde 1-6", { role: "GK", goalsForWhileOnPitch: 1, goalsAgainstWhileOnPitch: 6 }],
  ["Portero, pierde 1-6 con cantada ⚠️", { role: "GK", goalsForWhileOnPitch: 1, goalsAgainstWhileOnPitch: 6, keyErrors: 1 }],
  ["Lateral 25', en el campo 2-0", { role: "DEF", secondsPlayed: 1500, goalsForWhileOnPitch: 2 }],
  ["Lateral 25', en el campo 0-3", { role: "DEF", secondsPlayed: 1500, goalsAgainstWhileOnPitch: 3 }],
  ["Lateral 50', gana 1-0", { role: "DEF", goalsForWhileOnPitch: 1 }],
  ["Delantero 50', 1 gol en un 3-2", { role: "FWD", goals: 1, goalsForWhileOnPitch: 3, goalsAgainstWhileOnPitch: 2 }],
  ["Delantero 50', sin marcar, pierde 0-2", { role: "FWD", goalsAgainstWhileOnPitch: 2 }],
  ["Delantero entra 10' y marca", { role: "FWD", secondsPlayed: 600, goals: 1, goalsForWhileOnPitch: 1 }],
  ["Amarilla desde el banquillo sin jugar", { secondsPlayed: 0, benchYellowCards: 1 }],
  ["Juega 40', gana 3-1, y amarilla desde el banquillo", { secondsPlayed: 2400, goalsForWhileOnPitch: 3, goalsAgainstWhileOnPitch: 1, benchYellowCards: 1 }],
];
console.log(`\n## 3. Ejemplos (partido de 50', rival de media de la liga)`);
for (const [label, overrides] of EXAMPLES) console.log(`${label.padEnd(46)} ${revisedRating({ ...quiet, ...overrides })}`);
