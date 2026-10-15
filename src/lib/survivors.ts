/**
 * SURVIVORS — wave-survival game engine.
 *
 * Kept in a plain .ts file on purpose: the class-based Phaser scene parses cleanly
 * here, whereas the same code inside a .tsx file trips the JSX parser.
 *
 * Systems (mirroring the reference clones poke-survivors / emoji-survival-game):
 *  - timed spawner whose interval tightens as kills rise
 *  - enemy archetypes (grunt / brute / boss) with scaling hp + speed
 *  - auto-firing weapon with spread and cooldown upgrades
 *  - xp gems with a magnet radius, level-up choice of 3 upgrades
 *  - hud callbacks out to React, death + restart
 */
export type SurvivorsOpts = {
  mode: () => "agent" | "human";
  onHud: (h: SurvivorsHud) => void;
  onBrain?: (line: string) => void;
  onOffer?: (labels: string[] | null) => void;
};

export type SurvivorsHud = {
  hp: number; maxHp: number; xp: number; need: number; level: number; kills: number;
  wave: number; time: number; weapon: string; dps: number; speed: number; picks: number; alive: boolean;
};

type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

const WEAPONS = [
  { name: "blaster", dps: 6, cd: 520, speed: 150 },
  { name: "spread", dps: 5, cd: 620, speed: 165 },
];

const UPGRADES = [
  { id: "dmg", label: "sharper shots (+40% damage)" },
  { id: "rate", label: "faster fire (-20% cooldown)" },
  { id: "speed", label: "fleet boots (+12% move speed)" },
  { id: "hp", label: "plating (+35 max hp, heal 35)" },
  { id: "spread", label: "extra projectile" },
  { id: "magnet", label: "bigger pickup magnet" },
];

