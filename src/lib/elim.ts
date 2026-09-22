import type { Depth } from "../types";

/** One box in a single-elimination tree. `winner` is whoever advances along the line. */
export interface ElimMatch {
  id: string;
  round: number;
  index: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  feedA: string | null;
  feedB: string | null;
  /** The empty side is a bye, not a slot still waiting on an earlier match. */
  bye: boolean;
}

export type ElimTreeId = "winners" | "losers" | "topcut" | "bottom";
export type ElimPhase = ElimTreeId | "done";

export interface ElimTree {
  id: ElimTreeId;
  matches: ElimMatch[];
}

export interface ElimState {
  v: 2;
  phase: ElimPhase;
  pool: string[];
  /** How many songs the final playoff reseeds. */
  topCutSize: number;
  trees: ElimTree[];
  /** Winners-bracket champion, seeded first into the top cut. */
  champion: string | null;
  /** Songs whose first real match was a loss. */
  oneAndDone: string[];
  preferences: Record<string, string>;
  /** Best to worst, filled when the run finishes. */
  ranking: string[];
  done: boolean;
  estimate: number;
}

export interface ElimPlan {
  topTarget: number;
  bottomTarget: number;
  complete: boolean;
  estimate: number;
  rounds: number;
}

const SMALL_POOL = 20;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function nextPow2(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

export function cutSize(depth: Depth): number {
  if (depth === "quick") return 10;
  if (depth === "standard") return 16;
  return 20;
}

export function elimPlan(n: number, depth: Depth): ElimPlan {
  const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
  const cut = Math.min(cutSize(depth), Math.max(2, n));
  if (n < 2) return { topTarget: n, bottomTarget: 0, complete: true, estimate: 0, rounds: 0 };
  if (n <= SMALL_POOL) {
    return { topTarget: n, bottomTarget: 0, complete: true, estimate: n - 1, rounds };
  }
  const winners = n - 1;
  const second = Math.max(0, Math.ceil(n / 2) - 1);
  const losers = Math.max(0, second - (cut - 1));
  const top = Math.max(0, Math.min(cut, second + 1) - 1);
  const bottom = Math.max(0, Math.floor(n / 2) - 1);
  return {
    topTarget: cut,
    bottomTarget: Math.min(10, n),
    complete: false,
    estimate: winners + losers + top + bottom,
    rounds,
  };
}

export function createElim(ids: string[], depth: Depth): ElimState {
  const plan = elimPlan(ids.length, depth);
  const elim: ElimState = {
    v: 2,
    phase: "winners",
    pool: [...ids],
    topCutSize: plan.topTarget,
    trees: [{ id: "winners", matches: buildTree(ids, "w") }],
    champion: null,
    oneAndDone: [],
    preferences: {},
    ranking: [],
    done: false,
    estimate: plan.estimate,
  };
  settle(elim);
  return elim;
}

export function elimOpen(elim: ElimState): { key: string; a: string; b: string }[] {
  if (elim.done || elim.phase === "done") return [];
  const tree = elim.trees.find((item) => item.id === elim.phase);
  if (!tree) return [];
  return openMatches(tree)
    .sort((a, b) => a.round - b.round || a.index - b.index)
    .map((match) => ({ key: match.id, a: match.a!, b: match.b! }));
}

export function chooseElim(elim: ElimState, key: string, winnerId: string): void {
  const tree = elim.trees.find((item) => item.id === elim.phase);
  const match = tree?.matches.find((item) => item.id === key);
  if (!match || !match.a || !match.b || match.winner) throw new Error("That matchup is no longer open");
  if (winnerId !== match.a && winnerId !== match.b) throw new Error("Pick one of the two songs");
  elim.preferences[pairKey(match.a, match.b)] = winnerId;
  settle(elim);
}

export function elimRanking(elim: ElimState): string[] {
  if (elim.ranking.length === elim.pool.length) return elim.ranking;
  return elim.pool;
}

export function elimRoundLabel(elim: ElimState): string {
  if (elim.done || elim.phase === "done") return "Ranking complete";
  const tree = elim.trees.find((item) => item.id === elim.phase);
  const open = elimOpen(elim)[0];
  const match = open ? tree?.matches.find((item) => item.id === open.key) : null;
  const rounds = (tree?.matches.reduce((max, item) => Math.max(max, item.round), 0) ?? 0) + 1;
  const roundName = match ? phaseRoundName(elim.phase, match.round, rounds) : "Round 1";
  return `${phaseTitle(elim)} · ${roundName}`;
}

export function phaseTitle(elim: ElimState): string {
  if (elim.phase === "losers") return "Losers";
  if (elim.phase === "bottom") return "Bottom";
  if (elim.phase === "topcut") return `Top ${elim.topCutSize}`;
  if (elim.pool.length <= SMALL_POOL) return "Playoff";
  return "Winners";
}

function phaseRoundName(phase: ElimPhase, round: number, rounds: number): string {
  const fromEnd = rounds - 1 - round;
  if (phase === "topcut" && fromEnd === 1) return "Final Four";
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2 && rounds > 3) return "Quarterfinal";
  return `Round ${round + 1}`;
}

