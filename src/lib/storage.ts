import { normalizeEngine, type EngineState } from "./ranking";
import type { Depth, Mode } from "../types";

const RUN_KEY = "rush-bracket:run:v1";
const SETUP_KEY = "rush-bracket:setup:v1";

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
  if (run.strategy === "elim" && !run.elim) return null;
  normalizeEngine(run);
  return run;
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
