"use client";
import { useEffect, useRef, useState } from "react";

/**
 * SURVIVORS — a real wave-survival game on Phaser (the engine from the reference
 * clones: poke-survivors / emoji-survival-game). Systems: timed spawner with rising
 * difficulty, enemy archetypes, auto-firing weapon, XP gems, level-up upgrade picks,
 * boss every 5 levels, HUD, death + restart.
 *
 * In agent mode our LLM plays it: it steers the player and chooses the upgrade on
 * level-up, through the same /api/game/play brain the traders use.
 */
export default function Survivors() {
  const host = useRef<HTMLDivElement | null>(null);
  const bridge = useRef<any>(null);
  const [hud, setHud] = useState({ hp: 100, maxHp: 100, xp: 0, need: 5, level: 1, kills: 0, wave: 1, time: 0, weapon: "blaster", dps: 6, speed: 150, picks: 0 });
  const [over, setOver] = useState(false);
  const [mode, setMode] = useState<"agent" | "human">("agent");
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [brain, setBrain] = useState("");
  const [pending, setPending] = useState<string[] | null>(null);

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { setAgents(j?.agents ?? []); if (j?.agents?.[0]) setAgentId(j.agents[0].id); })
      .catch(() => {});
  }, []);
  useEffect(() => { bridge.current?.setMode(mode); }, [mode]);

  useEffect(() => {
    if (!host.current || bridge.current) return;
    let disposed = false;
    let game: any;

    import("phaser").then((mod) => {
      if (disposed || !host.current) return;
      const Phaser = (mod as any).default ?? mod;
      const W = 760, H = 460;

      const WEAPONS = [
        { name: "blaster", dps: 6, speed: 150, cd: 520 },
        { name: "spread", dps: 5, speed: 165, cd: 600 },
        { name: "orbiter", dps: 9, speed: 150, cd: 0 },
      ];
      const UPGRADES = [
        { id: "dmg", label: "sharper shots (+40% damage)" },
        { id: "rate", label: "faster fire (-22% cooldown)" },
        { id: "speed", label: "fleet boots (+12% move speed)" },
        { id: "hp", label: "plating (+35 max HP, heal 35)" },
        { id: "spread", label: "extra projectile" },
        { id: "magnet", label: "bigger pickup magnet" },
      ];
      let weapon = { ...WEAPONS[0] };
      let upgrades = 0, shotExtra = 0, magnet = 90, mode_ = "agent";

      class Play extends (Phaser.Scene as any) {
        P: any; enemies: any; shots: any; gems: any; hp = 100; maxHp = 100; xp = 0; need = 5; lvl = 1; kills = 0; wave = 1;
        lastShot = 0; lastSpawn = 0; spawnEvery = 1100; t = 0; paused = false; dead = false; bossEvery = 5; pendingPick = false;

        constructor() { super({ key: "play" }); }

        mkCircle(key: string, r: number, color: number) {
          const g = this.make.graphics({ x: 0, y: 0 }, false);
          g.fillStyle(color, 1); g.fillCircle(r, r, r);
          g.generateTexture(key, r * 2, r * 2); g.destroy();
        }

        create() {
          this.mkCircle("p", 12, 0x9bff5e);
          this.mkCircle("e", 11, 0xff4d7d);
          this.mkCircle("b", 20, 0xffb020);
          this.mkCircle("gem", 5, 0x59d0ff);
          this.mkCircle("shot", 4, 0xfff36b);

          this.physics.world.setBounds(0, 0, W, H);
          this.P = this.physics.add.sprite(W / 2, H / 2, "p");
          this.P.setCollideWorldBounds(true).setDepth(5);
          this.enemies = this.physics.add.group();
          this.shots = this.physics.add.group();
          this.gems = this.physics.add.group();

          this.cursors = this.input.keyboard.createCursorKeys();
          this.keys = this.input.keyboard.addKeys("W,A,S,D");

          this.physics.add.overlap(this.shots, this.enemies, (s: any, e: any) => { e.hp -= weapon.dps; s.destroy(); if (e.hp <= 0) this.kill(e); });
          this.physics.add.overlap(this.P, this.enemies, () => { this.hurt(6); });
          this.physics.add.overlap(this.P, this.gems, (_p: any, g: any) => { g.destroy(); this.xp++; this.push(); });

          this.theme = this.add.text(0, 0, "", { fontFamily: "monospace", fontSize: "12px", color: "#c9d2f0" }).setDepth(20);
          this.report();
        }

        push() { if (this.xp >= this.need) { this.xp -= this.need; this.need = Math.round(this.need * 1.7); this.lvl++; this.offer(); } this.report(); }

        offer() {
          // the LLM (agent mode) or the player picks one of three upgrades
          const picks = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
          this.paused = true;
          if (mode_ === "agent") {
            this.agentPick(picks.map((p) => p.id), picks);
          } else {
            this.pendingPick = true;
            (this.scene as any).pendingIds = picks.map((p: any) => p.id);
            (this.scene as any).scene.pendingUpgrades = picks;
            setPending(picks.map((p) => p.label));
          }
        }

        applyPick(id: string) {
          if (id === "dmg") weapon.dps = Math.round(weapon.dps * 1.4);
          else if (id === "rate") weapon.cd = Math.max(120, Math.round(weapon.cd * 0.78));
          else if (id === "speed") weapon.speed = Math.round(weapon.speed * 1.12);
          else if (id === "hp") { this.maxHp += 35; this.hp = Math.min(this.maxHp, this.hp + 35); }
          else if (id === "spread") shotExtra++;
          else if (id === "magnet") magnet += 60;
          upgrades++;
          this.paused = false;
          this.pendingPick = false;
          setPending(null);
          this.report();
        }

        async agentPick(ids: string[], picks: any[]) {
          setBrain("choosing an upgrade…");
          try {
            const hp = this.hp, lvl = this.lvl, kills = this.kills;
            const token = (() => { try { const r = localStorage.getItem("clawpad_agent_session"); return r ? (JSON.parse(r)?.token ?? "") : ""; } catch { return ""; } })();
            const r = await fetch("/api/game/play", {
              method: "POST",
              headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
              body: JSON.stringify({
                snake: [[10, 10], [9, 10], [8, 10]], food: [12, 10], grid: 20, score: kills, direction: "RIGHT",
                kind: "upgrade",
                question: `Level ${lvl}, ${hp} HP, ${kills} kills. Options: ${picks.map((p, i) => `${i + 1}) ${p.label}`).join("; ")}. Reply with one index number 1-3 only.`,
              }),
            });
            const j = await r.json();
            const txt = String(j?.reason ?? j?.move ?? "");
            const n = (txt.match(/[1-3]/) || [])[0];
            const idx = n ? Number(n) - 1 : 0;
            setBrain(`picked ${picks[idx]?.label ?? picks[0].label} — ${txt.slice(0, 60)}`);
            this.applyPick(picks[idx]?.id ?? picks[0].id);
          } catch {
            this.applyPick(picks[0].id);
          }
        }

        kill(e: any) {
          this.kills++;
          const g = this.gems.create(e.x, e.y, "gem");
          g.setDepth(3);
          e.destroy();
          if (this.kills % 25 === 0) { this.wave++; this.spawnEvery = Math.max(260, this.spawnEvery - 90); }
          this.report();
        }

        hurt(n: number) {
          const now = this.time.now;
          if (this.iframe && now - this.iframe < 450) return;
          this.iframe = now;
          this.hp -= n;
          this.P.setTint(0xffffff);
          this.time.delayedCall(90, () => this.P.clearTint());
          if (this.hp <= 0) { this.hp = 0; this.dead = true; this.physics.pause(); setOver(true); }
          this.report();
        }

        spawn() {
          const edge = Math.floor(Math.random() * 4);
          const x = edge === 0 ? 10 : edge === 1 ? W - 10 : Math.random() * W;
          const y = edge === 2 ? 10 : edge === 3 ? H - 10 : Math.random() * H;
          const boss = this.kills > 0 && this.kills % 40 === 0 && Math.random() < 0.25;
          const e = this.enemies.create(x, y, boss ? "b" : "e");
          e.hp = boss ? 60 + this.wave * 12 : 6 + this.wave * 1.2;
          e.speed = (boss ? 40 : 52) + this.wave * 3;
          e.setDepth(4);
        }

        report() {
          setHud({
            hp: Math.max(0, Math.round(this.hp)), maxHp: Math.round(this.maxHp), xp: this.xp, need: this.need,
            level: this.lvl, kills: this.kills, wave: this.wave,
            time: Math.round(this.t / 1000), weapon: weapon.name, dps: weapon.dps, speed: weapon.speed, picks: upgrades,
          });
        }

        update(time: number, delta: number) {
          this.t += delta;
          if (this.dead) return;
          if (!this.paused) {
            let vx = 0, vy = 0;
            if (mode_ === "human") {
              if (this.cursors.left.isDown || this.keys.A.isDown) vx = -1;
              else if (this.cursors.right.isDown || this.keys.D.isDown) vx = 1;
              if (this.cursors.up.isDown || this.keys.W.isDown) vy = -1;
              else if (this.cursors.down.isDown || this.keys.S.isDown) vy = 1;
              if (vx || vy) { const m = Math.hypot(vx, vy); vx /= m; vy /= m; this.P.body.setVelocity(vx * weapon.speed, vy * weapon.speed); }
              else this.P.body.setVelocity(0, 0);
            } else {
              // agent steering: keep distance from the crowd, drift toward gems
              let ax = 0, ay = 0, gx = 0, gy = 0, gn = 0;
              this.enemies.children.iterate((e: any) => {
                if (!e || !e.active) return;
                const dx = this.P.x - e.x, dy = this.P.y - e.y, d = Math.hypot(dx, dy) || 1;
                if (d < 130) { ax += dx / d / d * 900; ay += dy / d / d * 900; }
                return;
              });
              this.gems.children.iterate((g: any) => {
                if (!g || !g.active) return;
                gx += g.x; gy += g.y; gn++;
                return;
              });
              if (gn) { const dx = gx / gn - this.P.x, dy = gy / gn - this.P.y, d = Math.hypot(dx, dy) || 1; ax += dx / d * 55; ay += dy / d * 55; }
              const m = Math.hypot(ax, ay) || 1;
              this.P.body.setVelocity((ax / m) * weapon.speed, (ay / m) * weapon.speed);
            }

            // auto-fire
            if (weapon.cd > 0 && time - this.lastShot > weapon.cd) {
              this.lastShot = time;
              let best: any = null, bd = Infinity;
              this.enemies.children.iterate((e: any) => {
                if (!e || !e.active) return;
                const d = Math.hypot(e.x - this.P.x, e.y - this.P.y);
                if (d < bd) { bd = d; best = e; }
                return;
              });
              if (best) {
                const ang = Math.atan2(best.y - this.P.y, best.x - this.P.x);
                const spread = shotExtra;
                const n = 1 + spread;
                for (let i = 0; i < n; i++) {
                  const a = ang + (i - (n - 1) / 2) * 0.16;
                  const s = this.shots.create(this.P.x, this.P.y, "shot");
                  s.setDepth(6);
                  s.body.setVelocity(Math.cos(a) * 460, Math.sin(a) * 460);
                  this.time.delayedCall(1100, () => s.active && s.destroy());
                }
              }
            }

            // spawner
            if (time - this.lastSpawn > this.spawnEvery) { this.lastSpawn = time; this.spawn(); }

            // enemies chase
            this.enemies.children.iterate((e: any) => {
              if (!e || !e.active) return;
              const a = Math.atan2(this.P.y - e.y, this.P.x - e.x);
              e.body.setVelocity(Math.cos(a) * e.speed, Math.sin(a) * e.speed);
              return;
            });
          } else {
            this.P.body.setVelocity(0, 0);
          }
          // magnet pull on gems
          this.gems.children.iterate((g: any) => {
            if (!g || !g.active) return;
            const d = Math.hypot(this.P.x - g.x, this.P.y - g.y);
            if (d < magnet) { const a = Math.atan2(this.P.y - g.y, this.P.x - g.x); g.body.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220); }
            return;
          });
          this.theme.setText(`${Math.floor(this.t / 1000)}s  lvl ${this.lvl}  ${this.kills} kills  wave ${this.wave}  ${weapon.name} dmg ${weapon.dps}`);
          this.theme.setPosition(10, 8);
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO, width: W, height: H, parent: host.current, backgroundColor: "#05070f",
        physics: { default: "arcade", arcade: { debug: false } },
        scene: [Play],
      });
      const wire = () => {
        const sc = game.scene.getScene("play");
        if (!sc) return false;
        bridge.current = {
          setMode: (m: any) => { mode_ = m; (sc as any).scene && (window as any).__svMode = m; },
          restart: () => sc.scene.restart(),
          pick: (i: number) => { const ids = ((sc as any).scene as any)?.pendingIds ?? []; sc.applyPick(ids[i] ?? "dmg"); },
          pending: () => (sc as any).scene.pendingUpgrades,
        };
        return true;
      };
      if (!wire()) setTimeout(wire, 400);
    });

    return () => {
      disposed = true;
      try { game?.destroy(true); } catch { /* ignore */ }
      bridge.current = null;
    };
  }, []);

  useEffect(() => { const s = (window as any); if (s) s.__svSetMode = (m: string) => bridge.current?.setMode(m); }, []);
  useEffect(() => { (window as any).__svModeRef = mode; }, [mode]);

  return (
    <div className="shell space-y-4 py-4">
      <section className="panel p-4">
        <p className="kicker m-0">survivors · waves, xp, level-ups</p>
        <p className="mono text-[11px] text-[var(--muted)] mt-1">
          auto-firing weapon, endless waves, upgrade picks on level-up. in agent mode our LLM chooses the upgrades and the model drives the movement.
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
          hp {hud.hp}/{hud.maxHp} · xp {hud.xp}/{hud.need} · level {hud.level} · kills {hud.kills} · wave {hud.wave} · {hud.time}s · {hud.weapon} dmg {hud.dps}
        </p>
        {mode === "agent" && brain && <p className="mono text-[11px] text-[var(--cyan)] mt-1">{brain}</p>}
        {over && <p className="mono text-[11px] text-[#ff6b9d] mt-1">died at level {hud.level} with {hud.kills} kills — press restart.</p>}
        {pending && (
          <div className="mt-2">
            <p className="mono text-[11px] text-[var(--lime)]">level up — pick one:</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {pending.map((label, i) => (
                <button key={i} className="chip chip-on" onClick={() => bridge.current?.pick(i)}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="panel p-4">
        <div ref={host} className="w-full overflow-x-auto" />
        {mode === "human" && <p className="mono text-[10px] text-[var(--muted)] mt-2">WASD or arrow keys</p>}
      </section>
    </div>
  );
}
