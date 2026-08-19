import { describe, it, expect } from "vitest";
import { MatchClockPause, MatchPeriod } from "@prisma/client";
import { elapsedSecondsInPeriod, isPeriodPaused } from "../../src/modules/matchClock/matchClock.service";

function period(overrides: Partial<MatchPeriod> = {}): MatchPeriod {
  return {
    id: "period-1",
    matchId: "match-1",
    type: "first_half",
    startedAt: null,
    endedAt: null,
    ...overrides,
  };
}

function pause(overrides: Partial<MatchClockPause> = {}): MatchClockPause {
  return {
    id: "pause-1",
    periodId: "period-1",
    pausedAt: new Date(),
    resumedAt: null,
    ...overrides,
  };
}

const T0 = new Date("2026-08-19T10:00:00.000Z");
const secondsLater = (s: number) => new Date(T0.getTime() + s * 1000);

describe("elapsedSecondsInPeriod", () => {
  it("is 0 for a period that hasn't started", () => {
    expect(elapsedSecondsInPeriod(period(), [], secondsLater(100))).toBe(0);
  });

  it("counts straight elapsed time with no pauses", () => {
    const p = period({ startedAt: T0 });
    expect(elapsedSecondsInPeriod(p, [], secondsLater(90))).toBe(90);
  });

  it("uses endedAt instead of now once the period is closed", () => {
    const p = period({ startedAt: T0, endedAt: secondsLater(600) });
    expect(elapsedSecondsInPeriod(p, [], secondsLater(9999))).toBe(600);
  });

  it("subtracts time spent in a completed pause", () => {
    const p = period({ startedAt: T0 });
    const pauses = [pause({ pausedAt: secondsLater(30), resumedAt: secondsLater(50) })];
    // 100s of wall-clock elapsed, minus the 20s the clock was paused.
    expect(elapsedSecondsInPeriod(p, pauses, secondsLater(100))).toBe(80);
  });

  it("treats a still-open pause as paused through `now`", () => {
    const p = period({ startedAt: T0 });
    const pauses = [pause({ pausedAt: secondsLater(30), resumedAt: null })];
    // Paused at 30s and never resumed: elapsed time is frozen at 30s
    // regardless of how much further `now` moves.
    expect(elapsedSecondsInPeriod(p, pauses, secondsLater(500))).toBe(30);
  });

  it("never returns negative seconds", () => {
    const p = period({ startedAt: T0 });
    const pauses = [pause({ pausedAt: T0, resumedAt: secondsLater(100) })];
    expect(elapsedSecondsInPeriod(p, pauses, secondsLater(10))).toBe(0);
  });
});

describe("isPeriodPaused", () => {
  it("is false with no pauses", () => {
    expect(isPeriodPaused([])).toBe(false);
  });

  it("is false when every pause has been resumed", () => {
    expect(isPeriodPaused([pause({ resumedAt: secondsLater(10) })])).toBe(false);
  });

  it("is true when the most recent pause is still open", () => {
    expect(isPeriodPaused([pause({ resumedAt: secondsLater(10) }), pause({ resumedAt: null })])).toBe(true);
  });
});
