import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { requireSong } from "../lib/catalog";
import { availableMatches, progressOf, type EngineState, type Matchup } from "../lib/ranking";
import type { Song } from "../types";
import { BracketBoard } from "./BracketBoard";
import { ElimBracket } from "./ElimBracket";
import { StarMark } from "./StarMark";

interface PlayProps {
  engine: EngineState;
  canUndo: boolean;
  onChoose: (key: string, winner: string) => void;
  onUndo: () => void;
  onExit: () => void;
}

export function Play({ engine, canUndo, onChoose, onUndo, onExit }: PlayProps) {
  const matches = availableMatches(engine);
  const progress = progressOf(engine);
  const heatKey = `${engine.strategy}:${engine.mergeRound}:${engine.round}:${engine.phase}:${engine.bubble?.region ?? ""}:${engine.bubble?.pass ?? 0}`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.repeat) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        onUndo();
        return;
      }
      const match = matches[0];
      if (!match) return;
      if (event.key === "1" || event.key === "ArrowLeft") {
        event.preventDefault();
        onChoose(match.key, match.a);
      } else if (event.key === "2" || event.key === "ArrowRight") {
        event.preventDefault();
        onChoose(match.key, match.b);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [matches, onChoose, onUndo]);

  useEffect(() => {
    if (engine.mode !== "swipe") return;
    document.getElementById("content")?.focus();
  }, [heatKey, engine.mode]);

  const left = matches[0] ? requireSong(matches[0].a) : null;
  const right = matches[0] ? requireSong(matches[0].b) : null;

  return (
    <div className="play">
      <header className="playbar">
        <div className="shell bar-inner">
          <button type="button" className="brand-button" onClick={onExit}>
            <StarMark size={18} />
            <span>Rush Bracket</span>
          </button>
          <div className="progress-copy">
            <strong>{progress.roundLabel}</strong>
            <span>{progress.detail}</span>
          </div>
          <button type="button" className="ghost" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
        </div>
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
        </div>
      </header>

      <main className={`shell play-main ${engine.mode === "bracket" ? "bracket-main" : ""}`} id="content" tabIndex={-1}>
        <p className="sr-only" aria-live="polite">
          {left && right
            ? `${progress.roundLabel}. ${left.title} or ${right.title}. ${matches.length} open matchup${matches.length === 1 ? "" : "s"}.`
            : "Ranking complete"}
        </p>
        {engine.mode === "swipe" && <h1>Which one wins?</h1>}
        {engine.mode === "swipe" && (
          <p className="hint">Tap the song you prefer, or flick it sideways. Keys 1 and 2. Z undoes.</p>
        )}
        {engine.mode === "bracket" && engine.strategy !== "elim" && (
          <>
            <h1>Bracket</h1>
            <p className="hint">
              Pick a side in the open match. Winners move ahead, and finished rounds stay on the board. Keys 1 and 2, Z undoes.
            </p>
          </>
        )}

        {engine.mode === "swipe" && matches[0] && (
          <SwipeArena match={matches[0]} onChoose={(winner) => onChoose(matches[0]!.key, winner)} />
        )}
        {engine.mode === "bracket" && engine.strategy === "elim" && <ElimBracket engine={engine} onChoose={onChoose} />}
        {engine.mode === "bracket" && engine.strategy !== "elim" && <BracketBoard engine={engine} onChoose={onChoose} />}
      </main>
    </div>
  );
}

function SwipeArena({ match, onChoose }: { match: Matchup; onChoose: (winner: string) => void }) {
  const left = requireSong(match.a);
  const right = requireSong(match.b);
  return (
    <div className="arena">
      <ChoiceCard song={left} hotkey="1" onPick={() => onChoose(left.id)} />
      <div className="vs" aria-hidden="true">
        <StarMark size={20} />
        <span>or</span>
      </div>
      <ChoiceCard song={right} hotkey="2" onPick={() => onChoose(right.id)} />
    </div>
  );
}

function ChoiceCard({ song, hotkey, onPick }: { song: Song; hotkey: string; onPick: () => void }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const flung = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0, dragging: false });

  function down(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    flung.current = false;
    setOffset({ x: 0, y: 0, dragging: true });
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!origin.current) return;
    setOffset({
      x: event.clientX - origin.current.x,
      y: (event.clientY - origin.current.y) * 0.25,
      dragging: true,
    });
  }

  function up(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!origin.current) return;
    const dx = event.clientX - origin.current.x;
    const dy = event.clientY - origin.current.y;
    origin.current = null;
    setOffset({ x: 0, y: 0, dragging: false });
    if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy)) {
      flung.current = true;
      // Wait until the synthetic click lands on this card, then advance.
      window.setTimeout(onPick, 0);
    }
  }

  return (
    <button
      type="button"
      className={`choice ${offset.dragging ? "dragging" : ""}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        origin.current = null;
        setOffset({ x: 0, y: 0, dragging: false });
      }}
      onClick={(event) => {
        if (flung.current) {
          event.preventDefault();
          flung.current = false;
          return;
        }
        onPick();
      }}
      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${offset.x / 28}deg)` }}
    >
      <img src={song.cover} alt="" width={640} height={640} />
      <span className="choice-copy">
        <span className="kicker">
          {song.album} · {song.year}
        </span>
        <span className="song-title">{song.title}</span>
        {song.detail && <span className="detail">{song.detail}</span>}
      </span>
      <span className="hotkey" aria-hidden="true">
        {hotkey}
      </span>
    </button>
  );
}