function buildTree(songs: string[], prefix: string): ElimMatch[] {
  if (songs.length < 2) return [];
  const size = nextPow2(songs.length);
  const rounds = Math.round(Math.log2(size));
  const slots: (string | null)[] = Array.from({ length: size }, () => null);
  let cursor = 0;
  for (let i = 0; i < size && cursor < songs.length; i += 2) slots[i] = songs[cursor++] ?? null;
  for (let i = 1; i < size && cursor < songs.length; i += 2) slots[i] = songs[cursor++] ?? null;
  const matches: ElimMatch[] = [];
  for (let round = 0; round < rounds; round++) {
    const count = size >> (round + 1);
    for (let index = 0; index < count; index++) {
      matches.push({
        id: `${prefix}-r${round}i${index}`,
        round,
        index,
        a: round === 0 ? (slots[index * 2] ?? null) : null,
        b: round === 0 ? (slots[index * 2 + 1] ?? null) : null,
        winner: null,
        feedA: round === 0 ? null : `${prefix}-r${round - 1}i${index * 2}`,
        feedB: round === 0 ? null : `${prefix}-r${round - 1}i${index * 2 + 1}`,
        bye: false,
      });
    }
  }
  return matches;
}

function byId(matches: ElimMatch[]): Map<string, ElimMatch> {
  return new Map(matches.map((match) => [match.id, match]));
}

function sideReady(match: ElimMatch, side: "a" | "b", ids: Map<string, ElimMatch>): boolean {
  const feedId = side === "a" ? match.feedA : match.feedB;
  if (!feedId) return true;
  const feed = ids.get(feedId);
  if (!feed) return true;
  if (feed.winner) return true;
  if (!feed.a && !feed.b && sideReady(feed, "a", ids) && sideReady(feed, "b", ids)) return true;
  return false;
}

function recomputeTree(matches: ElimMatch[], preferences: Record<string, string>, worseAdvances: boolean): void {
  const ids = byId(matches);
  const maxRound = matches.reduce((max, match) => Math.max(max, match.round), 0);
  for (let round = 0; round <= maxRound; round++) {
    for (const match of matches) {
      if (match.round !== round) continue;
      if (match.feedA) match.a = ids.get(match.feedA)?.winner ?? null;
      if (match.feedB) match.b = ids.get(match.feedB)?.winner ?? null;
      match.winner = null;
      match.bye = false;
      if (match.a && match.b) {
        const preferred = preferences[pairKey(match.a, match.b)];
        if (preferred === match.a || preferred === match.b) {
          const other = preferred === match.a ? match.b : match.a;
          match.winner = worseAdvances ? other : preferred;
        }
      } else if (match.a && !match.b && sideReady(match, "b", ids)) {
        match.bye = true;
        match.winner = match.a;
      } else if (match.b && !match.a && sideReady(match, "a", ids)) {
        match.bye = true;
        match.winner = match.b;
      }
    }
  }
}

function openMatches(tree: ElimTree): ElimMatch[] {
  return tree.matches.filter((match) => match.a && match.b && !match.winner);
}

function rootMatch(matches: ElimMatch[]): ElimMatch | null {
  let root: ElimMatch | null = null;
  for (const match of matches) {
    if (!root || match.round > root.round) root = match;
  }
  return root;
}

function eliminated(matches: ElimMatch[]): Set<string> {
  const out = new Set<string>();
  for (const match of matches) {
    if (!match.winner || !match.a || !match.b || match.bye) continue;
    out.add(match.winner === match.a ? match.b : match.a);
  }
  return out;
}

function survivors(matches: ElimMatch[], entrants: string[]): string[] {
  const gone = eliminated(matches);
  return entrants.filter((id) => !gone.has(id));
}

/** First non-bye result for a song in a tree. */
function firstRealResult(matches: ElimMatch[], id: string): "win" | "loss" | "none" {
  const played = matches
    .filter((match) => !match.bye && match.winner && (match.a === id || match.b === id))
    .sort((a, b) => a.round - b.round);
  const match = played[0];
  if (!match?.winner) return "none";
  return match.winner === id ? "win" : "loss";
}

