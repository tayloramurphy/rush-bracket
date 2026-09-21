import { CATALOG_VERSION, songById, songByIndex } from "./catalog";
import { finalRanking, type EngineState } from "./ranking";
import type { Depth, Mode, Song } from "../types";

export interface ResultPayload {
  v: 1;
  c: number;
  mode: Mode;
  depth: Depth;
  name: string;
  ranked: number[];
}

export function sanitizeName(name: string): string {
  return name.replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);
}

export function encodeResult(payload: ResultPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function decodeResult(token: string): ResultPayload {
  const pad = token.length % 4 === 0 ? "" : "=".repeat(4 - (token.length % 4));
  const binary = atob(token.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes)) as ResultPayload;
  if (data?.v !== 1 || data.c !== CATALOG_VERSION) throw new Error("This link is from a different version of Rush Bracket.");
  if (data.mode !== "swipe" && data.mode !== "bracket") throw new Error("This link is missing a play mode.");
  if (data.depth !== "quick" && data.depth !== "standard" && data.depth !== "full") {
    throw new Error("This link is missing a ranking depth.");
  }
  if (!Array.isArray(data.ranked) || data.ranked.length < 2) throw new Error("This link does not include a ranking.");
  const seen = new Set<number>();
  for (const index of data.ranked) {
    if (!songByIndex.has(index) || seen.has(index)) throw new Error("This link names a song that is not in the studio catalog.");
    seen.add(index);
  }
  return { ...data, name: sanitizeName(data.name ?? "") };
}

export function resultFromEngine(state: EngineState, name: string): ResultPayload {
  const ranked = finalRanking(state).map((id) => {
    const song = songById.get(id);
    if (!song) throw new Error("Ranking referenced a song outside the catalog");
    return song.index;
  });
  return {
    v: 1,
    c: CATALOG_VERSION,
    mode: state.mode,
    depth: state.depth,
    name: sanitizeName(name),
    ranked,
  };
}

export function songsFromResult(result: ResultPayload): Song[] {
  return result.ranked.map((index) => {
    const song = songByIndex.get(index);
    if (!song) throw new Error("Missing song");
    return song;
  });
}

export function shareHash(result: ResultPayload): string {
  return `#r=${encodeResult(result)}`;
}

export function readShareToken(): { result: ResultPayload } | { error: string } | null {
  const hash = window.location.hash;
  if (!hash.startsWith("#r=")) return null;
  try {
    return { result: decodeResult(hash.slice(3)) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "This share link could not be read." };
  }
}

export function summaryText(result: ResultPayload, songs: Song[], url: string): string {
  const who = result.name ? `${result.name}'s` : "My";
  const favorite = songs[0]!;
  const least = songs[songs.length - 1]!;
  const top = songs.slice(0, Math.min(10, songs.length));
  const bottom = songs.slice(-Math.min(10, songs.length)).reverse();
  const line = (song: Song, place: number) => `${place}. ${song.title} — ${song.album} (${song.year})`;
  return [
    "RUSH BRACKET",
    `${who} studio ranking`,
    "",
    `#1 ${favorite.title} — ${favorite.album} (${favorite.year})`,
    "",
    "Top 10",
    ...top.map((song, index) => line(song, index + 1)),
    "",
    `Least favorite: ${least.title} — ${least.album} (${least.year})`,
    "",
    "Top 10 least favorites",
    ...bottom.map((song, index) => line(song, index + 1)),
    "",
    `Rank yours: ${url}`,
  ].join("\n");
}
