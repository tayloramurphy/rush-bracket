import { useEffect, useMemo, useState } from "react";
import { albums, songs } from "../lib/catalog";
import { minutesFor, previewPlan, progressOf, type EngineState } from "../lib/ranking";
import { loadSetup, saveSetup } from "../lib/storage";
import type { Depth, Mode } from "../types";
import { StarMark } from "./StarMark";

interface HomeProps {
  notice?: string;
  saved: EngineState | null;
  onStart: (config: { mode: Mode; depth: Depth; name: string; ids: string[] }) => void;
  onResume: () => void;
  onDiscard: () => void;
}

const modes: { id: Mode; title: string; copy: string }[] = [
  {
    id: "swipe",
    title: "Swipe",
    copy: "One head-to-head at a time. Tap or flick the song that wins.",
  },
  {
    id: "bracket",
    title: "Bracket",
    copy: "Winners bracket, a second-chance losers bracket, then a top cut.",
  },
];

const depths: { id: Depth; title: string; copy: string }[] = [
  {
    id: "quick",
    title: "Quick",
    copy: "A few rounds, then a last pass over your favorites and least favorites.",
  },
  {
    id: "standard",
    title: "Standard",
    copy: "A longer tournament with a closer read on both ends of the list.",
  },
  {
    id: "full",
    title: "Full",
    copy: "Every song placed. The whole pool, thoroughly ranked.",
  },
];

