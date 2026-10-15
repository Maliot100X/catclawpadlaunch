"use client";
import { useEffect, useRef, useState } from "react";

const W = 560, H = 420, CELL = 28;
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

/**
 * A richer board than the first one, built on Phaser (installed per the repo's
 * phaser-core skill): a live arena where the player hunts coins while enemies roam.
 * In agent mode every steer is decided by our LLM — the arena maps its own state onto
 * the game-brain API (player = the head, nearest coin = the target) so the same brain
 * that trades also plays.
 */
export default function Game() {
  const host = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<any>(null);
  const bridge = useRef<{ setMode: (m: "agent" | "human") => void; restart: () => void; setAgent: (id: number | null) => void } | null>(null);
  const [status, setStatus] = useState({ score: 0, lives: 3, coins: 0, reason: "", model: "" });
  const [mode, setMode] = useState<"agent" | "human">("agent");
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setAgents(j?.agents ?? []);
      if (j?.agents?.[0]) setAgentId(j.agents[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!host.current || gameRef.current) return;
    let disposed = false;
    let game: any;

    import("phaser").then((mod) => {
      if (disposed || !host.current) return;
      const Phaser = (mod as any).default ?? mod;

      let agentMode: "agent" | "human" = "agent";
      let asking = false;
      let lastAsk = 0;

      class Arena extends (Phaser.Scene as any) {
        player: any; coins: any[] = []; enemies: any[] = [];
        score = 0; lives = 3; dir: Dir = "RIGHT";
        cursors: any; keys: any;
        lastReason = ""; lastModel = "";

        constructor() { super({ key: "arena" }); }

        create() {
          this.score = 0; this.lives = 3; this.coins = []; this.enemies = []; this.dir = "RIGHT";
          this.add.rectangle(W / 2, H / 2, W, H, 0x04050c);
          const g = this.add.graphics();
          g.lineStyle(1, 0x1b2233, 1);
          for (let x = 0; x <= W; x += CELL) { g.moveTo(x, 0); g.lineTo(x, H); }
          for (let y = 0; y <= H; y += CELL) { g.moveTo(0, y); g.lineTo(W, y); }
          g.strokePath();

          this.physics.world.setBounds(0, 0, W, H);
          this.player = this.add.circle(W / 2, H / 2, CELL / 2 - 2, 0x9bff5e);
          this.physics.add.existing(this.player);
          this.player.body.setCircle(CELL / 2 - 2);
          this.player.body.setCollideWorldBounds(true);

          for (let i = 0; i < 5; i++) this.spawnCoin();
          for (let i = 0; i < 3; i++) {
            const e = this.add.circle(80 + i * 150, 80 + i * 90, CELL / 2 - 3, 0xff6b9d);
            this.physics.add.existing(e);
            e.body.setCircle(CELL / 2 - 3);
            e.body.setCollideWorldBounds(true);
            e.body.setBounce(1);
            e.speed = 70 + i * 25;
            this.enemies.push(e);
          }
          this.cursors = this.input.keyboard.createCursorKeys();
          this.keys = this.input.keyboard.addKeys("W,A,S,D");

          this.physics.add.overlap(this.player, this.coins, (_p: any, c: any) => {
            c.destroy();
            this.coins = this.coins.filter((x: any) => x.active);
            this.score++;
            this.spawnCoin();
            this.report();
          });
          this.enemies.forEach((e: any) => {
            this.physics.add.overlap(this.player, e, () => {
              this.lives--;
              if (this.lives <= 0) {
                this.physics.pause();
                this.report();
              } else {
                this.player.setPosition(W / 2, H / 2);
              }
              this.report();
            });
          });
          this.report();
        }

        spawnCoin() {
          const c = this.add.circle(40 + Math.random() * (W - 80), 40 + Math.random() * (H - 80), 7, 0xffd24a);
          this.physics.add.existing(c);
          c.body.setCircle(7);
          this.coins.push(c);
          return c;
        }

        report() {
          setStatus({
            score: this.score, lives: Math.max(0, this.lives), coins: this.coins.length,
            reason: this.lastReason, model: this.lastModel,
          });
        }

        async askBrain() {
          const px = Math.round(this.player.x / CELL), py = Math.round(this.player.y / CELL);
          const grid = Math.round(W / CELL);
          let near: number[] = [grid / 2, grid / 2];
          let bd = Infinity;
          for (const c of this.coins) {
            const cx = Math.round(c.x / CELL), cy = Math.round(c.y / CELL);
            const d = Math.abs(cx - px) + Math.abs(cy - py);
            if (d < bd) { bd = d; near = [cx, cy]; }
          }
          const token = (() => { try { const r = localStorage.getItem("clawpad_agent_session"); return r ? (JSON.parse(r)?.token ?? "") : ""; } catch { return ""; } })();
          try {
            const r = await fetch("/api/game/play", {
              method: "POST",
              headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
              body: JSON.stringify({ snake: [[px, py], [px - 1, py], [px - 2, py]], food: near, grid, score: this.score, direction: this.dir }),
            });
            const j = await r.json();
            if (j?.ok && j.move) {
              this.dir = j.move as Dir;
              this.lastReason = j.reason ?? "";
              this.lastModel = j.model ?? "";
              this.report();
            }
          } catch { /* keep playing */ }
        }

        update(time: number) {
          const sp = 170;
          let vx = 0, vy = 0;
          if (agentMode === "human") {
            const L = this.cursors.left.isDown || this.keys.A.isDown;
            const R = this.cursors.right.isDown || this.keys.D.isDown;
            const U = this.cursors.up.isDown || this.keys.W.isDown;
            const D = this.cursors.down.isDown || this.keys.S.isDown;
            if (L) { vx = -sp; this.dir = "LEFT"; } else if (R) { vx = sp; this.dir = "RIGHT"; }
            if (U) { vy = -sp; this.dir = "UP"; } else if (D) { vy = sp; this.dir = "DOWN"; }
          } else {
            if (!asking && time - lastAsk > 420) {
              asking = true;
              lastAsk = time;
              this.askBrain().finally(() => { asking = false; });
            }
            if (this.dir === "UP") vy = -sp;
            else if (this.dir === "DOWN") vy = sp;
            else if (this.dir === "LEFT") vx = -sp;
            else vx = sp;
          }
          this.player.body.setVelocity(vx, vy);

          for (const e of this.enemies) {
            const v = e.body.velocity;
            if (!v.x && !v.y) {
              const a = Math.random() * Math.PI * 2;
              e.body.setVelocity(Math.cos(a) * e.speed, Math.sin(a) * e.speed);
            }
            if (e.x < 20 || e.x > W - 20) e.body.setVelocityX(-e.body.velocity.x);
            if (e.y < 20 || e.y > H - 20) e.body.setVelocityY(-e.body.velocity.y);
          }
        }

        restartArena() { this.scene.restart(); }
        setAgentMode(m: "agent" | "human") { agentMode = m; }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: W, height: H,
        parent: host.current,
        backgroundColor: "#04050c",
        physics: { default: "arcade", arcade: { gravity: { y: 0 }, debug: false } },
        scene: [Arena],
      });
      gameRef.current = game;

      const wire = () => {
        const sc = game.scene.getScene("arena");
        if (!sc) return false;
        bridge.current = {
          setMode: (m) => sc.setAgentMode(m),
          restart: () => sc.restartArena(),
          setAgent: () => {},
        };
        return true;
      };
      if (!wire()) setTimeout(wire, 400);
    });

    return () => {
      disposed = true;
      try { gameRef.current?.destroy(true); } catch { /* ignore */ }
      gameRef.current = null;
      bridge.current = null;
    };
  }, []);

  useEffect(() => { bridge.current?.setMode(mode); }, [mode]);

  return (
    <div className="shell space-y-4 py-4">
      <section className="panel p-4">
        <p className="kicker m-0">arena · agents play live (phaser)</p>
        <p className="mono text-[11px] text-[var(--muted)] mt-1">
          collect the coins, dodge the pink roamers. in agent mode every steer is decided by our LLM brain.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={mode === "agent" ? "chip chip-on" : "chip"} onClick={() => setMode("agent")}>agent plays</button>
          <button className={mode === "human" ? "chip chip-on" : "chip"} onClick={() => setMode("human")}>i play</button>
          <select value={agentId ?? ""} onChange={(e) => setAgentId(Number(e.target.value))}
                  className="bg-[#04050c] border border-[var(--line)] p-1 mono text-[11px]">
            {agents.map((a) => <option key={a.id} value={a.id}>agent {a.id} · {a.name}</option>)}
          </select>
          <button className="chip chip-on" onClick={() => bridge.current?.restart()}>restart</button>
        </div>
        <p className="mono text-[11px] text-[var(--muted)] mt-2">
          coins {status.score} · lives {status.lives} · on board {status.coins}{status.model ? ` · brain ${status.model}` : ""}
        </p>
        {mode === "agent" && status.reason && <p className="mono text-[11px] text-[var(--cyan)] mt-1">brain: {status.reason}</p>}
      </section>
      <section className="panel p-4">
        <div ref={host} className="w-full max-w-[560px]" />
        {mode === "human" && <p className="mono text-[10px] text-[var(--muted)] mt-2">arrow keys or wasd</p>}
      </section>
    </div>
  );
}
