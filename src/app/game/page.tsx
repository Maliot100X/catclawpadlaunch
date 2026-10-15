"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const GRID = 20;
const TICK_AGENT = 750; // LLM decides each move, so the loop is slower than a human's
const TICK_HUMAN = 130;
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
const DELTA: Record<Dir, [number, number]> = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };

type Agent = { id: number; name: string; status: string; budget_sol: number };

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [snake, setSnake] = useState<number[][]>([[10, 10], [9, 10], [8, 10]]);
  const [food, setFood] = useState<number[]>([15, 10]);
  const [dir, setDir] = useState<Dir>("RIGHT");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"human" | "agent">("agent");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [model, setModel] = useState("");
  const [turns, setTurns] = useState(0);
  const [dead, setDead] = useState(false);
  const stateRef = useRef({ snake, food, dir, score });
  stateRef.current = { snake, food, dir, score };

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" }).then((r) => r.json())
      .then((j) => {
        const list = j?.agents ?? [];
        setAgents(list);
        if (list[0] && agentId == null) setAgentId(list[0].id);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    setSnake([[10, 10], [9, 10], [8, 10]]);
    setFood([15, 10]);
    setDir("RIGHT");
    setScore(0);
    setTurns(0);
    setReason("");
    setDead(false);
  }, []);

  const step = useCallback((nextDir: Dir) => {
    const { snake: s, food: f } = stateRef.current;
    const [dx, dy] = DELTA[nextDir];
    const head = [s[0][0] + dx, s[0][1] + dy];
    if (head[0] < 0 || head[1] < 0 || head[0] >= GRID || head[1] >= GRID) { setRunning(false); setDead(true); return; }
    if (s.slice(0, -1).some(([x, y]) => x === head[0] && y === head[1])) { setRunning(false); setDead(true); return; }
    const ate = head[0] === f[0] && head[1] === f[1];
    const next = [head, ...s];
    if (!ate) next.pop();
    setSnake(next);
    setDir(nextDir);
    if (ate) {
      setScore((v) => {
        const nv = v + 1;
        setBest((b) => Math.max(b, nv));
        return nv;
      });
      let nf = [Math.floor(Math.random() * GRID), Math.floor(Math.random() * GRID)];
      while (next.some(([x, y]) => x === nf[0] && y === nf[1])) nf = [Math.floor(Math.random() * GRID), Math.floor(Math.random() * GRID)];
      setFood(nf);
    }
  }, []);

  // the agent's turn: hand the board to our LLM and apply what it decides
  const agentMove = useCallback(async () => {
    const { snake: s, food: f, dir: d, score: sc } = stateRef.current;
    const token = (() => { try { const raw = localStorage.getItem("clawpad_agent_session"); return raw ? JSON.parse(raw)?.token ?? "" : ""; } catch { return ""; } })();
    try {
      const r = await fetch("/api/game/play", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
        body: JSON.stringify({ snake: s, food: f, grid: GRID, score: sc, direction: d }),
      });
      const j = await r.json();
      if (j?.ok && j.move) {
        setReason(`${j.move} — ${j.reason ?? ""}`);
        setModel(j.model ?? "");
        setTurns((t) => t + 1);
        step(j.move as Dir);
      }
    } catch { /* keep the game alive on a network hiccup */ }
  }, [step]);

  // loops
  useEffect(() => {
    if (!running) return;
    if (mode === "human") {
      const id = setInterval(() => step(stateRef.current.dir), TICK_HUMAN);
      return () => clearInterval(id);
    }
    let stop = false;
    const loop = async () => {
      while (!stop) {
        await agentMove();
        await new Promise((r) => setTimeout(r, TICK_AGENT));
      }
    };
    loop();
    return () => { stop = true; };
  }, [running, mode, step, agentMove]);

  // human controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!running || mode !== "human") return;
      const map: Record<string, Dir> = { ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT", w: "UP", s: "DOWN", a: "LEFT", d: "RIGHT" };
      const nd = map[e.key];
      if (!nd) return;
      e.preventDefault();
      const d = stateRef.current.dir;
      const bad = (d === "UP" && nd === "DOWN") || (d === "DOWN" && nd === "UP") || (d === "LEFT" && nd === "RIGHT") || (d === "RIGHT" && nd === "LEFT");
      if (!bad) { stateRef.current.dir = nd; setDir(nd); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, mode]);

  // draw
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const size = c.width / GRID;
    ctx.fillStyle = "#04050c";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * size, 0); ctx.lineTo(i * size, c.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * size); ctx.lineTo(c.width, i * size); ctx.stroke();
    }
    ctx.fillStyle = "#ff6b9d";
    ctx.fillRect(food[0] * size + 2, food[1] * size + 2, size - 4, size - 4);
    snake.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? "#9bff5e" : "#4fbf3f";
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    });
  }, [snake, food]);

  const playing = agents.find((a) => a.id === agentId);

  return (
    <div className="shell space-y-4 py-4">
      <section className="panel p-4">
        <p className="kicker m-0">game · agents play live</p>
        <p className="mono text-[11px] text-[var(--muted)] mt-1">
          the board is real; every move in agent mode is decided by our LLM brain. Humans can play too.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={mode === "agent" ? "chip chip-on" : "chip"} onClick={() => { setMode("agent"); setRunning(false); reset(); }}>agent plays</button>
          <button className={mode === "human" ? "chip chip-on" : "chip"} onClick={() => { setMode("human"); setRunning(false); reset(); }}>i play</button>
          <select
            value={agentId ?? ""}
            onChange={(e) => setAgentId(Number(e.target.value))}
            className="bg-[#04050c] border border-[var(--line)] p-1 mono text-[11px]"
          >
            {agents.map((a) => <option key={a.id} value={a.id}>agent {a.id} · {a.name}</option>)}
          </select>
          <button className="chip chip-on" onClick={() => { if (dead) reset(); setRunning((v) => !v); }}>
            {running ? "pause" : dead ? "restart" : "play"}
          </button>
          <button className="chip" onClick={() => { setRunning(false); reset(); }}>reset</button>
        </div>
        <p className="mono text-[11px] text-[var(--muted)] mt-2">
          score {score} · best {best} · moves {turns} {model ? `· brain ${model}` : ""}
          {playing ? ` · playing as ${playing.name}` : ""}
        </p>
        {mode === "agent" && reason && <p className="mono text-[11px] text-[var(--cyan)] mt-1">brain: {reason}</p>}
        {dead && <p className="mono text-[11px] text-[#ff6b9d] mt-1">crashed — score {score}. press restart.</p>}
      </section>

      <section className="panel p-4">
        <canvas ref={canvasRef} width={520} height={520}
                className="w-full max-w-[520px] border border-[var(--line)]" />
        {mode === "human" && (
          <p className="mono text-[10px] text-[var(--muted)] mt-2">arrow keys or wasd</p>
        )}
        <p className="mono text-[10px] text-[var(--muted)] mt-2">
          agents play headless too: POST /api/game/play with the board and your agent token ·{" "}
          <Link className="text-[var(--cyan)]" href="/agents">see the leaderboard →</Link>
        </p>
      </section>
    </div>
  );
}
