import type { ElimState } from "./elim";
import { normalizeEngine, type EngineState } from "./ranking";
import type { Depth, Mode } from "../types";

const RUN_KEY = "rush-bracket:run:v1";
const SETUP_KEY = "rush-bracket:setup:v1";
const REVIEW_KEY = "rush-bracket:review:v2";

export interface BracketReview {
  elim: ElimState;
  ranked: number[];
}

export interface SetupPrefs {
  mode: Mode;
  depth: Depth;
  name: string;
  excluded: string[];
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full disk should not crash a run.
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadSetup(): SetupPrefs | null {
  const setup = readJson<SetupPrefs>(SETUP_KEY);
  if (!setup) return null;
  if (setup.mode !== "swipe" && setup.mode !== "bracket") return null;
  if (setup.depth !== "quick" && setup.depth !== "standard" && setup.depth !== "full") return null;
  if (!Array.isArray(setup.excluded) || typeof setup.name !== "string") return null;
  return setup;
}

export function saveSetup(setup: SetupPrefs): void {
  writeJson(SETUP_KEY, setup);
}

export function loadRun(): EngineState | null {
  const run = readJson<EngineState>(RUN_KEY);
  if (!run || run.v !== 1 || !Array.isArray(run.ids) || run.ids.length < 2 || run.done) return null;
  if (run.strategy !== "merge" && run.strategy !== "swiss" && run.strategy !== "elim") return null;
  if (run.strategy === "elim" && !isElimV2(run.elim)) return null;
  normalizeEngine(run);
  return run;
}

function isElimV2(elim: ElimState | null): boolean {
  if (!elim || elim.v !== 2 || !Array.isArray(elim.trees) || elim.trees.length === 0) return false;
  return elim.trees.every((tree) => Array.isArray(tree?.matches));
}

export function saveRun(engine: EngineState): void {
  writeJson(RUN_KEY, engine);
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function loadReview(): BracketReview | null {
  const review = readJson<BracketReview>(REVIEW_KEY);
  if (!review || !Array.isArray(review.ranked) || !isElimV2(review.elim)) return null;
  return review;
}

export function saveReview(review: BracketReview): void {
  writeJson(REVIEW_KEY, review);
}

export function reviewMatches(review: BracketReview | null, ranked: number[]): boolean {
  if (!review || review.ranked.length !== ranked.length) return false;
  return review.ranked.every((index, place) => index === ranked[place]);
}
