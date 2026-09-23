import { useEffect, useRef, useState, type RefObject } from "react";
import { requireSong } from "../lib/catalog";
import {
  availableMatches,
  bracketBoard,
  type BracketColumn,
  type BracketMatch,
  type BracketView,
  type EngineState,
  type Matchup,
} from "../lib/ranking";

interface BracketBoardProps {
  engine: EngineState;
  onChoose: (key: string, winner: string) => void;
}

export function BracketBoard({ engine, onChoose }: BracketBoardProps) {
  const board = bracketBoard(engine);
  const open = availableMatches(engine);
  const focus = open[0] ?? null;
  const active = [...board.columns].reverse().find((column) => column.status === "active") ?? null;
  const [viewId, setViewId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [compact, setCompact] = useState(engine.ids.length > 24);
  const stageRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  const viewedId =
    viewId && (board.columns.some((column) => column.id === viewId) || viewId === "__preview")
      ? viewId
      : (active?.id ?? board.columns.at(-1)?.id ?? null);

  const activeId = active?.id ?? null;
  const seenActive = useRef(activeId);
  useEffect(() => {
    if (activeId && activeId !== seenActive.current) {
      seenActive.current = activeId;
      setViewId(activeId);
    }
  }, [activeId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !viewedId) return;
    const column = stage.querySelector(`[data-col="${CSS.escape(viewedId)}"]`);
    if (!(column instanceof HTMLElement)) return;
    const stageRect = stage.getBoundingClientRect();
    const columnRect = column.getBoundingClientRect();
    stage.scrollTo({
      left: Math.max(0, stage.scrollLeft + columnRect.left - stageRect.left - 8),
      behavior: "smooth",
    });
  }, [viewedId, showAll]);

  useEffect(() => {
    const node = focusRef.current;
    if (!node) return;
    pinInScroller(node);
  }, [engine.comparisons, viewedId, showAll]);

  const expanded = expandedIndexes(board, viewedId, active?.id ?? null, showAll);
  const advancing = advancingIds(board);

  function jumpToCurrent() {
    if (active?.id) setViewId(active.id);
    requestAnimationFrame(() => {
      const node = focusRef.current;
      if (node) pinInScroller(node);
      const stage = stageRef.current;
      const column = stage?.querySelector(".b-col.is-active");
      if (stage && column instanceof HTMLElement) {
        stage.scrollTo({ left: Math.max(0, column.offsetLeft - stage.offsetLeft - 8), behavior: "smooth" });
      }
    });
  }

  return (
    <div className="b-board" data-density={compact ? "compact" : "comfort"} data-testid="bracket-board">
      <div className="b-tools">
        <div className="b-tabs" role="tablist" aria-label="Rounds">
          {board.columns.map((column) => (
            <button
              key={column.id}
              type="button"
              role="tab"
              aria-selected={column.id === viewedId}
              className={column.id === viewedId ? "is-on" : ""}
              onClick={() => setViewId(column.id)}
            >
              {column.label}
              {column.status === "active" ? " · now" : ""}
            </button>
          ))}
          {board.preview && (
            <button
              type="button"
              role="tab"
              aria-selected={viewedId === "__preview"}
              className={viewedId === "__preview" ? "is-on" : ""}
              onClick={() => setViewId("__preview")}
            >
              {board.preview.label} · next
            </button>
          )}
        </div>
        <div className="b-tools-actions">
          <button type="button" className="b-tool" onClick={() => setCompact((value) => !value)}>
            {compact ? "Comfortable" : "Compact"}
          </button>
          <button type="button" className="b-tool b-show-all" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Focus nearby rounds" : "Show all rounds"}
          </button>
        </div>
      </div>

      <div className="b-stage" ref={stageRef}>
        {board.columns.map((column, index) =>
          expanded.has(index) ? (
            <RoundColumn
              key={column.id}
              column={column}
              viewed={column.id === viewedId}
              focus={focus}
              focusRef={focusRef}
              advancing={advancing}
              onChoose={onChoose}
            />
          ) : (
            <button
              key={column.id}
              type="button"
              className="b-rail"
              data-col={column.id}
              onClick={() => setViewId(column.id)}
            >
              <span>{column.label}</span>
            </button>
          ),
        )}
        {board.preview && (
          <PreviewColumn preview={board.preview} viewed={viewedId === "__preview"} />
        )}
      </div>

      {focus && (
        <section className="b-now" aria-label="Now playing">
          <div className="b-now-head">
            <strong>Now playing</strong>
            <button type="button" className="b-tool" onClick={jumpToCurrent}>
              Show on board
            </button>
          </div>
          <div className="b-match is-focus">
            <PickSide songId={focus.a} onPick={() => onChoose(focus.key, focus.a)} />
            <PickSide songId={focus.b} onPick={() => onChoose(focus.key, focus.b)} />
          </div>
        </section>
      )}
    </div>
  );
}

