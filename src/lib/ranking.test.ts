import { describe, expect, it } from "vitest";
import {
  applyChoice,
  availableMatches,
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
    const state = play(ids, "full", (a, b) => (Number(a) < Number(b) ? a : b), "swipe");
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
      const state = play(ids, depth, (a, b) => (a < b ? a : b), "swipe");
      const ranking = rankedIds(state);
      expect(state.strategy).toBe("swiss");
      expect(ranking[0]).toBe("00");
      expect(ranking.at(-1)).toBe("20");
      expect(state.comparisons).toBe(state.estimate);
    }
  });
});

describe("playoff bracket", () => {
  it("keeps a decided match and sends the winner along the line", () => {
    const state = createEngine(["a", "b", "c", "d"], "bracket", "full", () => 0);
    expect(state.strategy).toBe("elim");
    const match = availableMatches(state)[0]!;
    const next = applyChoice(state, match.key, match.a);
    const recorded = next.elim?.matches.find((item) => item.id === match.key);
    expect(recorded?.winner).toBe(match.a);
    expect(recorded?.b).toBe(match.b);
    const parent = next.elim?.matches.find((item) => item.feedA === match.key || item.feedB === match.key);
    expect(parent?.a === match.a || parent?.b === match.a).toBe(true);
    const before = state.elim?.matches.find((item) => item.id === match.key);
    expect(before?.winner).toBeNull();
  });

  it("leaves the other finalist slot empty until that feeder finishes", () => {
    let state = createEngine(["a", "b", "c", "d"], "bracket", "full", () => 0);
    const first = availableMatches(state)[0]!;
    state = applyChoice(state, first.key, first.a);
    const parent = state.elim?.matches.find((item) => item.feedA === first.key || item.feedB === first.key);
    const filled = [parent?.a, parent?.b].filter(Boolean);
    expect(filled).toEqual([first.a]);
    expect(parent?.winner).toBeNull();
    expect(parent?.bye).toBe(false);
  });

  it("auto-advances a bye into the next round", () => {
    const state = createEngine(["a", "b", "c", "d", "e"], "bracket", "full", () => 0);
    const bye = state.elim?.matches.find((match) => match.round === 0 && match.bye && match.winner);
    expect(bye?.winner).toBeTruthy();
    const parent = state.elim?.matches.find((match) => match.feedA === bye?.id || match.feedB === bye?.id);
    expect(parent?.a === bye?.winner || parent?.b === bye?.winner).toBe(true);
  });

  it("places every song in true order", () => {
    const ids = Array.from({ length: 17 }, (_, index) => String(index));
    const state = play(ids, "full", (a, b) => (Number(a) < Number(b) ? a : b), "bracket");
    expect(state.strategy).toBe("elim");
    expect(rankedIds(state)).toEqual(ids);
  });

  it("locks the top 10 and the bottom 10 on a short playoff", () => {
    const ids = Array.from({ length: 25 }, (_, index) => String(index).padStart(2, "0"));
    const state = play(ids, "quick", (a, b) => (a < b ? a : b), "bracket");
    expect(state.strategy).toBe("elim");
    expect(state.elim?.complete).toBe(false);
    const ranking = rankedIds(state);
    expect(ranking.slice(0, 10)).toEqual(ids.slice(0, 10));
    expect(ranking.slice(-10)).toEqual(ids.slice(-10));
    expect(ranking[0]).toBe("00");
    expect(ranking.at(-1)).toBe("24");
  });
});