function settle(elim: ElimState): void {
  let guard = 0;
  while (elim.phase !== "done") {
    if (++guard > 12) throw new Error("Playoff phase did not advance");
    const tree = elim.trees.find((item) => item.id === elim.phase);
    if (!tree) {
      finish(elim);
      return;
    }
    recomputeTree(tree.matches, elim.preferences, tree.id === "bottom");
    if (tree.id === "losers" && elim.champion) {
      const alive = survivors(tree.matches, loserEntrants(elim));
      if (alive.length <= Math.max(1, elim.topCutSize - 1)) {
        startTopCut(elim, [elim.champion, ...alive]);
        continue;
      }
    }
    if (openMatches(tree).length > 0) return;
    if (tree.id === "winners") {
      afterWinners(elim);
      continue;
    }
    if (tree.id === "losers") {
      startTopCut(elim, [elim.champion!, ...survivors(tree.matches, loserEntrants(elim))]);
      continue;
    }
    if (tree.id === "topcut") {
      startBottom(elim);
      continue;
    }
    finish(elim);
    return;
  }
}

function loserEntrants(elim: ElimState): string[] {
  const tree = elim.trees.find((item) => item.id === "losers");
  if (!tree) return [];
  const players = new Set<string>();
  for (const match of tree.matches) {
    if (match.round !== 0) continue;
    if (match.a) players.add(match.a);
    if (match.b) players.add(match.b);
  }
  return [...players];
}

function afterWinners(elim: ElimState): void {
  const matches = elim.trees.find((item) => item.id === "winners")!.matches;
  const champion = rootMatch(matches)?.winner ?? null;
  if (!champion) {
    finish(elim);
    return;
  }
  elim.champion = champion;
  elim.oneAndDone = elim.pool.filter((id) => id !== champion && firstRealResult(matches, id) !== "win");
  if (elim.pool.length <= SMALL_POOL) {
    elim.ranking = orderUnique(elim.pool, placementOrder(matches));
    elim.phase = "done";
    elim.done = true;
    return;
  }
  const second = elim.pool.filter((id) => id !== champion && !elim.oneAndDone.includes(id));
  const keep = Math.max(1, elim.topCutSize - 1);
  if (second.length <= keep) {
    startTopCut(elim, [champion, ...second]);
    return;
  }
  elim.trees.push({ id: "losers", matches: buildTree(second, "l") });
  elim.phase = "losers";
}

function startTopCut(elim: ElimState, field: string[]): void {
  const unique = dedupe(field);
  if (unique.length < 2) {
    startBottom(elim);
    return;
  }
  elim.trees.push({ id: "topcut", matches: buildTree(unique, "t") });
  elim.phase = "topcut";
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function startBottom(elim: ElimState): void {
  const field = elim.oneAndDone.filter((id) => elim.pool.includes(id));
  if (field.length < 2) {
    finish(elim);
    return;
  }
  elim.trees.push({ id: "bottom", matches: buildTree(field, "b") });
  elim.phase = "bottom";
}

function finish(elim: ElimState): void {
  const winners = elim.trees.find((item) => item.id === "winners");
  const top = elim.trees.find((item) => item.id === "topcut");
  const bottom = elim.trees.find((item) => item.id === "bottom");
  const losers = elim.trees.find((item) => item.id === "losers");
  let bestToWorst: string[];
  if (!top && !bottom) {
    bestToWorst = winners ? placementOrder(winners.matches) : [];
  } else {
    const topOrder = top ? placementOrder(top.matches) : elim.champion ? [elim.champion] : [];
    const worstFirst = bottom ? placementOrder(bottom.matches) : [...elim.oneAndDone];
    const used = new Set<string>([...topOrder, ...worstFirst]);
    const middle = losers ? placementOrder(losers.matches).filter((id) => !used.has(id)) : [];
    for (const id of middle) used.add(id);
    bestToWorst = [...topOrder, ...middle, ...worstFirst.reverse()];
  }
  elim.ranking = orderUnique(elim.pool, bestToWorst);
  elim.phase = "done";
  elim.done = true;
}

/** Champion (or bottom-bracket "worst") first, then earlier exits. */
function placementOrder(matches: ElimMatch[]): string[] {
  const players = new Set<string>();
  const eliminatedRound = new Map<string, number>();
  for (const match of matches) {
    if (match.a) players.add(match.a);
    if (match.b) players.add(match.b);
    if (!match.winner || !match.a || !match.b || match.bye) continue;
    const loser = match.winner === match.a ? match.b : match.a;
    eliminatedRound.set(loser, match.round);
  }
  const champ = rootMatch(matches)?.winner ?? null;
  return [...players].sort((a, b) => {
    const ra = a === champ ? 999 : (eliminatedRound.get(a) ?? -1);
    const rb = b === champ ? 999 : (eliminatedRound.get(b) ?? -1);
    if (ra !== rb) return rb - ra;
    return a < b ? -1 : 1;
  });
}

function orderUnique(pool: string[], preferred: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of preferred) {
    if (!pool.includes(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  for (const id of pool) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}
