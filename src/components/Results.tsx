import { useMemo, useState } from "react";
import { songByIndex } from "../lib/catalog";
import { shareHash, summaryText, type ResultPayload } from "../lib/share";
import type { Song } from "../types";
import { StarMark } from "./StarMark";

interface ResultsProps {
  result: ResultPayload;
  shared: boolean;
  onHome: () => void;
  onViewBracket?: () => void;
}

export function Results({ result, shared, onHome, onViewBracket }: ResultsProps) {
  const ranked = useMemo(
    () => result.ranked.map((index) => songByIndex.get(index)).filter((song): song is Song => Boolean(song)),
    [result],
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const favorite = ranked[0];
  const least = ranked[ranked.length - 1];
  const top = ranked.slice(0, Math.min(10, ranked.length));
  const bottom = [...ranked.slice(-Math.min(10, ranked.length))].reverse();
  const who = result.name ? `${result.name}'s` : shared ? "Their" : "Your";
  const url = `${window.location.origin}${window.location.pathname}${window.location.search}${shareHash(result)}`;

  if (!favorite || !least) {
    return (
      <div className="shell">
        <p className="banner" role="alert">
          This result could not be shown.
        </p>
      </div>
    );
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(message);
    } catch {
      setStatus("Copy failed — select the link and copy it manually.");
    }
  }

  async function share() {
    const text = summaryText(result, ranked, url);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Rush Bracket", text, url });
        setStatus("Shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy(text, "Summary copied.");
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await renderCard(result, ranked, url);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = "rush-bracket.png";
      link.click();
      URL.revokeObjectURL(href);
      setStatus("Card downloaded.");
    } catch {
      setStatus("Could not draw the card. The link still works.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell results">
      <header className="hero compact" id="content">
        <p className="eyebrow">
          <StarMark size={16} /> {who} Rush Bracket
        </p>
        <h1>The order is in.</h1>
        <p className="lede">
          {labelMode(result.mode)} · {labelDepth(result.depth)} · {ranked.length} songs
        </p>
      </header>

      <article className="poster">
        <section className="champion">
          <p className="eyebrow">Favorite</p>
          <img src={favorite.cover} alt="" width={720} height={720} />
          <h2>{favorite.title}</h2>
          <p>
            {favorite.album} · {favorite.year}
            {favorite.detail ? ` · ${favorite.detail}` : ""}
          </p>
        </section>

        <RankList title={top.length === 10 ? "Top 10" : `Top ${top.length}`} songs={top} startAt={1} />

        <section className="least">
          <p className="eyebrow">Least favorite</p>
          <img src={least.cover} alt="" width={360} height={360} />
          <h2>{least.title}</h2>
          <p>
            {least.album} · {least.year}
          </p>
        </section>

        <RankList
          title={bottom.length === 10 ? "Top 10 least favorites" : `Least favorites`}
          songs={bottom}
          startAt={1}
        />
        {ranked.length < 20 && (
          <p className="overlap">Short pool — the two lists meet in the middle.</p>
        )}
      </article>

      <div className="share-box">
        <label>
          Share link
          <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <div className="share-actions">
          <button type="button" className="primary" onClick={() => copy(url, "Link copied.")}>
            Copy link
          </button>
          <button type="button" className="ghost" onClick={() => copy(summaryText(result, ranked, url), "Summary copied.")}>
            Copy summary
          </button>
          <button type="button" className="ghost" onClick={share}>
            Share
          </button>
          <button type="button" className="ghost" onClick={download} disabled={busy}>
            {busy ? "Drawing…" : "Download card"}
          </button>
        </div>
        {status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
      </div>

      <div className="start-bar">
        {onViewBracket && (
          <button type="button" className="ghost xl" data-testid="view-bracket" onClick={onViewBracket}>
            View bracket
          </button>
        )}
        <button type="button" className="primary xl" onClick={onHome}>
          {shared ? "Rank yours" : "Rank again"}
        </button>
      </div>
    </div>
  );
}

function RankList({ title, songs, startAt }: { title: string; songs: Song[]; startAt: number }) {
  return (
    <section className="rank-list">
      <h3>{title}</h3>
      <ol>
        {songs.map((song, index) => (
          <li key={`${title}-${song.id}`}>
            <span className="place">{startAt + index}</span>
            <img src={song.cover} alt="" width={56} height={56} />
            <span>
              <strong>{song.title}</strong>
              <small>
                {song.album} · {song.year}
              </small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function labelMode(mode: ResultPayload["mode"]): string {
  return mode === "swipe" ? "Swipe" : "Bracket";
}

function labelDepth(depth: ResultPayload["depth"]): string {
  if (depth === "quick") return "Quick";
  if (depth === "standard") return "Standard";
  return "Full";
}

async function renderCard(result: ResultPayload, ranked: Song[], url: string): Promise<Blob> {
  await document.fonts.load("700 72px Oswald");
  await document.fonts.load("500 28px Outfit");
  const width = 1080;
  const height = 2600;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#07090f";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e10600";
  ctx.beginPath();
  ctx.arc(860, 120, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#07090f";
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  const favorite = ranked[0]!;
  const least = ranked[ranked.length - 1]!;
  const top = ranked.slice(0, Math.min(10, ranked.length));
  const bottom = [...ranked.slice(-Math.min(10, ranked.length))].reverse();
  const [favImg, leastImg] = await Promise.all([loadImage(favorite.cover), loadImage(least.cover)]);

  ctx.fillStyle = "#e4c27a";
  ctx.font = "500 28px Oswald, sans-serif";
  ctx.fillText("RUSH BRACKET", 64, 88);
  ctx.fillStyle = "#f6f1e6";
  ctx.font = "600 34px Outfit, sans-serif";
  const headline = result.name ? `${result.name}'s studio ranking` : "Studio ranking";
  ctx.fillText(headline, 64, 138);

  roundImage(ctx, favImg, 64, 180, 420);
  ctx.fillStyle = "#e10600";
  ctx.font = "700 28px Oswald, sans-serif";
  ctx.fillText("FAVORITE", 520, 250);
  ctx.fillStyle = "#f6f1e6";
  ctx.font = "600 54px Oswald, sans-serif";
  wrapText(ctx, favorite.title, 520, 320, 500, 62);
  ctx.font = "500 28px Outfit, sans-serif";
  ctx.fillStyle = "#a7b0c2";
  ctx.fillText(`${favorite.album} · ${favorite.year}`, 520, 470);

  ctx.fillStyle = "#e4c27a";
  ctx.font = "600 28px Oswald, sans-serif";
  ctx.fillText("TOP 10", 64, 660);
  let y = 710;
  ctx.font = "500 30px Outfit, sans-serif";
  top.forEach((song, index) => {
    ctx.fillStyle = index === 0 ? "#e10600" : "#f6f1e6";
    ctx.fillText(`${index + 1}`, 64, y);
    ctx.fillStyle = "#f6f1e6";
    ctx.fillText(clip(song.title, 28), 130, y);
    ctx.fillStyle = "#6e788c";
    ctx.font = "400 22px Outfit, sans-serif";
    ctx.fillText(clip(`${song.album} · ${song.year}`, 36), 130, y + 28);
    ctx.font = "500 30px Outfit, sans-serif";
    y += 72;
  });

  const leastTop = y + 24;
  ctx.fillStyle = "#1a0c10";
  ctx.fillRect(48, leastTop, width - 96, 250);
  roundImage(ctx, leastImg, 72, leastTop + 28, 190);
  ctx.fillStyle = "#e10600";
  ctx.font = "700 26px Oswald, sans-serif";
  ctx.fillText("LEAST FAVORITE", 290, leastTop + 80);
  ctx.fillStyle = "#f6f1e6";
  ctx.font = "600 42px Oswald, sans-serif";
  wrapText(ctx, least.title, 290, leastTop + 140, 720, 48);

  y = leastTop + 300;
  ctx.fillStyle = "#e4c27a";
  ctx.font = "600 28px Oswald, sans-serif";
  ctx.fillText("TOP 10 LEAST FAVORITES", 64, y);
  y += 48;
  ctx.font = "500 26px Outfit, sans-serif";
  bottom.forEach((song, index) => {
    ctx.fillStyle = "#f6f1e6";
    ctx.fillText(`${index + 1}.  ${clip(song.title, 34)}`, 64, y);
    y += 40;
  });

  ctx.fillStyle = "#6e788c";
  ctx.font = "400 22px Outfit, sans-serif";
  ctx.fillText(clip(url.replace(/^https?:\/\//, ""), 70), 64, height - 56);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("empty"))), "image/png");
  });
}

function roundImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 18);
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number) {
  const words = text.split(" ");
  let row = "";
  let cursor = y;
  let lines = 0;
  for (const word of words) {
    const trial = row ? `${row} ${word}` : word;
    if (ctx.measureText(trial).width > max && row) {
      ctx.fillText(row, x, cursor);
      row = word;
      cursor += line;
      lines += 1;
      if (lines === 2) break;
    } else row = trial;
  }
  if (lines < 2 && row) ctx.fillText(row, x, cursor);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}