function RoundColumn({
  column,
  viewed,
  focus,
  focusRef,
  advancing,
  onChoose,
}: {
  column: BracketColumn;
  viewed: boolean;
  focus: Matchup | null;
  focusRef: RefObject<HTMLDivElement | null>;
  advancing: Set<string>;
  onChoose: (key: string, winner: string) => void;
}) {
  const groups = [...new Set(column.matches.map((match) => match.group))].sort((a, b) => a - b);
  const openCount = column.matches.filter((match) => !match.winner).length;
  return (
    <section
      className={`b-col ${column.status === "active" ? "is-active" : "is-complete"} ${viewed ? "is-view" : ""}`}
      data-col={column.id}
      data-round={column.label}
      aria-label={column.label}
    >
      <header className="b-col-head">
        <h2>{column.label}</h2>
        <p>
          {column.status === "active" ? `${openCount} open` : "Complete"}
          {column.detail ? ` · ${column.detail}` : ""}
        </p>
      </header>
      <div className="b-col-body">
        {groups.map((group) => (
          <GroupBlock
            key={group}
            column={column}
            group={group}
            focus={focus}
            focusRef={focusRef}
            advancing={advancing}
            onChoose={onChoose}
          />
        ))}
        {column.byes.map((id) => (
          <p key={id} className="b-bye">
            Bye · {requireSong(id).title} advances
          </p>
        ))}
      </div>
    </section>
  );
}

function GroupBlock({
  column,
  group,
  focus,
  focusRef,
  advancing,
  onChoose,
}: {
  column: BracketColumn;
  group: number;
  focus: Matchup | null;
  focusRef: RefObject<HTMLDivElement | null>;
  advancing: Set<string>;
  onChoose: (key: string, winner: string) => void;
}) {
  const matches = column.matches.filter((match) => match.group === group);
  const lane = column.lanes.find((item) => item.id === group);
  const showChip = matches.length > 1 || Boolean(lane?.open && lane.placed.length > 0);
  return (
    <div className="b-group">
      {showChip && (
        <p className="b-chip">
          Group {group + 1}
          {lane && lane.placed.length > 0
            ? ` · ahead: ${lane.placed
                .slice(0, 3)
                .map((id) => requireSong(id).title)
                .join(", ")}`
            : ""}
        </p>
      )}
      {matches.map((match) => (
        <MatchRow
          key={match.uid}
          match={match}
          column={column}
          featured={isFocusMatch(match, focus)}
          advances={match.winner != null && advancing.has(match.winner)}
          focusRef={focusRef}
          onChoose={onChoose}
        />
      ))}
    </div>
  );
}

function MatchRow({
  match,
  column,
  featured,
  advances,
  focusRef,
  onChoose,
}: {
  match: BracketMatch;
  column: BracketColumn;
  featured: boolean;
  advances: boolean;
  focusRef: RefObject<HTMLDivElement | null>;
  onChoose: (key: string, winner: string) => void;
}) {
  const pickable = Boolean(match.key) && column.status === "active" && match.winner == null;
  return (
    <div
      className={`b-match ${match.winner ? "is-done" : "is-open"} ${featured ? "is-focus" : ""}`}
      ref={featured ? focusRef : undefined}
      data-open={match.winner ? "false" : "true"}
    >
      <Side
        songId={match.a}
        winner={match.winner === match.a}
        loser={match.winner != null && match.winner !== match.a}
        advances={advances && match.winner === match.a}
        pickable={pickable}
        onPick={() => match.key && onChoose(match.key, match.a)}
      />
      <Side
        songId={match.b}
        winner={match.winner === match.b}
        loser={match.winner != null && match.winner !== match.b}
        advances={advances && match.winner === match.b}
        pickable={pickable}
        onPick={() => match.key && onChoose(match.key, match.b)}
      />
    </div>
  );
}

