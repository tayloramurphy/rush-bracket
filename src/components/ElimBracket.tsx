import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { requireSong } from "../lib/catalog";
import type { ElimMatch, ElimState } from "../lib/elim";
import { availableMatches, type EngineState } from "../lib/ranking";

const SLOT_H = 36;
const SLOT_GAP = 4;
const MATCH_H = SLOT_H * 2 + SLOT_GAP;
const MATCH_W = 176;
const COL_GAP = 72;
const COL_W = MATCH_W + COL_GAP;
const ROW_GAP = 12;
const HEADER = 28;

interface ElimBracketProps {
  engine: EngineState;
  onChoose: (key: string, winner: string) => void;
}

export function ElimBracket({ engine, onChoose }: ElimBracketProps) {
  const elim = engine.elim;
  if (!elim) return null;
  return <ElimTree engine={engine} elim={elim} onChoose={onChoose} />;
}

function ElimTree({
  engine,
  elim,
  onChoose,
}: {
  engine: EngineState;
  elim: ElimState;
  onChoose: (key: string, winner: string) => void;
}) {
  const open = availableMatches(engine)[0] ?? null;
  const [showChampionship, setShowChampionship] = useState(false);
  const viewingFrozen = showChampionship && elim.championship != null;
  const matches = viewingFrozen ? elim.championship! : elim.matches;
  const layout = useMemo(() => layoutMatches(matches), [matches]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 12, y: 12, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const followRef = useRef(true);
  const [follow, setFollow] = useState(true);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const previous = useRef(elim.matches);

  const treeKey = `${viewingFrozen ? "championship" : elim.region}:${matches.length}`;

  function focusMatch(matchId: string | null, scale = viewRef.current.scale) {
    const node = viewportRef.current;
    const pos = matchId ? layout.pos.get(matchId) : null;
    if (!node || !pos) return;
    const rect = node.getBoundingClientRect();
    setView({
      scale,
      x: rect.width * 0.12 - pos.x * scale,
      y: Math.max(12, rect.height * 0.28 - (pos.y + MATCH_H / 2) * scale),
    });
  }

  function zoomAt(clientX: number, clientY: number, scale: number) {
    const node = viewportRef.current;
    if (!node) return;
    const next = clampScale(scale);
    const rect = node.getBoundingClientRect();
    const current = viewRef.current;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const worldX = (px - current.x) / current.scale;
    const worldY = (py - current.y) / current.scale;
    setView({ scale: next, x: px - worldX * next, y: py - worldY * next });
  }

  function fit() {
    const node = viewportRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const scale = clampScale(Math.min((rect.width - 24) / layout.width, (rect.height - 24) / layout.height, 1));
    setView({
      scale,
      x: Math.max(8, (rect.width - layout.width * scale) / 2),
      y: Math.max(8, (rect.height - layout.height * scale) / 2),
    });
    followRef.current = false;
    setFollow(false);
  }

  function frameTree(matchId: string | null) {
    const node = viewportRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const fitScale = Math.min((rect.width - 20) / layout.width, (rect.height - 20) / layout.height);
    if (fitScale >= 0.45) {
      const scale = Math.min(1, fitScale);
      setView({
        scale,
        x: Math.max(8, (rect.width - layout.width * scale) / 2),
        y: Math.max(8, (rect.height - layout.height * scale) / 2),
      });
      return;
    }
    focusMatch(matchId, 1);
  }

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    followRef.current = true;
    setFollow(true);
    const target = viewingFrozen ? (matches.find((match) => match.round === layout.rounds - 1)?.id ?? null) : (open?.key ?? null);
    const frame = () => {
      if (followRef.current) frameTree(target);
    };
    const raf = requestAnimationFrame(frame);
    const observer = new ResizeObserver(frame);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
    // Reframe when the tree itself changes, not on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeKey]);

  useEffect(() => {
    const before = previous.current;
    previous.current = elim.matches;
    if (viewingFrozen || !followRef.current) return;
    const advanced = elim.matches
      .filter((match) => {
        const old = before.find((item) => item.id === match.id);
        if (!old) return false;
        return (old.a !== match.a || old.b !== match.b) && Boolean(match.a || match.b);
      })
      .sort((a, b) => b.round - a.round)[0];
    frameTree(advanced?.id ?? open?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.comparisons]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.11;
      zoomAt(event.clientX, event.clientY, viewRef.current.scale * factor);
      followRef.current = false;
      setFollow(false);
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
    // zoomAt reads refs; the listener is bound once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(first!.x - second!.x, first!.y - second!.y), scale: view.scale };
      drag.current = null;
      return;
    }
    drag.current = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(first!.x - second!.x, first!.y - second!.y);
      if (pinch.current.distance > 0) {
        const midX = (first!.x + second!.x) / 2;
        const midY = (first!.y + second!.y) / 2;
        zoomAt(midX, midY, pinch.current.scale * (distance / pinch.current.distance));
        followRef.current = false;
        setFollow(false);
      }
      return;
    }
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) > 4) current.moved = true;
    setView((value) => ({ ...value, x: current.ox + dx, y: current.oy + dy }));
    if (current.moved) {
      followRef.current = false;
      setFollow(false);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
  }

  function jumpToCurrent() {
    followRef.current = true;
    setFollow(true);
    setShowChampionship(false);
    focusMatch(open?.key ?? null, Math.max(viewRef.current.scale, 1));
  }

  const wires = wiresFor(matches, layout.pos);
  const openRound = elim.matches.find((match) => match.id === open?.key)?.round;
  const placeLabel =
    elim.region === "basement"
      ? `Bottom ${elim.bottom.length + 1}`
      : elim.top.length > 0
        ? `For #${elim.top.length + 1}`
        : openRound == null
          ? "Playoff"
          : `Round ${openRound + 1}`;

  return (
    <div className="elim-app" data-testid="elim-board">
      {open && (
        <section className="faceoff" aria-label="Now playing" data-testid="elim-faceoff">
          <div className="faceoff-head">
            <strong>Now playing · {placeLabel}</strong>
            <span>
              {elim.region === "basement"
                ? "Tap the song you like more. The other one drops along the line."
                : "Tap the winner. They move along the line into the next round."}
            </span>
          </div>
          <div className="faceoff-pair">
            <FaceoffSide songId={open.a} hotkey="1" onPick={() => onChoose(open.key, open.a)} />
            <FaceoffSide songId={open.b} hotkey="2" onPick={() => onChoose(open.key, open.b)} />
          </div>
        </section>
      )}

      <div className="elim-tools">
        <button type="button" className="b-tool" onClick={() => zoomAt(viewportCenter(viewportRef.current).x, viewportCenter(viewportRef.current).y, view.scale / 1.2)}>
          Zoom out
        </button>
        <button type="button" className="b-tool" onClick={() => zoomAt(viewportCenter(viewportRef.current).x, viewportCenter(viewportRef.current).y, view.scale * 1.2)}>
          Zoom in
        </button>
        <button type="button" className="b-tool" onClick={fit}>
          Fit
        </button>
        <button type="button" className={`b-tool ${follow && !viewingFrozen ? "is-on" : ""}`} onClick={jumpToCurrent}>
          Current match
        </button>
        {elim.championship && (
          <button type="button" className={`b-tool ${viewingFrozen ? "is-on" : ""}`} onClick={() => setShowChampionship((value) => !value)}>
            {viewingFrozen ? "Back to play" : "Championship"}
          </button>
        )}
      </div>

      <div
        className="elim-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="elim-world"
          style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <svg className="elim-wires" width={layout.width} height={layout.height} aria-hidden="true">
            {wires.map((wire) => (
              <path key={wire.id} d={wire.d} className={wire.won ? "is-won" : ""} />
            ))}
          </svg>
          {Array.from({ length: layout.rounds }, (_, round) => (
            <h2 key={round} className="elim-round" style={{ left: round * COL_W }}>
              {roundTitle(round, layout.rounds)}
            </h2>
          ))}
          {matches.map((match) => {
            const pos = layout.pos.get(match.id);
            if (!pos) return null;
            const live = !viewingFrozen && open?.key === match.id;
            return (
              <MatchBox
                key={match.id}
                match={match}
                matches={matches}
                x={pos.x}
                y={pos.y}
                live={live}
                readOnly={viewingFrozen}
                basement={elim.region === "basement" && !viewingFrozen}
                onChoose={onChoose}
              />
            );
          })}
        </div>
        {layout.rounds > 3 && (
          <button
            type="button"
            className="elim-map"
            aria-label="Bracket map"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const wx = ((event.clientX - rect.left) / rect.width) * layout.width;
              const wy = ((event.clientY - rect.top) / rect.height) * layout.height;
              const node = viewportRef.current;
              if (!node) return;
              const bounds = node.getBoundingClientRect();
              setView((value) => ({
                ...value,
                x: bounds.width / 2 - wx * value.scale,
                y: bounds.height / 2 - wy * value.scale,
              }));
              followRef.current = false;
              setFollow(false);
            }}
          >
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`}>
              {matches.map((match) => {
                const pos = layout.pos.get(match.id);
                if (!pos) return null;
                return <rect key={match.id} x={pos.x} y={pos.y} width={MATCH_W} height={MATCH_H} />;
              })}
              <rect
                className="elim-map-view"
                x={Math.max(0, -view.x / view.scale)}
                y={Math.max(0, -view.y / view.scale)}
                width={Math.min(layout.width, (viewportRef.current?.clientWidth ?? 300) / view.scale)}
                height={Math.min(layout.height, (viewportRef.current?.clientHeight ?? 300) / view.scale)}
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function FaceoffSide({ songId, hotkey, onPick }: { songId: string; hotkey: string; onPick: () => void }) {
  const song = requireSong(songId);
  return (
    <button type="button" className="faceoff-side" onClick={onPick}>
      <img src={song.cover} alt="" width={64} height={64} />
      <span>
        <span className="faceoff-title">{song.title}</span>
        <span className="faceoff-album">{song.album}</span>
      </span>
      <span className="hotkey" aria-hidden="true">
        {hotkey}
      </span>
    </button>
  );
}

function MatchBox({
  match,
  matches,
  x,
  y,
  live,
  readOnly,
  basement,
  onChoose,
}: {
  match: ElimMatch;
  matches: ElimMatch[];
  x: number;
  y: number;
  live: boolean;
  readOnly: boolean;
  basement: boolean;
  onChoose: (key: string, winner: string) => void;
}) {
  const playable = !readOnly && Boolean(match.a && match.b && !match.winner);
  return (
    <div
      className={`elim-match ${live ? "is-live" : ""} ${match.winner ? "is-done" : ""}`}
      style={{ left: x, top: y, width: MATCH_W }}
      data-round={match.round}
      data-open={playable ? "true" : "false"}
    >
      <Slot
        songId={match.a}
        match={match}
        matches={matches}
        playable={playable}
        basement={basement}
        onPick={() => match.a && onChoose(match.id, match.a)}
      />
      <Slot
        songId={match.b}
        match={match}
        matches={matches}
        playable={playable}
        basement={basement}
        onPick={() => match.b && onChoose(match.id, match.b)}
      />
    </div>
  );
}

function Slot({
  songId,
  match,
  matches,
  playable,
  basement,
  onPick,
}: {
  songId: string | null;
  match: ElimMatch;
  matches: ElimMatch[];
  playable: boolean;
  basement: boolean;
  onPick: () => void;
}) {
  if (!songId) {
    const bye = match.bye;
    return (
      <div className={`elim-slot ${bye ? "is-bye" : "is-tbd"}`} data-slot={bye ? "bye" : "tbd"}>
        <span>{bye ? "Bye" : "TBD"}</span>
      </div>
    );
  }
  const song = requireSong(songId);
  const winner = match.winner === songId;
  const loser = match.winner != null && match.winner !== songId;
  const arrived = !match.winner && feedsThisSlot(matches, match, songId);
  const className = `elim-slot is-song ${winner ? "is-winner" : ""} ${loser ? "is-loser" : ""} ${arrived ? "is-arrived" : ""}`;
  const body = (
    <>
      <img src={song.cover} alt="" width={28} height={28} />
      <span className="elim-name">
        {winner && <span className="sr-only">{basement ? "Drops. " : "Winner. "}</span>}
        {loser && <span className="sr-only">{basement ? "Stays. " : "Lost this match. "}</span>}
        {song.title}
        {winner && <em>{basement ? "Drops" : "Advances"}</em>}
      </span>
    </>
  );
  if (playable) {
    return (
      <button type="button" className={className} onClick={onPick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function feedsThisSlot(matches: ElimMatch[], match: ElimMatch, songId: string): boolean {
  const feedId = match.a === songId ? match.feedA : match.feedB;
  if (!feedId) return false;
  return matches.find((item) => item.id === feedId)?.winner === songId;
}

function layoutMatches(matches: ElimMatch[]): { pos: Map<string, { x: number; y: number }>; width: number; height: number; rounds: number } {
  const pos = new Map<string, { x: number; y: number }>();
  const rounds = matches.reduce((max, match) => Math.max(max, match.round), 0) + 1;
  const first = matches.filter((match) => match.round === 0).sort((a, b) => a.index - b.index);
  first.forEach((match, index) => {
    pos.set(match.id, { x: 0, y: HEADER + index * (MATCH_H + ROW_GAP) });
  });
  for (let round = 1; round < rounds; round++) {
    for (const match of matches.filter((item) => item.round === round)) {
      const left = match.feedA ? pos.get(match.feedA) : null;
      const right = match.feedB ? pos.get(match.feedB) : null;
      const y = left && right ? (left.y + right.y) / 2 : (left?.y ?? right?.y ?? HEADER);
      pos.set(match.id, { x: round * COL_W, y });
    }
  }
  const height = HEADER + Math.max(1, first.length) * (MATCH_H + ROW_GAP);
  return { pos, width: Math.max(1, rounds) * COL_W, height, rounds };
}

function wiresFor(matches: ElimMatch[], pos: Map<string, { x: number; y: number }>): { id: string; d: string; won: boolean }[] {
  const wires: { id: string; d: string; won: boolean }[] = [];
  for (const match of matches) {
    const start = pos.get(match.id);
    if (!start || match.round === 0) continue;
    const children = matches.filter((item) => item.id === match.feedA || item.id === match.feedB);
    for (const child of children) {
      const from = pos.get(child.id);
      if (!from) continue;
      const x1 = from.x + MATCH_W;
      const y1 = from.y + MATCH_H / 2;
      const x2 = start.x;
      const slotY = child.index % 2 === 0 ? SLOT_H / 2 : SLOT_H + SLOT_GAP + SLOT_H / 2;
      const y2 = start.y + slotY;
      const mid = x1 + COL_GAP / 2;
      wires.push({
        id: `${child.id}->${match.id}`,
        d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`,
        won: Boolean(child.winner),
      });
    }
  }
  return wires;
}

function roundTitle(round: number, rounds: number): string {
  const fromEnd = rounds - 1 - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2 && rounds > 3) return "Quarterfinal";
  return `Round ${round + 1}`;
}

function clampScale(scale: number): number {
  return Math.min(1.6, Math.max(0.28, scale));
}

function viewportCenter(node: HTMLDivElement | null): { x: number; y: number } {
  if (!node) return { x: 0, y: 0 };
  const rect = node.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
