import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { requireSong } from "../lib/catalog";
import { bracketGuide, elimRoundLabel, phaseCopy, type ElimMatch, type ElimState, type ElimTreeId } from "../lib/elim";
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
  engine?: EngineState;
  elim?: ElimState;
  onChoose?: (key: string, winner: string) => void;
  readOnly?: boolean;
}

export function ElimBracket({ engine, elim: elimProp, onChoose, readOnly = false }: ElimBracketProps) {
  const elim = elimProp ?? engine?.elim;
  if (!elim) return null;
  const open = !readOnly && engine ? (availableMatches(engine)[0] ?? null) : null;
  return (
    <ElimTree
      elim={elim}
      open={open}
      onChoose={onChoose}
      readOnly={readOnly}
      comparisons={engine?.comparisons ?? 0}
    />
  );
}

function ElimTree({
  elim,
  open,
  onChoose,
  readOnly,
  comparisons,
}: {
  elim: ElimState;
  open: { key: string; a: string; b: string } | null;
  onChoose?: (key: string, winner: string) => void;
  readOnly: boolean;
  comparisons: number;
}) {
  const [viewId, setViewId] = useState<ElimTreeId>(() => initialTree(elim, readOnly));
  const [helpOpen, setHelpOpen] = useState(false);
  const tree = elim.trees.find((item) => item.id === viewId) ?? elim.trees[0];
  const matches = tree?.matches ?? [];
  const layout = useMemo(() => layoutMatches(matches), [matches]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 12, y: 12, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const followRef = useRef(!readOnly);
  const [follow, setFollow] = useState(!readOnly);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const previous = useRef<{ id: string; matches: ElimMatch[] }>({ id: tree?.id ?? "", matches });

  const playing = !readOnly && elim.phase !== "done" && viewId === elim.phase;
  const treeKey = `${tree?.id ?? "none"}:${matches.length}:${readOnly ? "review" : "play"}`;

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

  function showTree(id: ElimTreeId) {
    setViewId(id);
    const stay = !readOnly && id === elim.phase;
    followRef.current = stay;
    setFollow(stay);
  }

  useEffect(() => {
    if (elim.trees.some((item) => item.id === viewId)) return;
    const fallback =
      elim.phase !== "done" && elim.trees.some((item) => item.id === elim.phase) ? elim.phase : elim.trees[0]?.id;
    if (fallback) setViewId(fallback);
  }, [elim, viewId]);

  useEffect(() => {
    if (readOnly || elim.phase === "done") return;
    if (!elim.trees.some((item) => item.id === elim.phase)) return;
    setViewId(elim.phase);
    followRef.current = true;
    setFollow(true);
  }, [elim.phase, readOnly]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const target = playing ? (open?.key ?? null) : (matches.find((match) => match.round === layout.rounds - 1)?.id ?? null);
    const frame = () => {
      if (followRef.current || readOnly) frameTree(target);
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
    previous.current = { id: tree?.id ?? "", matches };
    if (readOnly || !playing || !followRef.current || before.id !== tree?.id) return;
    const advanced = matches
      .filter((match) => {
        const old = before.matches.find((item) => item.id === match.id);
        if (!old) return false;
        return (old.a !== match.a || old.b !== match.b) && Boolean(match.a || match.b);
      })
      .sort((a, b) => b.round - a.round)[0];
    frameTree(advanced?.id ?? open?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisons]);

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
    function onSelectStart(event: Event) {
      event.preventDefault();
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("selectstart", onSelectStart);
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("selectstart", onSelectStart);
    };
    // zoomAt reads refs; the listener is bound once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    window.getSelection()?.removeAllRanges();
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
    if (current.moved) window.getSelection()?.removeAllRanges();
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
    if (elim.phase === "done" || !elim.trees.some((item) => item.id === elim.phase)) return;
    followRef.current = true;
    setFollow(true);
    setViewId(elim.phase);
    focusMatch(open?.key ?? null, Math.max(viewRef.current.scale, 1));
  }

  const wires = wiresFor(matches, layout.pos);
  const label = elimRoundLabel(elim);
  const copy = phaseCopy(elim);
  const guide = bracketGuide(elim.pool.length, elim.topCutSize);

  return (
    <div className="elim-app" data-testid="elim-board" data-phase={elim.phase} data-tree={tree?.id ?? ""} data-readonly={readOnly ? "true" : "false"}>
      {open && onChoose && (
        <section className="faceoff" aria-label="Now playing. Tap the song you like more." data-testid="elim-faceoff">
          <div className="faceoff-head">
            <strong>{label}</strong>
          </div>
          <p className="faceoff-blurb" data-testid="phase-blurb">
            <span className="faceoff-choose">{copy.choose}</span> {copy.about}
          </p>
          <div className="faceoff-pair">
            <FaceoffSide songId={open.a} hotkey="1" onPick={() => onChoose(open.key, open.a)} />
            <FaceoffSide songId={open.b} hotkey="2" onPick={() => onChoose(open.key, open.b)} />
          </div>
        </section>
      )}
      {helpOpen && (
        <section className="elim-help" data-testid="bracket-help" aria-label="How this works">
          <p>Every tap is the song you like more. The app turns those picks into your favorite, your top 10, your least favorite, and your bottom 10.</p>
          <ul>
            {guide.map((item) => {
              const current = elim.pool.length <= 20 && elim.phase === "winners" ? "playoff" : elim.phase;
              return (
              <li key={item.id} className={item.id === current ? "is-now" : ""}>
                <strong>{item.title}.</strong> {item.about}
              </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="elim-tools">
        <div className="b-tabs elim-tabs" role="tablist" aria-label="Brackets" data-testid="elim-tabs">
          {elim.trees.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === tree?.id}
              className={item.id === tree?.id ? "is-on" : ""}
              onClick={() => showTree(item.id)}
            >
              {treeName(elim, item.id)}
            </button>
          ))}
        </div>
        <button type="button" className="b-tool" onClick={() => zoomAt(viewportCenter(viewportRef.current).x, viewportCenter(viewportRef.current).y, view.scale / 1.2)}>
          Zoom out
        </button>
        <button type="button" className="b-tool" onClick={() => zoomAt(viewportCenter(viewportRef.current).x, viewportCenter(viewportRef.current).y, view.scale * 1.2)}>
          Zoom in
        </button>
        <button type="button" className="b-tool" onClick={fit}>
          Fit
        </button>
        {!readOnly && (
          <button type="button" className={`b-tool ${follow && playing ? "is-on" : ""}`} onClick={jumpToCurrent}>
            Current match
          </button>
        )}
        <button
          type="button"
          className={`b-tool ${helpOpen ? "is-on" : ""}`}
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((openHelp) => !openHelp)}
        >
          How this works
        </button>
      </div>

      <div
        className="elim-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragStart={(event) => event.preventDefault()}
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
              {roundTitle(round, layout.rounds, tree?.id ?? "winners")}
            </h2>
          ))}
          {matches.map((match) => {
            const pos = layout.pos.get(match.id);
            if (!pos) return null;
            const live = playing && open?.key === match.id;
            return (
              <MatchBox
                key={match.id}
                match={match}
                matches={matches}
                x={pos.x}
                y={pos.y}
                live={live}
                readOnly={!playing}
                basement={tree?.id === "bottom"}
                onChoose={onChoose ?? (() => undefined)}
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

function initialTree(elim: ElimState, readOnly: boolean): ElimTreeId {
  if (!readOnly && elim.phase !== "done" && elim.trees.some((item) => item.id === elim.phase)) return elim.phase;
  return elim.trees.find((item) => item.id === "topcut")?.id ?? elim.trees[0]?.id ?? "winners";
}

function treeName(elim: ElimState, id: ElimTreeId): string {
  if (id === "winners") return elim.pool.length <= 20 ? "Playoff" : "Winners";
  if (id === "losers") return "Losers";
  if (id === "topcut") return `Top ${elim.topCutSize}`;
  return "Bottom";
}

function FaceoffSide({ songId, hotkey, onPick }: { songId: string; hotkey: string; onPick: () => void }) {
  const song = requireSong(songId);
  return (
    <button type="button" className="faceoff-side" aria-label={`Like ${song.title} more`} onClick={onPick}>
      <img src={song.cover} alt="" width={64} height={64} draggable={false} />
      <span>
        <span className="sr-only">Like this more. </span>
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
      <img src={song.cover} alt="" width={28} height={28} draggable={false} />
      <span className="elim-name">
        {playable && <span className="sr-only">Like this more. </span>}
        {winner && <span className="sr-only">{basement ? "Drops toward least favorite. " : "Advances. "}</span>}
        {loser && <span className="sr-only">{basement ? "You liked this more. " : "Does not advance. "}</span>}
        {song.title}
        {winner && <em>{basement ? "Drops" : "Advances"}</em>}
      </span>
    </>
  );
  if (playable) {
    return (
      <button type="button" className={className} aria-label={`Like ${song.title} more`} onClick={onPick}>
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

function roundTitle(round: number, rounds: number, treeId: ElimTreeId): string {
  const fromEnd = rounds - 1 - round;
  if (treeId === "topcut" && fromEnd === 1) return "Final Four";
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