function Side({
  songId,
  winner,
  loser,
  advances,
  pickable,
  onPick,
}: {
  songId: string;
  winner: boolean;
  loser: boolean;
  advances: boolean;
  pickable: boolean;
  onPick: () => void;
}) {
  const song = requireSong(songId);
  const className = `b-side ${winner ? "is-winner" : ""} ${loser ? "is-loser" : ""}`;
  const body = (
    <>
      <img src={song.cover} alt="" width={64} height={64} />
      <span className="b-copy">
        {winner && <span className="sr-only">You liked this more. </span>}
        {loser && <span className="sr-only">Lost this match. </span>}
        <span className="b-title">{song.title}</span>
        <span className="b-album">{song.album}</span>
        {winner && <span className="b-tag">{advances ? "Advances" : "Ahead"}</span>}
      </span>
    </>
  );
  if (pickable) {
    return (
      <button type="button" className={className} onClick={onPick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function PickSide({ songId, onPick }: { songId: string; onPick: () => void }) {
  const song = requireSong(songId);
  return (
    <button type="button" className="b-side" onClick={onPick}>
      <img src={song.cover} alt="" width={64} height={64} />
      <span className="b-copy">
        <span className="b-title">{song.title}</span>
        <span className="b-album">{song.album}</span>
      </span>
    </button>
  );
}

function PreviewColumn({
  preview,
  viewed,
}: {
  preview: NonNullable<BracketView["preview"]>;
  viewed: boolean;
}) {
  return (
    <section className={`b-col b-preview ${viewed ? "is-view" : ""}`} data-col="__preview" aria-label={preview.label}>
      <header className="b-col-head">
        <h2>{preview.label}</h2>
        <p>Forming · winners land here</p>
      </header>
      <div className="b-col-body">
        {preview.slots.map((slot, index) =>
          slot.bye ? (
            <p key={index} className="b-bye" data-preview-slot={index}>
              {slot.a ? `Bye · ${requireSong(slot.a).title} advances` : "Bye"}
            </p>
          ) : (
            <div key={index} className="b-match is-ghost" data-preview-slot={index}>
              <GhostSlot songId={slot.a} />
              <GhostSlot songId={slot.b} />
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function GhostSlot({ songId }: { songId: string | null }) {
  if (!songId) {
    return <div className="b-side is-wait">Waiting</div>;
  }
  const song = requireSong(songId);
  return (
    <div className="b-side is-winner">
      <img src={song.cover} alt="" width={64} height={64} />
      <span className="b-copy">
        <span className="b-title">{song.title}</span>
        <span className="b-tag">Advances</span>
      </span>
    </div>
  );
}

function expandedIndexes(
  board: BracketView,
  viewedId: string | null,
  activeId: string | null,
  showAll: boolean,
): Set<number> {
  if (showAll) return new Set(board.columns.map((_, index) => index));
  const indexes = new Set<number>();
  const mark = (id: string | null) => {
    const index = board.columns.findIndex((column) => column.id === id);
    if (index < 0) return;
    indexes.add(index);
    if (index > 0) indexes.add(index - 1);
    if (index < board.columns.length - 1) indexes.add(index + 1);
  };
  mark(viewedId);
  mark(activeId);
  if (indexes.size === 0 && board.columns.length > 0) indexes.add(board.columns.length - 1);
  return indexes;
}

function advancingIds(board: BracketView): Set<string> {
  const ids = new Set<string>();
  board.columns.forEach((_, index) => {
    for (const later of board.columns.slice(index + 1)) {
      for (const match of later.matches) {
        ids.add(match.a);
        ids.add(match.b);
      }
      for (const lane of later.lanes) {
        if (lane.placed[0]) ids.add(lane.placed[0]);
      }
    }
  });
  for (const slot of board.preview?.slots ?? []) {
    if (slot.a) ids.add(slot.a);
    if (slot.b) ids.add(slot.b);
  }
  return ids;
}

function isFocusMatch(match: BracketMatch, focus: Matchup | null): boolean {
  if (!focus || match.winner) return false;
  return match.key === focus.key || (match.a === focus.a && match.b === focus.b);
}

function pinInScroller(node: HTMLElement): void {
  const scroller = node.closest(".b-col-body");
  if (!(scroller instanceof HTMLElement)) return;
  const nodeRect = node.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  if (nodeRect.top < scrollerRect.top + 8) scroller.scrollTop -= scrollerRect.top + 8 - nodeRect.top;
  else if (nodeRect.bottom > scrollerRect.bottom - 8) scroller.scrollTop += nodeRect.bottom - (scrollerRect.bottom - 8);
}
