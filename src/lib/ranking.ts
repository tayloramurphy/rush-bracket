import type { Depth, Mode } from "../types";
import { chooseElim, createElim, elimOpen, elimPlan, elimRanking, elimRoundLabel, type ElimState } from "./elim";

export interface MergeSlot {
  left: string[];
  right: string[];
  li: number;
  ri: number;
  out: string[];
}

export interface Pairing {
  a: string;
  b: string;
  winner: string | null;
}

export interface BubbleState {
  order: string[];
  pass: number;
  passes: number;
  region: "top" | "bottom";
  index: number;
  window: number;
}

export interface EngineState {
  v: 1;
  ids: string[];
  mode: Mode;
  depth: Depth;
  strategy: "merge" | "swiss" | "elim";
  ratings: Record<string, number>;
  wins: Record<string, number>;
  losses: Record<string, number>;
  games: Record<string, number>;
  opponents: Record<string, string[]>;
  byes: Record<string, number>;
  played: string[];
  comparisons: number;
  estimate: number;
  done: boolean;
  runs: string[][];
  merges: MergeSlot[];
  leftover: string[][];
  mergeRound: number;
  mergeRounds: number;
  roundsTarget: number;
  round: number;
  pairings: Pairing[];
  phase: "rounds" | "bubble";
  bubble: BubbleState | null;
  bubblePasses: number;
  bubbleWindow: number;
  /** Every matchup this run has shown, including decided ones. */
  archive: BracketColumn[];
  currentBye: string | null;
  /** Set when bracket mode is a single-elimination playoff. */
  elim: ElimState | null;
}

export interface Matchup {
  key: string;
  a: string;
  b: string;
}

export interface BracketMatch {
  uid: string;
  group: number;
  a: string;
  b: string;
  winner: string | null;
  /** Engine key while this match can still be picked. */
  key: string | null;
  fromA: string | null;
  fromB: string | null;
}

export interface BracketLane {
  id: number;
  /** Best-first songs already ordered out of this group. */
  placed: string[];
  open: boolean;
}

export interface BracketColumn {
  id: string;
  label: string;
  detail: string;
  status: "active" | "complete";
  matches: BracketMatch[];
  byes: string[];
  lanes: BracketLane[];
}

export interface BracketPreviewSlot {
  a: string | null;
  b: string | null;
  /** A song that skipped this round, not an unfinished pairing. */
  bye?: boolean;
}

export interface BracketView {
  columns: BracketColumn[];
  preview: { label: string; slots: BracketPreviewSlot[] } | null;
}

export interface PlanInfo {
  strategy: "merge" | "swiss" | "elim";
  estimate: number;
  rounds: number;
  bubblePasses: number;
  bubbleWindow: number;
  complete: boolean;
}

