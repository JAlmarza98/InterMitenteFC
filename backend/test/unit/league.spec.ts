import { describe, it, expect } from "vitest";
import { parseStandings } from "../../src/modules/league/league.service";

describe("parseStandings", () => {
  it("maps the source's positional rows and flags our team", () => {
    const body = {
      rows: [
        { id: "1", cell: ["1", "img/sin_imagen.png", "LOS KIURCHX", "9", "3", "3", "0", "0", "12", "5", "7", "0", "0", "1", "27849"] },
        { id: "6", cell: ["6", "img/sin_imagen.png", "INTERMITENTE F.C.", "4", "3", "1", "1", "1", "9", "10", "-1", "0", "0", "2", "27849"] },
      ],
    };
    expect(parseStandings(body)).toEqual([
      { position: 1, team: "LOS KIURCHX", points: 9, played: 3, won: 3, drawn: 0, lost: 0, goalsFor: 12, goalsAgainst: 5, goalDifference: 7, isOurTeam: false },
      { position: 6, team: "INTERMITENTE F.C.", points: 4, played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 9, goalsAgainst: 10, goalDifference: -1, isOurTeam: true },
    ]);
  });

  it("rejects a response that isn't the standings shape", () => {
    expect(() => parseStandings({ error: "x" })).toThrow();
  });
});
