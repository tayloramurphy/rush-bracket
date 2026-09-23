import { describe, expect, it } from "vitest";
import { albums, songs } from "./catalog";
import { applyChoice, availableMatches, createEngine } from "./ranking";
import { decodeResult, encodeResult, resultFromEngine, sanitizeName } from "./share";
import fs from "node:fs";
import path from "node:path";

describe("catalog", () => {
  it("contains the 19 studio albums and 165 tracks", () => {
    expect(albums).toHaveLength(19);
    expect(songs).toHaveLength(165);
    expect(albums[0]?.year).toBe(1974);
    expect(albums.at(-1)?.title).toBe("Clockwork Angels");
    expect(new Set(songs.map((song) => song.id)).size).toBe(165);
    expect(new Set(songs.map((song) => song.index)).size).toBe(165);
    for (const album of albums) {
      const file = path.join(process.cwd(), "public", album.cover.replace(/^\//, ""));
      expect(fs.existsSync(file), album.cover).toBe(true);
      expect(album.tracks[0]?.n).toBe(1);
    }
  });
});

describe("share links", () => {
  it("round-trips a finished ranking", () => {
    const pool = songs.slice(0, 6).map((song) => song.id);
    let state = createEngine(pool, "swipe", "full", () => 0);
    while (!state.done) {
      const match = availableMatches(state)[0]!;
      const winner = pool.indexOf(match.a) < pool.indexOf(match.b) ? match.a : match.b;
      state = applyChoice(state, match.key, winner);
    }
    const payload = resultFromEngine(state, "  Alex\nLifeson  ");
    expect(payload.name).toBe("Alex Lifeson");
    expect(payload.ranked).toEqual(pool.map((id) => songs.find((song) => song.id === id)!.index));
    const again = decodeResult(encodeResult(payload));
    expect(again).toEqual(payload);
  });

  it("clips names", () => {
    expect(sanitizeName("  Geddy   Lee  ")).toBe("Geddy Lee");
    expect(sanitizeName("x".repeat(40))).toHaveLength(24);
  });
});