export interface Progress {
  ratio: number;
  roundLabel: string;
  detail: string;
  comparisons: number;
  estimate: number;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function zeros(ids: string[]): Record<string, number> {
  return Object.fromEntries(ids.map((id) => [id, 0]));
}

export function mergeEstimate(n: number): number {
  if (n < 2) return 0;
  return Math.max(1, Math.ceil(n * Math.log2(n) - n + 1));
}

function swissEstimate(n: number, rounds: number, passes: number, window: number): number {
  const games = rounds * Math.floor(n / 2);
  const span = Math.min(window, n);
  const perPass = span >= 2 ? (span - 1) * (n > span ? 2 : 1) : 0;
  return games + perPass * passes;
}

/** How many decisions a depth asks for. Small pools always use a full sort. Bracket mode is a playoff tree. */
export function previewPlan(n: number, depth: Depth, mode: Mode = "swipe"): PlanInfo {
  if (mode === "bracket") {
    const plan = elimPlan(Math.max(0, n), depth);
    return {
      strategy: "elim",
      estimate: plan.estimate,
      rounds: plan.rounds,
      bubblePasses: 0,
      bubbleWindow: plan.bottomTarget,
      complete: plan.complete,
    };
  }
  const full = mergeEstimate(n);
  if (n < 2) {
    return { strategy: "merge", estimate: 0, rounds: 0, bubblePasses: 0, bubbleWindow: 0, complete: true };
  }
  if (depth === "full" || full <= 36) {
    return {
      strategy: "merge",
      estimate: full,
      rounds: Math.ceil(Math.log2(n)),
      bubblePasses: 0,
      bubbleWindow: 0,
      complete: true,
    };
  }
  if (depth === "quick") {
    const rounds = n <= 32 ? 3 : 2;
    const window = Math.min(10, n);
    return {
      strategy: "swiss",
      estimate: swissEstimate(n, rounds, 1, window),
      rounds,
      bubblePasses: 1,
      bubbleWindow: window,
      complete: false,
    };
  }
  const rounds = n <= 48 ? 5 : 4;
  const window = Math.min(16, n);
  return {
    strategy: "swiss",
    estimate: swissEstimate(n, rounds, 2, window),
    rounds,
    bubblePasses: 2,
    bubbleWindow: window,
    complete: false,
  };
}

export function minutesFor(comparisons: number): number {
  return Math.max(1, Math.round((comparisons * 3) / 60));
}

function winPct(state: EngineState, id: string): number {
  const games = state.games[id] ?? 0;
  if (!games) return 0.5;
  return (state.wins[id] ?? 0) / games;
}

function buchholz(state: EngineState, id: string): number {
  let score = 0;
  for (const opp of state.opponents[id] ?? []) score += state.wins[opp] ?? 0;
  return score;
}

export function standings(state: EngineState): string[] {
  const seed = new Map(state.ids.map((id, index) => [id, index]));
  return [...state.ids].sort((a, b) => {
    const pct = winPct(state, b) - winPct(state, a);
    if (pct) return pct;
    const wins = (state.wins[b] ?? 0) - (state.wins[a] ?? 0);
    if (wins) return wins;
    const strength = buchholz(state, b) - buchholz(state, a);
    if (strength) return strength;
    const rating = (state.ratings[b] ?? 0) - (state.ratings[a] ?? 0);
    if (rating) return rating;
    return (seed.get(a) ?? 0) - (seed.get(b) ?? 0);
  });
}

function updateElo(ra: number, rb: number, aWon: boolean): [number, number] {
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
  const score = aWon ? 1 : 0;
  const k = 24;
  return [ra + k * (score - expected), rb + k * (1 - score - (1 - expected))];
}

function record(state: EngineState, a: string, b: string, winner: string, loser: string): void {
  state.wins[winner] = (state.wins[winner] ?? 0) + 1;
  state.losses[loser] = (state.losses[loser] ?? 0) + 1;
  state.games[a] = (state.games[a] ?? 0) + 1;
  state.games[b] = (state.games[b] ?? 0) + 1;
  state.opponents[a]?.push(b);
  state.opponents[b]?.push(a);
  const aWon = winner === a;
  const [nextA, nextB] = updateElo(state.ratings[a] ?? 1500, state.ratings[b] ?? 1500, aWon);
  state.ratings[a] = nextA;
  state.ratings[b] = nextB;
}

function drain(slot: MergeSlot): void {
  if (slot.li >= slot.left.length) {
    while (slot.ri < slot.right.length) slot.out.push(slot.right[slot.ri++]!);
  } else if (slot.ri >= slot.right.length) {
    while (slot.li < slot.left.length) slot.out.push(slot.left[slot.li++]!);
  }
}

function sourceOf(archive: BracketColumn[], songId: string): string | null {
  for (let i = archive.length - 1; i >= 0; i--) {
    const match = [...archive[i]!.matches].reverse().find((item) => item.winner === songId);
    if (match) return match.uid;
  }
  return null;
}

function syncMergeColumn(state: EngineState): void {
  if (!state.archive) state.archive = [];
  if (state.done && state.merges.length === 0) {
    for (const column of state.archive) column.status = "complete";
    return;
  }
  const id = `merge-${state.mergeRound}`;
  let column = state.archive.find((item) => item.id === id);
  if (!column) {
    for (const item of state.archive) item.status = "complete";
    column = {
      id,
      label: `Round ${Math.min(state.mergeRound, state.mergeRounds)}`,
      detail: state.mergeRound === 1 ? "Opening seed" : "Leaders of each group meet",
      status: "active",
      matches: [],
      byes: [],
      lanes: [],
    };
    state.archive.push(column);
  }
  state.merges.forEach((slot, index) => {
    if (slot.li >= slot.left.length || slot.ri >= slot.right.length) return;
    const a = slot.left[slot.li]!;
    const b = slot.right[slot.ri]!;
    const exists = column.matches.some(
      (match) => match.group === index && match.winner === null && match.a === a && match.b === b,
    );
    if (exists) return;
    column.matches.push({
      uid: `${id}-g${index}-m${column.matches.length}`,
      group: index,
      a,
      b,
      winner: null,
      key: `m${index}`,
      fromA: sourceOf(state.archive, a),
      fromB: sourceOf(state.archive, b),
    });
  });
  column.lanes = state.merges.map((slot, index) => ({
    id: index,
    placed: [...slot.out],
    open: slot.li < slot.left.length && slot.ri < slot.right.length,
  }));
  state.leftover.forEach((run, index) => {
    column.lanes.push({ id: state.merges.length + index, placed: [...run], open: false });
  });
  column.byes = state.leftover.flatMap((run) => (run.length === 1 ? run : []));
}

function syncSwissColumn(state: EngineState): void {
  if (!state.archive) state.archive = [];
  const id = `swiss-${state.round}`;
  if (state.archive.some((column) => column.id === id)) return;
  for (const column of state.archive) column.status = "complete";
  const matches = state.pairings.map((pairing, index) => ({
    uid: `${id}-${index}`,
    group: 0,
    a: pairing.a,
    b: pairing.b,
    winner: pairing.winner,
    key: pairing.winner ? null : `p${index}`,
    fromA: sourceOf(state.archive, pairing.a),
    fromB: sourceOf(state.archive, pairing.b),
  }));
  state.archive.push({
    id,
    label: `Round ${state.round}`,
    detail: state.round === 1 ? "Random seed" : "Redrawn from the standings",
    status: "active",
    matches,
    byes: state.currentBye ? [state.currentBye] : [],
    lanes: [],
  });
}

function syncBubbleColumn(state: EngineState): void {
  if (!state.archive) state.archive = [];
  if (state.done || !state.bubble) {
    for (const column of state.archive) column.status = "complete";
    return;
  }
  const bubble = state.bubble;
  const id = `bubble-${bubble.region}-${bubble.pass}`;
  let column = state.archive.find((item) => item.id === id);
  if (!column) {
    for (const item of state.archive) item.status = "complete";
    column = {
      id,
      label: bubble.region === "top" ? "Top cut" : "Bottom cut",
      detail: `Pass ${bubble.pass + 1} · who ranks higher`,
      status: "active",
      matches: [],
      byes: [],
      lanes: [],
    };
    state.archive.push(column);
  }
  const spot = bubbleSpot(state);
  if (spot == null) return;
  const a = bubble.order[spot]!;
  const b = bubble.order[spot + 1]!;
  if (column.matches.some((match) => match.winner === null && match.a === a && match.b === b)) return;
  column.matches.push({
    uid: `${id}-${column.matches.length}`,
    group: 0,
    a,
    b,
    winner: null,
    key: "bubble",
    fromA: sourceOf(state.archive, a),
    fromB: sourceOf(state.archive, b),
  });
}

function markArchiveWinner(state: EngineState, a: string, b: string, winner: string): void {
  if (!state.archive) return;
  for (let i = state.archive.length - 1; i >= 0; i--) {
    const match = [...state.archive[i]!.matches].reverse().find(
      (item) => item.winner === null && ((item.a === a && item.b === b) || (item.a === b && item.b === a)),
    );
    if (!match) continue;
    match.winner = winner;
    match.key = null;
    return;
  }
}

function seedArchive(state: EngineState): void {
  if (!state.archive) state.archive = [];
  if (state.strategy === "elim" || state.archive.length > 0 || state.done) return;
  if (state.strategy === "merge") syncMergeColumn(state);
  else if (state.phase === "bubble") syncBubbleColumn(state);
  else syncSwissColumn(state);
}

function openMerges(state: EngineState): void {
  if (state.runs.length <= 1) {
    state.merges = [];
    state.leftover = [];
    state.done = true;
    for (const column of state.archive ?? []) column.status = "complete";
    return;
  }
  const merges: MergeSlot[] = [];
  const leftover: string[][] = [];
  for (let i = 0; i < state.runs.length; i += 2) {
    const left = state.runs[i];
    const right = state.runs[i + 1];
    if (!left) continue;
    if (!right) leftover.push(left);
    else merges.push({ left, right, li: 0, ri: 0, out: [] });
  }
  state.merges = merges;
  state.leftover = leftover;
  state.done = false;
  syncMergeColumn(state);
}

function chooseBye(order: string[], byes: Record<string, number>): string {
  return [...order].sort((a, b) => {
    const diff = (byes[a] ?? 0) - (byes[b] ?? 0);
    if (diff) return diff;
    return order.indexOf(a) - order.indexOf(b);
  })[0]!;
}

function dealSwiss(state: EngineState): void {
  const order = standings(state);
  const sitting = new Set<string>();
  let bye: string | null = null;
  if (order.length % 2 === 1) {
    bye = chooseBye(order, state.byes);
    sitting.add(bye);
    state.byes[bye] = (state.byes[bye] ?? 0) + 1;
  }
  state.currentBye = bye;
  const pool = order.filter((id) => !sitting.has(id));
  const unpaired = new Set(pool);
  const played = new Set(state.played);
  const pairings: Pairing[] = [];
  for (const player of pool) {
    if (!unpaired.has(player)) continue;
    let opponent: string | null = null;
    for (const other of pool) {
      if (other !== player && unpaired.has(other) && !played.has(pairKey(player, other))) {
        opponent = other;
        break;
      }
    }
    if (!opponent) {
      for (const other of pool) {
        if (other !== player && unpaired.has(other)) {
          opponent = other;
          break;
        }
      }
    }
    if (!opponent) throw new Error("Could not pair the field");
    unpaired.delete(player);
    unpaired.delete(opponent);
    pairings.push({ a: player, b: opponent, winner: null });
    const key = pairKey(player, opponent);
    played.add(key);
    state.played.push(key);
  }
  state.pairings = pairings;
  state.phase = "rounds";
  syncSwissColumn(state);
}

function startBubble(state: EngineState): void {
  const order = standings(state);
  const window = Math.min(state.bubbleWindow, order.length);
  state.phase = "bubble";
  state.bubble = {
    order,
    pass: 0,
    passes: state.bubblePasses,
    region: "top",
    index: 0,
    window,
  };
  if (state.bubblePasses <= 0 || window < 2) {
    state.done = true;
    for (const column of state.archive ?? []) column.status = "complete";
    return;
  }
  syncBubbleColumn(state);
}

function bubbleSpot(state: EngineState): number | null {
  const bubble = state.bubble;
  if (!bubble || state.done) return null;
  const count = bubble.order.length;
  const window = Math.min(bubble.window, count);
  if (window < 2 || bubble.index > window - 2) return null;
  if (bubble.region === "bottom" && count <= window) return null;
  const start = bubble.region === "top" ? 0 : count - window;
  return start + bubble.index;
}

function advanceMerge(state: EngineState, index: number, winnerId: string): void {
  const slot = state.merges[index];
  if (!slot) throw new Error("Missing merge");
  if (winnerId === slot.left[slot.li]) slot.li += 1;
  else slot.ri += 1;
  slot.out.push(winnerId);
  drain(slot);
  const finished = state.merges.every((item) => item.li >= item.left.length && item.ri >= item.right.length);
  if (!finished) {
    syncMergeColumn(state);
    return;
  }
  syncMergeColumn(state);
  state.runs = state.merges.map((item) => item.out).concat(state.leftover);
  state.mergeRound += 1;
  openMerges(state);
}

function advanceSwiss(state: EngineState): void {
  if (state.pairings.some((pairing) => !pairing.winner)) return;
  if (state.round < state.roundsTarget) {
    state.round += 1;
    dealSwiss(state);
    return;
  }
  startBubble(state);
}

function advanceBubble(state: EngineState, winnerId: string): void {
  const bubble = state.bubble;
  const spot = bubbleSpot(state);
  if (!bubble || spot == null) return;
  if (winnerId === bubble.order[spot + 1]) {
    const next = bubble.order[spot + 1]!;
    bubble.order[spot + 1] = bubble.order[spot]!;
    bubble.order[spot] = next;
  }
  bubble.index += 1;
  const count = bubble.order.length;
  const window = Math.min(bubble.window, count);
  if (bubble.index <= window - 2) {
    syncBubbleColumn(state);
    return;
  }
  bubble.index = 0;
  const useBottom = count > window;
  if (bubble.region === "top" && useBottom) {
    bubble.region = "bottom";
    syncBubbleColumn(state);
    return;
  }
  bubble.region = "top";
  bubble.pass += 1;
  if (bubble.pass >= bubble.passes) state.done = true;
  syncBubbleColumn(state);
}

export function createEngine(
  ids: string[],
  mode: Mode,
  depth: Depth,
  random: () => number = Math.random,
): EngineState {
  if (ids.length < 2) throw new Error("Pick at least two songs");
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate songs in the pool");
  const shuffled = shuffle(ids, random);
  const plan = previewPlan(ids.length, depth, mode);
  const state: EngineState = {
    v: 1,
    ids: shuffled,
    mode,
    depth,
    strategy: plan.strategy,
    ratings: Object.fromEntries(shuffled.map((id) => [id, 1500])),
    wins: zeros(shuffled),
    losses: zeros(shuffled),
    games: zeros(shuffled),
    opponents: Object.fromEntries(shuffled.map((id) => [id, [] as string[]])),
    byes: zeros(shuffled),
    played: [],
    comparisons: 0,
    estimate: plan.estimate,
    done: false,
    runs: shuffled.map((id) => [id]),
    merges: [],
    leftover: [],
    mergeRound: 1,
    mergeRounds: Math.max(1, Math.ceil(Math.log2(ids.length))),
    roundsTarget: plan.rounds,
    round: 1,
    pairings: [],
    phase: "rounds",
    bubble: null,
    bubblePasses: plan.bubblePasses,
    bubbleWindow: plan.bubbleWindow,
    archive: [],
    currentBye: null,
    elim: null,
  };
  if (mode === "bracket") {
    state.strategy = "elim";
    state.elim = createElim(shuffled, depth);
    state.estimate = state.elim.estimate;
    state.done = state.elim.done;
    return state;
  }
  if (plan.strategy === "merge") openMerges(state);
  else dealSwiss(state);
  return state;
}

export function availableMatches(state: EngineState): Matchup[] {
  if (state.done) return [];
  if (state.strategy === "elim" && state.elim) return elimOpen(state.elim);
  if (state.strategy === "merge") {
    const matches: Matchup[] = [];
    state.merges.forEach((slot, index) => {
      if (slot.li < slot.left.length && slot.ri < slot.right.length) {
        matches.push({ key: `m${index}`, a: slot.left[slot.li]!, b: slot.right[slot.ri]! });
      }
    });
    return matches;
  }
  if (state.phase === "bubble") {
    const spot = bubbleSpot(state);
    if (spot == null || !state.bubble) return [];
    return [{ key: "bubble", a: state.bubble.order[spot]!, b: state.bubble.order[spot + 1]! }];
  }
  return state.pairings.flatMap((pairing, index) =>
    pairing.winner ? [] : [{ key: `p${index}`, a: pairing.a, b: pairing.b }],
  );
}

/** Fill archive fields missing from an older saved run. */
export function normalizeEngine(state: EngineState): void {
  if (!state.archive) state.archive = [];
  if (state.currentBye === undefined) state.currentBye = null;
  seedArchive(state);
}

export function bracketBoard(state: EngineState): BracketView {
  const columns = state.archive ?? [];
  const active = [...columns].reverse().find((column) => column.status === "active");
  let preview: BracketView["preview"] = null;
  if (
    state.strategy === "merge" &&
    active &&
    active.id.startsWith("merge-") &&
    columns.at(-1)?.id === active.id &&
    state.mergeRound < state.mergeRounds
  ) {
    const slots: BracketPreviewSlot[] = [];
    const lanes = active.lanes ?? [];
    for (let i = 0; i < lanes.length; i += 2) {
      const left = lanes[i];
      const right = lanes[i + 1];
      if (!left) continue;
      if (!right) {
        const song = left.open ? null : (left.placed[0] ?? null);
        if (song) slots.push({ a: song, b: null, bye: true });
        continue;
      }
      const slot = {
        a: left.open ? null : (left.placed[0] ?? null),
        b: right.open ? null : (right.placed[0] ?? null),
      };
      if (slot.a || slot.b) slots.push(slot);
    }
    if (slots.some((slot) => slot.a || slot.b)) {
      preview = {
        label: `Round ${Math.min(state.mergeRound + 1, state.mergeRounds)}`,
        slots,
      };
    }
  }
  return { columns, preview };
}

export function applyChoice(prev: EngineState, key: string, winnerId: string): EngineState {
  const state = structuredClone(prev);
  if (state.strategy === "elim" && state.elim) {
    chooseElim(state.elim, key, winnerId);
    state.comparisons += 1;
    state.done = state.elim.done;
    return state;
  }
  normalizeEngine(state);
  const match = availableMatches(state).find((item) => item.key === key);
  if (!match) throw new Error("That matchup is no longer open");
  if (winnerId !== match.a && winnerId !== match.b) throw new Error("Pick one of the two songs");
  const loserId = winnerId === match.a ? match.b : match.a;
  record(state, match.a, match.b, winnerId, loserId);
  markArchiveWinner(state, match.a, match.b, winnerId);
  state.comparisons += 1;
  if (key.startsWith("m")) advanceMerge(state, Number(key.slice(1)), winnerId);
  else if (key.startsWith("p")) {
    const pairing = state.pairings[Number(key.slice(1))];
    if (!pairing) throw new Error("Missing pairing");
    pairing.winner = winnerId;
    advanceSwiss(state);
  } else if (key === "bubble") advanceBubble(state, winnerId);
  else throw new Error("Unknown matchup");
  return state;
}

export function finalRanking(state: EngineState): string[] {
  if (state.strategy === "elim" && state.elim) return elimRanking(state.elim);
  if (state.strategy === "merge" && state.done) return state.runs[0] ?? [];
  if (state.bubble) return state.bubble.order;
  return standings(state);
}

export function progressOf(state: EngineState): Progress {
  const estimate = Math.max(1, state.estimate);
  const ratio = state.done ? 1 : Math.min(0.98, state.comparisons / estimate);
  let roundLabel: string;
  if (state.strategy === "elim" && state.elim) {
    roundLabel = elimRoundLabel(state.elim);
  } else if (state.strategy === "merge") {
    roundLabel = `Round ${Math.min(state.mergeRound, state.mergeRounds)} of ${state.mergeRounds}`;
  } else if (state.phase === "bubble") {
    roundLabel = state.bubble?.region === "bottom" ? "Settling the bottom 10" : "Settling the top 10";
  } else {
    roundLabel = `Round ${state.round} of ${state.roundsTarget}`;
  }
  const remaining = Math.max(0, estimate - state.comparisons);
  const detail = state.done
    ? "Ranking complete"
    : remaining === 0
      ? "Finishing the order"
      : `${state.comparisons} decided · about ${minutesFor(remaining)} min left`;
  return { ratio, roundLabel, detail, comparisons: state.comparisons, estimate };
}
