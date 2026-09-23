import { useEffect, useState } from "react";
import { Home } from "./components/Home";
import { Play } from "./components/Play";
import { Results } from "./components/Results";
import { applyChoice, availableMatches, createEngine, type EngineState } from "./lib/ranking";
import { readShareToken, resultFromEngine, shareHash, type ResultPayload } from "./lib/share";
import { clearRun, loadReview, loadRun, loadSetup, reviewMatches, saveReview, saveRun, type BracketReview } from "./lib/storage";
import type { ElimState } from "./lib/elim";
import { ElimBracket } from "./components/ElimBracket";
import { StarMark } from "./components/StarMark";
import type { Depth, Mode } from "./types";
import { songByIndex } from "./lib/catalog";

type Screen =
  | { kind: "home"; notice?: string }
  | { kind: "play"; engine: EngineState; undo: EngineState[] }
  | { kind: "results"; result: ResultPayload; shared: boolean }
  | { kind: "review"; result: ResultPayload; shared: boolean; elim: ElimState };

function initialScreen(): Screen {
  const shared = readShareToken();
  if (shared && "result" in shared) return { kind: "results", result: shared.result, shared: true };
  if (shared && "error" in shared) return { kind: "home", notice: shared.error };
  return { kind: "home" };
}

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [saved, setSaved] = useState<EngineState | null>(() => loadRun());
  const [review, setReview] = useState<BracketReview | null>(() => loadReview());

  useEffect(() => {
    function onHash() {
      const shared = readShareToken();
      if (shared && "result" in shared) {
        setScreen({ kind: "results", result: shared.result, shared: true });
        return;
      }
      if (shared && "error" in shared) {
        setScreen({ kind: "home", notice: shared.error });
        setSaved(loadRun());
        return;
      }
      setScreen((current) => (current.kind === "results" ? { kind: "home" } : current));
      setSaved(loadRun());
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (screen.kind !== "results") {
      document.title = "Rush Bracket";
      return;
    }
    const favorite = songByIndex.get(screen.result.ranked[0] ?? -1);
    document.title = favorite ? `${favorite.title} · Rush Bracket` : "Rush Bracket";
  }, [screen]);

  function goHome() {
    if (window.location.hash) {
      history.pushState(null, "", window.location.pathname + window.location.search);
    }
    setSaved(loadRun());
    setScreen({ kind: "home" });
  }

  function start(config: { mode: Mode; depth: Depth; name: string; ids: string[] }) {
    const engine = createEngine(config.ids, config.mode, config.depth);
    saveRun(engine);
    setSaved(engine);
    if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
    setScreen({ kind: "play", engine, undo: [] });
  }

  function choose(key: string, winner: string) {
    if (screen.kind !== "play") return;
    if (!availableMatches(screen.engine).some((match) => match.key === key)) return;
    const next = applyChoice(screen.engine, key, winner);
    if (next.done) {
      const result = resultFromEngine(next, loadSetup()?.name ?? "");
      if (next.strategy === "elim" && next.elim) {
        const savedReview = { elim: next.elim, ranked: result.ranked };
        saveReview(savedReview);
        setReview(savedReview);
      }
      clearRun();
      setSaved(null);
      history.pushState(null, "", shareHash(result));
      setScreen({ kind: "results", result, shared: false });
      return;
    }
    saveRun(next);
    setSaved(next);
    setScreen({
      kind: "play",
      engine: next,
      undo: [...screen.undo.slice(-40), screen.engine],
    });
  }

  function undo() {
    if (screen.kind !== "play" || screen.undo.length === 0) return;
    const previous = screen.undo[screen.undo.length - 1]!;
    saveRun(previous);
    setSaved(previous);
    setScreen({ kind: "play", engine: previous, undo: screen.undo.slice(0, -1) });
  }

  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      {screen.kind === "home" && (
        <Home
          notice={screen.notice}
          saved={saved}
          onStart={start}
          onResume={() => {
            const run = loadRun();
            if (!run) return;
            setScreen({ kind: "play", engine: run, undo: [] });
          }}
          onDiscard={() => {
            clearRun();
            setSaved(null);
          }}
        />
      )}
      {screen.kind === "play" && (
        <Play
          engine={screen.engine}
          canUndo={screen.undo.length > 0}
          onChoose={choose}
          onUndo={undo}
          onExit={goHome}
        />
      )}
      {screen.kind === "results" && (
        <Results
          result={screen.result}
          shared={screen.shared}
          onHome={goHome}
          onViewBracket={
            screen.result.mode === "bracket" && reviewMatches(review, screen.result.ranked)
              ? () => {
                  const current = review && reviewMatches(review, screen.result.ranked) ? review : loadReview();
                  if (!current || screen.kind !== "results") return;
                  setScreen({ kind: "review", result: screen.result, shared: screen.shared, elim: current.elim });
                }
              : undefined
          }
        />
      )}
      {screen.kind === "review" && (
        <div className="play">
          <header className="playbar">
            <div className="shell bar-inner">
              <button type="button" className="brand-button" onClick={goHome}>
                <StarMark size={18} />
                <span>Rush Bracket</span>
              </button>
              <div className="progress-copy">
                <strong>Bracket review</strong>
                <span>Pan and zoom. Every pick was the song you liked more.</span>
              </div>
              <button
                type="button"
                className="ghost"
                data-testid="back-to-results"
                onClick={() => setScreen({ kind: "results", result: screen.result, shared: screen.shared })}
              >
                Back to results
              </button>
            </div>
          </header>
          <main className="shell play-main bracket-main" id="content">
            <ElimBracket elim={screen.elim} readOnly />
          </main>
        </div>
      )}
    </>
  );
}
