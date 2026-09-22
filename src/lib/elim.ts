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

export interface ElimState {
  region: "championship" | "basement";
  /** Best to worst, filled from the front. */
  top: string[];
  /** Worst first. */
  bottom: string[];
  topTarget: number;
  bottomTarget: number;
  complete: boolean;
  /** Songs in this run, seeded order. */
  pool: string[];
  matches: ElimMatch[];
  /** Frozen copy of the tree at the moment the champion is crowned. */
  championship: ElimMatch[] | null;
  /** pair key → the song the user prefers. */
  preferences: Record<string, string>;
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

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function nextPow2(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

export function elimPlan(n: number, depth: Depth): ElimPlan {
  const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
  const small = n <= 20;
  if (n < 2) return { topTarget: n, bottomTarget: 0, complete: true, estimate: 0, rounds: 0 };
  if (depth === "full" || small) {
    return { topTarget: n, bottomTarget: 0, complete: true, estimate: estimateExtract(n, n), rounds };
  }
  const top = Math.min(depth === "quick" ? 10 : 16, n);
  const bottom = Math.min(depth === "quick" ? 10 : 16, n - top);
  if (top + bottom >= n) {
    return { topTarget: n, bottomTarget: 0, complete: true, estimate: estimateExtract(n, n), rounds };
  }
  const basement = n - top;
  const estimate = estimateExtract(n, top) + estimateExtract(basement, bottom);
  return { topTarget: top, bottomTarget: bottom, complete: false, estimate, rounds };
}

/** Championship games plus a path replay for each later place. */
function estimateExtract(n: number, places: number): number {
  if (n < 2 || places < 1) return 0;
  const take = Math.min(places, n);
  const path = Math.max(0, Math.ceil(Math.log2(n)) - 1);
  return n - 1 + Math.max(0, take - 1) * path;
}

export function createElim(ids: string[], depth: Depth): ElimState {
  const plan = elimPlan(ids.length, depth);
  const elim: ElimState = {
    region: "championship",
    top: [],
    bottom: [],
    topTarget: plan.topTarget,
    bottomTarget: plan.bottomTarget,
    complete: plan.complete,
    pool: [...ids],
    matches: buildTree(ids),
    championship: null,
    preferences: {},
    done: false,
    estimate: plan.estimate,
  };
  settle(elim);
  return elim;
}

export function elimOpen(elim: ElimState): { key: string; a: string; b: string }[] {
  if (elim.done) return [];
  return elim.matches
    .filter((match) => match.a && match.b && !match.winner)
    .sort((a, b) => a.round - b.round || a.index - b.index)
    .map((match) => ({ key: match.id, a: match.a!, b: match.b! }));
}

export function chooseElim(elim: ElimState, key: string, winnerId: string): void {
  const match = elim.matches.find((item) => item.id === key);
  if (!match || !match.a || !match.b || match.winner) throw new Error("That matchup is no longer open");
  if (winnerId !== match.a && winnerId !== match.b) throw new Error("Pick one of the two songs");
  elim.preferences[pairKey(match.a, match.b)] = winnerId;
  settle(elim);
}

export function elimRanking(elim: ElimState): string[] {
  const top = new Set(elim.top);
  const bottom = new Set(elim.bottom);
  const middle = elim.pool.filter((id) => !top.has(id) && !bottom.has(id));
  return [...elim.top, ...middle, ...elim.bottom.slice().reverse()];
}

export function elimRoundLabel(elim: ElimState): string {
  if (elim.done) return "Ranking complete";
  const open = elimOpen(elim)[0];
  const match = open ? elim.matches.find((item) => item.id === open.key) : null;
  const rounds = elim.matches.reduce((max, item) => Math.max(max, item.round), 0) + 1;
  if (elim.region === "basement") {
    const place = elim.bottom.length + 1;
    return match ? `Bottom ${place} · round ${match.round + 1}` : "Bottom bracket";
  }
  if (elim.top.length > 0) return `For #${elim.top.length + 1}`;
  return match ? `Round ${match.round + 1} of ${rounds}` : "Playoff";
}

function buildTree(songs: string[]): ElimMatch[] {
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
        id: `r${round}i${index}`,
        round,
        index,
        a: round === 0 ? (slots[index * 2] ?? null) : null,
        b: round === 0 ? (slots[index * 2 + 1] ?? null) : null,
        winner: null,
        feedA: round === 0 ? null : `r${round - 1}i${index * 2}`,
        feedB: round === 0 ? null : `r${round - 1}i${index * 2 + 1}`,
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

function recompute(elim: ElimState): void {
  const ids = byId(elim.matches);
  const maxRound = elim.matches.reduce((max, match) => Math.max(max, match.round), 0);
  for (let round = 0; round <= maxRound; round++) {
    for (const match of elim.matches) {
      if (match.round !== round) continue;
      if (match.feedA) match.a = ids.get(match.feedA)?.winner ?? null;
      if (match.feedB) match.b = ids.get(match.feedB)?.winner ?? null;
      match.winner = null;
      match.bye = false;
      if (match.a && match.b) {
        const preferred = elim.preferences[pairKey(match.a, match.b)];
        if (preferred === match.a || preferred === match.b) {
          const other = preferred === match.a ? match.b : match.a;
          match.winner = elim.region === "basement" ? other : preferred;
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

function rootMatch(matches: ElimMatch[]): ElimMatch | null {
  let root: ElimMatch | null = null;
  for (const match of matches) {
    if (!root || match.round > root.round) root = match;
  }
  return root;
}

function stripPlayer(matches: ElimMatch[], player: string): void {
  for (const match of matches) {
    if (match.a === player) match.a = null;
    if (match.b === player) match.b = null;
    if (match.winner === player) match.winner = null;
  }
}

function settle(elim: ElimState): void {
  let guard = 0;
  for (;;) {
    if (elim.matches.length === 0) {
      elim.done = true;
      return;
    }
    recompute(elim);
    if (elim.matches.some((match) => match.a && match.b && !match.winner)) return;
    const winner = rootMatch(elim.matches)?.winner ?? null;
    if (!winner) {
      elim.done = true;
      return;
    }
    if (elim.region === "basement") {
      elim.bottom.push(winner);
      if (elim.top.length + elim.bottom.length >= elim.pool.length || elim.bottom.length >= elim.bottomTarget) {
        elim.done = true;
        return;
      }
    } else {
      if (elim.top.length === 0) elim.championship = structuredClone(elim.matches);
      elim.top.push(winner);
      if (elim.top.length >= elim.pool.length) {
        elim.done = true;
        return;
      }
      if (!elim.complete && elim.top.length >= elim.topTarget) {
        beginBasement(elim);
        continue;
      }
    }
    stripPlayer(elim.matches, winner);
    if (++guard > elim.pool.length + 2) throw new Error("Playoff could not place the next song");
  }
}

function beginBasement(elim: ElimState): void {
  const placed = new Set(elim.top);
  const rest = elim.pool.filter((id) => !placed.has(id));
  elim.region = "basement";
  if (rest.length <= 1) {
    if (rest[0]) elim.bottom.push(rest[0]);
    elim.matches = [];
    elim.done = true;
    return;
  }
  elim.matches = buildTree(rest);
}
