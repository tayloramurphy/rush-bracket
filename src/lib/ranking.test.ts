import { describe, expect, it, vi } from "vitest";
import { songs } from "./catalog";
import { elimRoundLabel } from "./elim";
import { progressOf, applyChoice, availableMatches, createEngine, finalRanking, previewPlan, type EngineState } from "./ranking";
import { decodeResult, encodeResult, resultFromEngine } from "./share";
import { clearRun, loadRun, saveRun } from "./storage";

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

function winnersOf(state: EngineState) {
  const tree = state.elim?.trees.find((item) => item.id === "winners");
  if (!tree) throw new Error("missing winners bracket");
  return tree.matches;
}

function entrants(matches: { round: number; a: string | null; b: string | null }[]): string[] {
  const players = new Set<string>();
  for (const match of matches) {
    if (match.round !== 0) continue;
    if (match.a) players.add(match.a);
    if (match.b) players.add(match.b);
  }
  return [...players];
}

describe("playoff bracket", () => {
  it("keeps a decided match and sends the winner along the line", () => {
    const state = createEngine(["a", "b", "c", "d"], "bracket", "full", () => 0);
    expect(state.strategy).toBe("elim");
    expect(state.elim?.v).toBe(2);
    const match = availableMatches(state)[0]!;
    const next = applyChoice(state, match.key, match.a);
    const recorded = winnersOf(next).find((item) => item.id === match.key);
    expect(recorded?.winner).toBe(match.a);
    expect(recorded?.b).toBe(match.b);
    const parent = winnersOf(next).find((item) => item.feedA === match.key || item.feedB === match.key);
    expect(parent?.a === match.a || parent?.b === match.a).toBe(true);
    const before = winnersOf(state).find((item) => item.id === match.key);
    expect(before?.winner).toBeNull();
  });

  it("leaves the other finalist slot empty until that feeder finishes", () => {
    let state = createEngine(["a", "b", "c", "d"], "bracket", "full", () => 0);
    const first = availableMatches(state)[0]!;
    state = applyChoice(state, first.key, first.a);
    const parent = winnersOf(state).find((item) => item.feedA === first.key || item.feedB === first.key);
    const filled = [parent?.a, parent?.b].filter(Boolean);
    expect(filled).toEqual([first.a]);
    expect(parent?.winner).toBeNull();
    expect(parent?.bye).toBe(false);
  });

  it("auto-advances a bye into the next round", () => {
    const state = createEngine(["a", "b", "c", "d", "e"], "bracket", "full", () => 0);
    const bye = winnersOf(state).find((match) => match.round === 0 && match.bye && match.winner);
    expect(bye?.winner).toBeTruthy();
    const parent = winnersOf(state).find((match) => match.feedA === bye?.id || match.feedB === bye?.id);
    expect(parent?.a === bye?.winner || parent?.b === bye?.winner).toBe(true);
  });

  it("uses one playoff when the pool is small and crowns the favorite", () => {
    const ids = Array.from({ length: 17 }, (_, index) => String(index));
    const started = createEngine(ids, "bracket", "full", () => 0);
    expect(elimRoundLabel(started.elim!)).toMatch(/^Playoff/);
    expect(elimRoundLabel(started.elim!)).not.toMatch(/For #/);
    const state = play(ids, "full", (a, b) => (Number(a) < Number(b) ? a : b), "bracket");
    expect(state.elim?.trees.map((tree) => tree.id)).toEqual(["winners"]);
    const ranking = rankedIds(state);
    expect(ranking[0]).toBe("0");
    expect(ranking).toHaveLength(17);
  });

  it("plays winners, a second chance, a top cut, and the bottom", () => {
    const ids = Array.from({ length: 80 }, (_, index) => String(index).padStart(2, "0"));
    for (const depth of ["quick", "standard", "full"] as const) {
      const labels = new Set<string>();
      let state = createEngine(ids, "bracket", depth, () => 0);
      expect(state.elim?.topCutSize).toBe(depth === "quick" ? 10 : depth === "standard" ? 16 : 20);
      let guard = 0;
      while (!state.done) {
        labels.add(progressOf(state).roundLabel);
        const matches = availableMatches(state);
        expect(matches.length, `${depth} stuck after ${state.comparisons}`).toBeGreaterThan(0);
        const match = matches[0]!;
        state = applyChoice(state, match.key, match.a < match.b ? match.a : match.b);
        if (++guard > 5000) throw new Error(`${depth} did not finish`);
      }
      const text = [...labels].join(" | ");
      expect(text).not.toMatch(/For #/);
      expect(text).toMatch(/Final Four/);
      expect([...labels].some((label) => label.startsWith("Winners"))).toBe(true);
      expect([...labels].some((label) => label.startsWith("Losers"))).toBe(true);
      expect([...labels].some((label) => label.startsWith("Top "))).toBe(true);
      expect([...labels].some((label) => label.startsWith("Bottom"))).toBe(true);
      const trees = state.elim?.trees.map((tree) => tree.id) ?? [];
      expect(trees).toEqual(expect.arrayContaining(["winners", "losers", "topcut", "bottom"]));
      const top = state.elim?.trees.find((tree) => tree.id === "topcut");
      expect(entrants(top?.matches ?? []).length).toBeLessThanOrEqual(state.elim?.topCutSize ?? 0);
      const ranking = rankedIds(state);
      expect(ranking[0]).toBe("00");
      expect(ranking.at(-1)).toBe("79");
      expect(ranking.slice(0, 10)).toHaveLength(10);
      expect(ranking.slice(-10)).toHaveLength(10);
    }
  });

  it("shares a finished bracket and resumes a v2 run", () => {
    const ids = songs.slice(0, 6).map((song) => song.id);
    const state = play(ids, "full", (a, b) => (a < b ? a : b));
    const result = resultFromEngine(state, "Geddy");
    expect(result.mode).toBe("bracket");
    expect(result.ranked).toHaveLength(6);
    expect(decodeResult(encodeResult(result)).ranked).toEqual(result.ranked);

    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
    localStorage.setItem(
      "rush-bracket:run:v1",
      JSON.stringify({ v: 1, ids: ["a", "b"], strategy: "elim", done: false, elim: { matches: [], region: "championship" } }),
    );
    expect(loadRun()).toBeNull();

    const fresh = createEngine(["a", "b", "c", "d"], "bracket", "quick", () => 0);
    const picked = applyChoice(fresh, availableMatches(fresh)[0]!.key, availableMatches(fresh)[0]!.a);
    saveRun(picked);
    const loaded = loadRun();
    expect(loaded?.elim?.v).toBe(2);
    expect(loaded?.elim?.phase).toBe("winners");
    expect(loaded?.comparisons).toBe(1);
    expect(winnersOf(loaded!).some((match) => match.winner)).toBe(true);
    clearRun();
    expect(loadRun()).toBeNull();
    vi.unstubAllGlobals();
  });
});
