import { describe, expect, it } from "vitest";
import {
  applyChoice,
  availableMatches,
  bracketBoard,
  createEngine,
  finalRanking,
  previewPlan,
  type EngineState,
} from "./ranking";

function play(ids: string[], depth: "quick" | "standard" | "full", prefer: (a: string, b: string) => string, mode: "swipe" | "bracket" = "bracket"): EngineState {
  let state = createEngine(ids, mode, depth, () => 0);
  let guard = 0;
  while (!state.done) {
    const matches = availableMatches(state);
    expect(matches.length, `stuck after ${state.comparisons} comparisons`).toBeGreaterThan(0);
    const match = matches[0]!;
    state = applyChoice(state, match.key, prefer(match.a, match.b));
    if (mode === "bracket") {
      for (const extra of availableMatches(state)) {
        if (state.done) break;
        state = applyChoice(state, extra.key, prefer(extra.a, extra.b));
      }
    }
    if (++guard > 20000) throw new Error("ranking did not finish");
  }
  return state;
}

function rankedIds(state: EngineState): string[] {
  const ranking = finalRanking(state);
  expect(new Set(ranking)).toEqual(new Set(state.ids));
  expect(ranking).toHaveLength(state.ids.length);
  return ranking;
}

describe("full merge ranking", () => {
  it("places every song in the true order, including the bottom", () => {
    const ids = Array.from({ length: 17 }, (_, index) => String(index));
    const state = play(ids, "full", (a, b) => (Number(a) < Number(b) ? a : b));
    expect(rankedIds(state)).toEqual(ids);
    expect(state.comparisons).toBeGreaterThan(ids.length - 1);
    expect(state.comparisons).toBeLessThan(ids.length * Math.log2(ids.length) * 1.2);
  });

  it("ranks a full studio-sized pool", () => {
    const ids = Array.from({ length: 165 }, (_, index) => String(index).padStart(3, "0"));
    const state = play(ids, "full", (a, b) => (a < b ? a : b), "swipe");
    expect(rankedIds(state)[0]).toBe("000");
    expect(rankedIds(state).at(-1)).toBe("164");
    expect(state.strategy).toBe("merge");
  });
});

describe("shorter depths", () => {
  it("uses a full sort when the pool is small", () => {
    expect(previewPlan(8, "quick").complete).toBe(true);
    expect(previewPlan(8, "quick").strategy).toBe("merge");
  });

  it("finishes quick and standard with the favorite on top and the least favorite at the bottom", () => {
    const ids = Array.from({ length: 21 }, (_, index) => String(index).padStart(2, "0"));
    for (const depth of ["quick", "standard"] as const) {
      const state = play(ids, depth, (a, b) => (a < b ? a : b));
      const ranking = rankedIds(state);
      expect(state.strategy).toBe("swiss");
      expect(ranking[0]).toBe("00");
      expect(ranking.at(-1)).toBe("20");
      expect(state.comparisons).toBe(state.estimate);
    }
  });
});

describe("bracket history", () => {
  it("keeps the decided matchup visible and rewinds with the previous snapshot", () => {
    const state = createEngine(["a", "b", "c", "d"], "bracket", "full", () => 0);
    const match = availableMatches(state)[0]!;
    const next = applyChoice(state, match.key, match.a);
    const recorded = bracketBoard(next)
      .columns.flatMap((column) => column.matches)
      .find((item) => item.a === match.a && item.b === match.b);
    expect(recorded?.winner).toBe(match.a);
    expect(recorded?.a).toBe(match.a);
    expect(recorded?.b).toBe(match.b);
    const before = bracketBoard(state)
      .columns.flatMap((column) => column.matches)
      .find((item) => item.a === match.a && item.b === match.b);
    expect(before?.winner).toBeNull();
  });

  it("advances a round-1 winner into the next slot and keeps both rounds", () => {
    let state = createEngine(["a", "b", "c", "d"], "bracket", "full", () => 0);
    expect(state.strategy).toBe("merge");
    const opening = availableMatches(state);
    expect(opening).toHaveLength(2);
    const first = opening[0]!;
    state = applyChoice(state, first.key, first.a);
    const mid = bracketBoard(state);
    expect(mid.columns).toHaveLength(1);
    expect(mid.preview?.slots.some((slot) => slot.a === first.a || slot.b === first.a)).toBe(true);
    const rest = availableMatches(state)[0]!;
    state = applyChoice(state, rest.key, rest.a);
    const board = bracketBoard(state);
    expect(board.columns.map((column) => column.id)).toEqual(["merge-1", "merge-2"]);
    expect(board.columns[0]?.status).toBe("complete");
    const winners = board.columns[0]!.matches.map((item) => item.winner);
    expect(winners.every(Boolean)).toBe(true);
    const round2 = board.columns[1]!.matches.flatMap((item) => [item.a, item.b]);
    expect(new Set(round2)).toEqual(new Set(winners));
  });

  it("records an odd-pool bye on the opening column", () => {
    const state = createEngine(["a", "b", "c", "d", "e"], "bracket", "full", () => 0);
    expect(state.strategy).toBe("merge");
    expect(bracketBoard(state).columns[0]?.byes).toHaveLength(1);
  });

  it("keeps a finished Swiss round when the next round opens", () => {
    const ids = Array.from({ length: 21 }, (_, index) => String(index).padStart(2, "0"));
    let state = createEngine(ids, "bracket", "quick", () => 0);
    expect(state.strategy).toBe("swiss");
    expect(bracketBoard(state).columns[0]?.byes).toHaveLength(1);
    const round1Count = availableMatches(state).length;
    let guard = 0;
    while (state.round === 1 && !state.done) {
      const match = availableMatches(state)[0];
      if (!match) break;
      state = applyChoice(state, match.key, match.a);
      if (++guard > 40) throw new Error("round 1 did not finish");
    }
    const board = bracketBoard(state);
    const first = board.columns.find((column) => column.id === "swiss-1");
    const second = board.columns.find((column) => column.id === "swiss-2");
    expect(state.round).toBe(2);
    expect(first?.status).toBe("complete");
    expect(first?.matches).toHaveLength(round1Count);
    expect(first?.matches.every((match) => match.winner)).toBe(true);
    expect(second?.status).toBe("active");
    expect(second?.matches.some((match) => match.winner === null)).toBe(true);
  });

  it("seeds a board from a saved run that has no archive", () => {
    const state = createEngine(["a", "b", "c", "d"], "bracket", "full", () => 0);
    const match = availableMatches(state)[0]!;
    const legacy = { ...state, archive: undefined, currentBye: undefined } as unknown as EngineState;
    const next = applyChoice(legacy, match.key, match.b);
    const column = bracketBoard(next).columns[0];
    expect(column?.matches.some((item) => item.winner === match.b)).toBe(true);
  });
});