export async function mountSurvivors(host: HTMLElement, opts: SurvivorsOpts) {
  const mod: any = await import("phaser");
  const Phaser = mod.default ?? mod;

  const W = 760, H = 460;
  let mode_: "agent" | "human" = "agent";
  let weapon = { ...WEAPONS[0] };
  let shotExtra = 0, magnet = 90, upgrades = 0, pendingIds: string[] = [];
  let scene: any = null;

  function mkCircle(s: any, key: string, r: number, color: number) {
    const g = s.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    g.fillCircle(r, r, r);
    g.generateTexture(key, r * 2, r * 2);
    g.destroy();
  }

  class Play extends Phaser.Scene {
    P: any; enemies: any; shots: any; gems: any; theme: any;
    hp = 100; maxHp = 100; xp = 0; need = 5; lvl = 1; kills = 0; wave = 1;
    lastShot = 0; lastSpawn = 0; spawnEvery = 1100; t = 0; dead = false; paused = false;
    iframe = 0; cursors: any; keys: any;

    constructor() { super({ key: "play" }); }

    create() {
      mkCircle(this, "p", 12, 0x9bff5e);
      mkCircle(this, "e", 11, 0xff4d7d);
      mkCircle(this, "b", 20, 0xffb020);
      mkCircle(this, "gem", 5, 0x59d0ff);
      mkCircle(this, "shot", 4, 0xfff36b);

      this.add.rectangle(W / 2, H / 2, W, H, 0x05070f);
      this.physics.world.setBounds(0, 0, W, H);

      this.P = this.physics.add.sprite(W / 2, H / 2, "p").setDepth(5);
      this.P.setCollideWorldBounds(true);
      this.enemies = this.physics.add.group();
      this.shots = this.physics.add.group();
      this.gems = this.physics.add.group();

      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys("W,A,S,D");

      this.physics.add.overlap(this.shots, this.enemies, (s: any, e: any) => {
        e.hp -= weapon.dps;
        s.destroy();
        if (e.hp <= 0) this.kill(e);
      });
      this.physics.add.overlap(this.P, this.enemies, () => this.hurt(6));
      this.physics.add.overlap(this.P, this.gems, (_p: any, g: any) => {
        g.destroy(); this.xp++; this.gain();
      });

      this.theme = this.add.text(10, 8, "", { fontFamily: "monospace", fontSize: "12px", color: "#c9d2f0" }).setDepth(20);
      this.report();
    }

    gain() {
      if (this.xp >= this.need) {
        this.xp -= this.need;
        this.need = Math.round(this.need * 1.7);
        this.lvl++;
        this.offer();
      }
      this.report();
    }

    offer() {
      const picks = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
      pendingIds = picks.map((p) => p.id);
      this.paused = true;
      if (mode_ === "agent") {
        opts.onOffer?.(null);
        opts.onBrain?.("choosing an upgrade…");
        this.agentPick(picks);
      } else {
        opts.onOffer?.(picks.map((p) => p.label));
      }
    }

    applyPick(id: string) {
      if (id === "dmg") weapon.dps = Math.round(weapon.dps * 1.4);
      else if (id === "rate") weapon.cd = Math.max(120, Math.round(weapon.cd * 0.8));
      else if (id === "speed") weapon.speed = Math.round(weapon.speed * 1.12);
      else if (id === "hp") { this.maxHp += 35; this.hp = Math.min(this.maxHp, this.hp + 35); }
      else if (id === "spread") shotExtra++;
      else if (id === "magnet") magnet += 60;
      upgrades++;
      this.paused = false;
      pendingIds = [];
      opts.onOffer?.(null);
      this.report();
    }

    async agentPick(picks: { id: string; label: string }[]) {
      const token = (() => {
        try { const r = localStorage.getItem("clawpad_agent_session"); return r ? (JSON.parse(r)?.token ?? "") : ""; } catch { return ""; }
      })();
      const q = `You are playing a wave-survival game. Level ${this.lvl}, ${Math.round(this.hp)} hp, ${this.kills} kills, weapon ${weapon.name} at ${weapon.dps} damage. Choose the best upgrade: ${picks.map((p, i) => `${i + 1}) ${p.label}`).join("; ")}. Answer with the single number of your choice.`;
      try {
        const r = await fetch("/api/game/play", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
          body: JSON.stringify({
            kind: "upgrade",
            snake: [[10, 10], [9, 10], [8, 10]], food: [12, 10], grid: 20, score: this.kills, direction: "RIGHT",
            question: q,
          }),
        });
        const j = await r.json();
        const txt = String(j?.reason ?? j?.move ?? "");
        const n = (txt.match(/[1-3]/) || [])[0];
        const idx = n ? Number(n) - 1 : 0;
        const chosen = picks[idx] ?? picks[0];
        opts.onBrain?.(`level ${this.lvl}: took ${chosen.label} — "${txt.slice(0, 70)}"`);
        this.applyPick(chosen.id);
      } catch {
        opts.onBrain?.("brain unreachable — took the first upgrade");
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
      if (now - this.iframe < 450) return;
      this.iframe = now;
      this.hp -= n;
      this.P.setTint(0xffffff);
      this.time.delayedCall(90, () => this.P.clearTint());
      if (this.hp <= 0) { this.hp = 0; this.dead = true; this.physics.pause(); }
      this.report();
    }

    spawn() {
      const edge = Math.floor(Math.random() * 4);
      const x = edge === 0 ? 10 : edge === 1 ? W - 10 : 10 + Math.random() * (W - 20);
      const y = edge === 2 ? 10 : edge === 3 ? H - 10 : 10 + Math.random() * (H - 20);
      const isBoss = this.kills > 20 && this.kills % 40 === 0 && Math.random() < 0.3;
      const e: any = this.enemies.create(x, y, isBoss ? "b" : "e");
      e.hp = isBoss ? 60 + this.wave * 12 : 6 + this.wave * 1.2;
      e.speed = (isBoss ? 40 : 52) + this.wave * 3;
      e.setDepth(4);
    }

    report() {
      opts.onHud({
        hp: Math.max(0, Math.round(this.hp)), maxHp: Math.round(this.maxHp), xp: this.xp, need: this.need,
        level: this.lvl, kills: this.kills, wave: this.wave, time: Math.round(this.t / 1000),
        weapon: weapon.name, dps: weapon.dps, speed: weapon.speed, picks: upgrades, alive: !this.dead,
      });
    }

    update(time: number, delta: number) {
      this.t += delta;
      if (this.dead) return;

      if (this.paused) { this.P.body.setVelocity(0, 0); return; }

      if (mode_ === "human") {
        let vx = 0, vy = 0;
        if (this.cursors.left.isDown || this.keys.A.isDown) vx = -1;
        else if (this.cursors.right.isDown || this.keys.D.isDown) vx = 1;
        if (this.cursors.up.isDown || this.keys.W.isDown) vy = -1;
        else if (this.cursors.down.isDown || this.keys.S.isDown) vy = 1;
        const m = Math.hypot(vx, vy) || 1;
        this.P.body.setVelocity((vx / m) * weapon.speed, (vy / m) * weapon.speed);
      } else {
        // agent steering: flee the crowd, drift toward gems
        let ax = 0, ay = 0;
        const px = this.P.x, py = this.P.y;
        this.enemies.children.iterate((e: any) => {
          if (!e || !e.active) return;
          const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
          if (d < 130) { ax += (dx / d) * (140 - d) * 3; ay += (dy / d) * (140 - d) * 3; }
        });
        let gx = 0, gy = 0, gn = 0;
        this.gems.children.iterate((g: any) => {
          if (!g || !g.active) return;
          gx += g.x; gy += g.y; gn++;
        });
        if (gn) {
          const dx = gx / gn - px, dy = gy / gn - py, d = Math.hypot(dx, dy) || 1;
          ax += (dx / d) * 60; ay += (dy / d) * 60;
        }
        const m = Math.hypot(ax, ay) || 1;
        this.P.body.setVelocity((ax / m) * weapon.speed, (ay / m) * weapon.speed);
      }

      // auto-fire at the nearest enemy
      if (time - this.lastShot > weapon.cd) {
        this.lastShot = time;
        let best: any = null, bd = Infinity;
        this.enemies.children.iterate((e: any) => {
          if (!e || !e.active) return;
          const d = Math.hypot(e.x - this.P.x, e.y - this.P.y);
          if (d < bd) { bd = d; best = e; }
        });
        if (best) {
          const ang = Math.atan2(best.y - this.P.y, best.x - this.P.x);
          const n = 1 + shotExtra;
          for (let i = 0; i < n; i++) {
            const a = ang + (i - (n - 1) / 2) * 0.16;
            const s: any = this.shots.create(this.P.x, this.P.y, "shot");
            s.setDepth(6);
            s.body.setVelocity(Math.cos(a) * 460, Math.sin(a) * 460);
            this.time.delayedCall(1100, () => { if (s.active) s.destroy(); });
          }
        }
      }

      if (time - this.lastSpawn > this.spawnEvery) { this.lastSpawn = time; this.spawn(); }

      this.enemies.children.iterate((e: any) => {
        if (!e || !e.active) return;
        const a = Math.atan2(this.P.y - e.y, this.P.x - e.x);
        e.body.setVelocity(Math.cos(a) * e.speed, Math.sin(a) * e.speed);
      });

      this.gems.children.iterate((g: any) => {
        if (!g || !g.active) return;
        const d = Math.hypot(this.P.x - g.x, this.P.y - g.y);
        if (d < magnet) {
          const a = Math.atan2(this.P.y - g.y, this.P.x - g.x);
          g.body.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220);
        }
      });

      this.theme.setText(`${Math.floor(this.t / 1000)}s  lvl ${this.lvl}  ${this.kills} kills  wave ${this.wave}  ${weapon.name} ${weapon.dps}dmg`);
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO, width: W, height: H, parent: host, backgroundColor: "#05070f",
    physics: { default: "arcade", arcade: { debug: false } },
    scene: [Play],
  });

  await new Promise<void>((res) => {
    const check = (n: number) => {
      scene = game.scene.getScene("play");
      if (scene) return res();
      if (n > 60) return res();
      setTimeout(() => check(n + 1), 50);
    };
    check(0);
  });

  return {
    setMode: (m: "agent" | "human") => { mode_ = m; },
    pick: (i: number) => scene?.applyPick(pendingIds[i] ?? "dmg"),
    restart: () => { if (scene) { weapon = { ...WEAPONS[0] }; shotExtra = 0; magnet = 90; upgrades = 0; scene.scene.restart(); } },
    destroy: () => { try { game.destroy(true); } catch { /* ignore */ } },
  };
}