export function Home({ notice, saved, onStart, onResume, onDiscard }: HomeProps) {
  const stored = loadSetup();
  const [mode, setMode] = useState<Mode>(stored?.mode ?? "swipe");
  const [depth, setDepth] = useState<Depth>(stored?.depth ?? "full");
  const [name, setName] = useState(stored?.name ?? "");
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(stored?.excluded ?? []));
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);

  useEffect(() => {
    saveSetup({ mode, depth, name, excluded: [...excluded] });
  }, [mode, depth, name, excluded]);

  const pool = useMemo(() => songs.filter((song) => !excluded.has(song.id)), [excluded]);
  const plan = previewPlan(pool.length, depth, mode);
  const albumsOut = albums.filter((album) => album.tracks.every((track) => excluded.has(track.id))).length;

  function onlyAlbum(albumId: string) {
    setExcluded(new Set(songs.filter((song) => song.albumId !== albumId).map((song) => song.id)));
    setOpenAlbum(albumId);
  }

  function toggleAlbum(albumId: string) {
    const album = albums.find((item) => item.id === albumId);
    if (!album) return;
    const ids = album.tracks.map((track) => track.id);
    const allIn = ids.every((id) => !excluded.has(id));
    setExcluded((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (allIn) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleTrack(id: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const savedLabel = saved
    ? `${saved.depth} · ${saved.mode} · ${progressOf(saved).roundLabel} · ${saved.comparisons} decided`
    : "";

  return (
    <div className="shell home">
      <header className="hero" id="content">
        <p className="eyebrow">
          <StarMark size={16} /> Studio albums, 1974–2012
        </p>
        <h1>
          <span>Rush</span> Bracket
        </h1>
        <p className="lede">
          Nineteen records. No live albums, no compilations. Find your favorite, your top 10, and the song you like least — then send the card to a friend.
        </p>
      </header>

      {notice && (
        <p className="banner" role="alert">
          {notice}
        </p>
      )}

      {saved && (
        <div className="banner resume">
          <div>
            <strong>A run is saved on this device.</strong>
            <span>{savedLabel}</span>
          </div>
          <div className="banner-actions">
            <button type="button" className="primary" onClick={onResume}>
              Resume
            </button>
            <button type="button" className="ghost" onClick={onDiscard}>
              Discard
            </button>
          </div>
        </div>
      )}

      <section className="panel" aria-labelledby="mode-heading">
        <div className="panel-head">
          <h2 id="mode-heading">How do you want to play?</h2>
        </div>
        <div className="choice-grid" role="radiogroup" aria-label="Play mode">
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={mode === item.id}
              className={`select-card ${mode === item.id ? "selected" : ""}`}
              onClick={() => setMode(item.id)}
            >
              <span className="select-title">{item.title}</span>
              <span>{item.copy}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="depth-heading">
        <div className="panel-head">
          <h2 id="depth-heading">How deep?</h2>
          <p>Full is the default. Leave anytime — progress stays in this browser.</p>
        </div>
        <div className="choice-grid three" role="radiogroup" aria-label="Ranking depth">
          {depths.map((item) => {
            const info = previewPlan(Math.max(pool.length, 2), item.id, mode);
            const small = pool.length >= 2 && item.id !== "full" && info.complete;
            const copy =
              mode === "bracket" && pool.length >= 2 && pool.length <= 20
                ? "This pool is one playoff. The winner is your favorite."
                : mode === "bracket" && item.id === "full"
                  ? "Winners, then a losers bracket, then a top-20 playoff."
                  : mode === "bracket" && item.id === "standard"
                    ? "The same path, with a top-16 final cut."
                    : mode === "bracket"
                      ? "The same path, with a top-10 final cut."
                      : item.copy;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={depth === item.id}
                className={`select-card ${depth === item.id ? "selected" : ""}`}
                onClick={() => setDepth(item.id)}
              >
                <span className="select-title">{item.title}</span>
                <span>{mode !== "bracket" && small ? "This pool is small, so every song gets a complete place." : copy}</span>
                <span className="estimate">
                  {pool.length < 2 ? "Need 2 songs" : `~${info.estimate} matchups · ~${minutesFor(info.estimate)} min`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel" aria-labelledby="name-heading">
        <div className="panel-head">
          <h2 id="name-heading">Name on the card</h2>
          <p>Optional. It shows up on the share link. Nothing is uploaded.</p>
        </div>
        <label className="name-field">
          <span className="sr-only">Display name</span>
          <input
            value={name}
            maxLength={24}
            placeholder="Your name"
            autoComplete="nickname"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </section>

      <section className="panel" aria-labelledby="pool-heading">
        <div className="panel-head">
          <h2 id="pool-heading">The pool</h2>
          <p>
            {pool.length} songs in · {songs.length - pool.length} sitting out
            {albumsOut > 0 ? ` · ${albumsOut} album${albumsOut === 1 ? "" : "s"} dropped` : ""}
          </p>
        </div>
        <div className="pool-actions">
          <button type="button" className="ghost" onClick={() => setExcluded(new Set())} disabled={excluded.size === 0}>
            Restore full discography
          </button>
        </div>
        <ul className="albums">
          {albums.map((album) => {
            const ids = album.tracks.map((track) => track.id);
            const dropped = ids.filter((id) => excluded.has(id)).length;
            const allOut = dropped === ids.length;
            const open = openAlbum === album.id;
            return (
              <li key={album.id} className={`album ${allOut ? "out" : ""} ${open ? "open" : ""}`}>
                <div className="album-main">
                  <button
                    type="button"
                    className="cover-hit"
                    aria-pressed={!allOut}
                    aria-label={`${allOut ? "Include" : "Drop"} ${album.title}`}
                    onClick={() => toggleAlbum(album.id)}
                  >
                    <img src={album.cover} alt="" width={240} height={240} />
                    {allOut && <span className="out-flag">Out</span>}
                    {dropped > 0 && !allOut && <span className="out-flag partial">{ids.length - dropped}</span>}
                  </button>
                  <div className="album-meta">
                    <h3>{album.title}</h3>
                    <p>
                      {album.year} · {album.tracks.length} tracks
                    </p>
                    <div className="album-links">
                      <button
                        type="button"
                        className="textish"
                        aria-expanded={open}
                        onClick={() => setOpenAlbum(open ? null : album.id)}
                      >
                        {open ? "Hide songs" : "Songs"}
                      </button>
                      <button type="button" className="textish" onClick={() => onlyAlbum(album.id)}>
                        Only
                      </button>
                    </div>
                  </div>
                </div>
                {open && (
                  <ul className="track-list">
                    {album.tracks.map((track) => {
                      const sitting = excluded.has(track.id);
                      return (
                        <li key={track.id}>
                          <label>
                            <input type="checkbox" checked={!sitting} onChange={() => toggleTrack(track.id)} />
                            <span className="num">{track.n}</span>
                            <span>
                              {track.title}
                              {track.detail ? <small>{track.detail}</small> : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="start-bar">
        <button
          type="button"
          className="primary xl"
          disabled={pool.length < 2}
          onClick={() => onStart({ mode, depth, name, ids: pool.map((song) => song.id) })}
        >
          {pool.length < 2 ? "Keep at least two songs" : `Start with ${pool.length} songs`}
        </button>
        <p>
          {plan.complete && mode === "swipe"
            ? "This run builds a complete order, favorite down to least favorite."
            : plan.complete && mode === "bracket"
              ? "One playoff. The winner is your favorite, and earlier exits fill out the rest."
              : mode === "bracket"
                ? "Winners, a losers bracket, then a short final cut. Early exits settle the bottom."
                : "Wins, losses, and a final pass over the top and bottom produce the same kind of result card."}
        </p>
      </div>

      <footer className="colophon">
        <StarMark size={14} />
        <p>
          Track lists from official MusicBrainz studio releases. Cover art from the Cover Art Archive, shown to identify each album.
          Live albums, compilations, and the Feedback EP are not in the pool.
        </p>
      </footer>
    </div>
  );
}
