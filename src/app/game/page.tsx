"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A real 3D arena on three.js (the engine already in our stack for the avatar SDK).
 * The player hunts glowing coins while red hunters chase it. In agent mode every
 * steering decision comes from our LLM through /api/game/play — same brain, same key
 * that trades. Human mode is WASD / arrows.
 */
export default function Game() {
  const host = useRef<HTMLDivElement | null>(null);
  const ref = useRef<any>({});
  const [hud, setHud] = useState({ coins: 0, lives: 3, reason: "", model: "", running: true });
  const [mode, setMode] = useState<"agent" | "human">("agent");
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { setAgents(j?.agents ?? []); if (j?.agents?.[0]) setAgentId(j.agents[0].id); })
      .catch(() => {});
  }, []);

  useEffect(() => { ref.current.mode = mode; }, [mode]);

  useEffect(() => {
    if (!host.current || ref.current.started) return;
    ref.current.started = true;
    let disposed = false;
    let raf = 0;

    (async () => {
      const THREE = await import("three");
      if (disposed || !host.current) return;

      const W = host.current.clientWidth || 640;
      const H = 460;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x04050c);
      scene.fog = new THREE.Fog(0x04050c, 18, 46);

      const camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 200);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      host.current.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0x8899ff, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(9, 16, 7);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      scene.add(key);
      const glow = new THREE.PointLight(0x9bff5e, 1.2, 22);
      scene.add(glow);

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.9, metalness: 0.15 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      const grid = new THREE.GridHelper(60, 30, 0x2a3a66, 0x151c33);
      grid.position.y = 0.01;
      scene.add(grid);

      // player
      const player = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.42, 0.5, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0x9bff5e, emissive: 0x2f7a1f, roughness: 0.35 })
      );
      body.castShadow = true;
      player.add(body);
      scene.add(player);

      const mkCoins = (n: number) => {
        const out: any[] = [];
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.30, 0),
            new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x8a6a00, metalness: 0.6, roughness: 0.25 })
          );
          m.position.set((Math.random() - 0.5) * 26, 1.1, (Math.random() - 0.5) * 26);
          m.castShadow = true;
          scene.add(m);
          out.push(m);
        }
        return out;
      };
      let coins = mkCoins(9);

      const mkEnemies = (n: number) => {
        const out: any[] = [];
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 20, 16),
            new THREE.MeshStandardMaterial({ color: 0xff4d7d, emissive: 0x6b0f2a, roughness: 0.4 })
          );
          m.position.set((Math.random() - 0.5) * 24, 0.6, (Math.random() - 0.5) * 24);
          m.castShadow = true;
          m.userData.speed = 1.6 + i * 0.35;
          scene.add(m);
          out.push(m);
        }
        return out;
      };
      let enemies = mkEnemies(4);

      const keys: Record<string, boolean> = {};
      const onKey = (e: KeyboardEvent, down: boolean) => {
        keys[e.key.toLowerCase()] = down;
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
      };
      const kd = (e: KeyboardEvent) => onKey(e, true);
      const ku = (e: KeyboardEvent) => onKey(e, false);
      addEventListener("keydown", kd);
      addEventListener("keyup", ku);

      // agent steering
      let dir = new THREE.Vector3(1, 0, 0);
      let asking = false;
      let lastAsk = 0;
      let reason = "";
      let model = "";
      let invulnUntil = 0;

      async function askBrain() {
        const px = Math.round(player.position.x / 2) + 10;
        const pz = Math.round(player.position.z / 2) + 10;
        let near: number[] = [10, 10];
        let bd = Infinity;
        for (const c of coins) {
          const cx = Math.round(c.position.x / 2) + 10;
          const cz = Math.round(c.position.z / 2) + 10;
          const d = Math.abs(cx - px) + Math.abs(cz - pz);
          if (d < bd) { bd = d; near = [cx, cz]; }
        }
        const current = dir.x > 0.5 ? "RIGHT" : dir.x < -0.5 ? "LEFT" : dir.z > 0.5 ? "DOWN" : "UP";
        const token = (() => { try { const r = localStorage.getItem("clawpad_agent_session"); return r ? (JSON.parse(r)?.token ?? "") : ""; } catch { return ""; } })();
        try {
          const r = await fetch("/api/game/play", {
            method: "POST",
            headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
            body: JSON.stringify({ snake: [[px, pz], [px - 1, pz], [px - 2, pz]], food: near, grid: 20, score: hud.coins, direction: current }),
          });
          const j = await r.json();
          if (j?.ok && j.move) {
            reason = j.reason ?? "";
            model = j.model ?? "";
            dir.set(j.move === "RIGHT" ? 1 : j.move === "LEFT" ? -1 : 0, 0, j.move === "DOWN" ? 1 : j.move === "UP" ? -1 : 0);
            if (dir.length() === 0) dir.set(1, 0, 0);
            setHud((h) => ({ ...h, reason, model }));
          }
        } catch { /* keep playing */ }
      }

      let coins_ = 0, lives = 3, t0 = performance.now(), last = t0;
      const clock = { now: t0 };

      function animate() {
        raf = requestAnimationFrame(animate);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (ref.current.mode === "human") {
          const v = new THREE.Vector3(
            (keys["d"] || keys["arrowright"] ? 1 : 0) - (keys["a"] || keys["arrowleft"] ? 1 : 0),
            0,
            (keys["s"] || keys["arrowdown"] ? 1 : 0) - (keys["w"] || keys["arrowup"] ? 1 : 0)
          );
          if (v.lengthSq() > 0) dir.copy(v.normalize());
        } else if (!asking && now - lastAsk > 900) {
          asking = true; lastAsk = now;
          askBrain().finally(() => { asking = false; });
        }

        const speed = 6.2;
        player.position.addScaledVector(dir, speed * dt);
        player.position.x = Math.max(-28, Math.min(28, player.position.x));
        player.position.z = Math.max(-28, Math.min(28, player.position.z));
        if (dir.lengthSq() > 0) player.rotation.y = Math.atan2(dir.x, dir.z);
        body.position.y = 0.55 + Math.sin(now / 220) * 0.06;

        // coins spin + collect
        for (let i = coins.length - 1; i >= 0; i--) {
          const c = coins[i];
          c.rotation.y += dt * 2.2;
          c.rotation.x += dt * 0.9;
          if (c.position.distanceTo(player.position) < 0.95) {
            scene.remove(c);
            coins.splice(i, 1);
            coins_++;
            setHud((h) => ({ ...h, coins: coins_ }));
            if (coins.length < 7) coins.push(...mkCoins(3));
          }
        }

        // enemies hunt the player
        if (now > invulnUntil) {
          for (const e of enemies) {
            const to = new THREE.Vector3().subVectors(player.position, e.position);
            to.y = 0;
            const d = to.length();
            if (d > 0.01) e.position.addScaledVector(to.normalize(), e.userData.speed * dt);
            e.position.y = 0.6;
            if (d < 0.95) {
              lives--;
              invulnUntil = now + 1600;
              player.position.set(0, 0, 0);
              body.visible = false;
              setTimeout(() => { body.visible = true; }, 300);
              setHud((h) => ({ ...h, lives: Math.max(0, lives) }));
              if (lives <= 0) {
                coins_ = 0; lives = 3;
                enemies.forEach((x) => scene.remove(x));
                enemies = mkEnemies(4);
                coins.forEach((x) => scene.remove(x));
                coins = mkCoins(9);
                setHud((h) => ({ ...h, coins: 0, lives: 3 }));
              }
            }
          }
        }

        // chase camera
        const camTarget = new THREE.Vector3(player.position.x - dir.x * 7, 7.5, player.position.z - dir.z * 7);
        camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
        camera.lookAt(player.position.x, 1, player.position.z);
        glow.position.set(player.position.x, 3.2, player.position.z);

        renderer.render(scene, camera);
      }
      animate();

      ref.current.reset = () => {
        coins.forEach((c: any) => scene.remove(c));
        coins = mkCoins(9);
        enemies.forEach((e: any) => scene.remove(e));
        enemies = mkEnemies(4);
        coins_ = 0; lives = 3; invulnUntil = 0;
        player.position.set(0, 0, 0);
        setHud({ coins: 0, lives: 3, reason: "", model: "", running: true });
      };

      const onResize = () => {
        const w = host.current?.clientWidth || W;
        camera.aspect = w / H;
        camera.updateProjectionMatrix();
        renderer.setSize(w, H);
      };
      addEventListener("resize", onResize);

      ref.current.cleanup = () => {
        removeEventListener("keydown", kd);
        removeEventListener("keyup", ku);
        removeEventListener("resize", onResize);
        cancelAnimationFrame(raf);
        renderer.dispose();
        try { host.current?.removeChild(renderer.domElement); } catch { /* ignore */ }
      };
    })();

    return () => {
      disposed = true;
      try { ref.current.cleanup?.(); } catch { /* ignore */ }
      ref.current = {};
    };
  }, []);   // build the 3D world once; HUD state must not re-create the scene

  return (
    <div className="shell space-y-4 py-4">
      <section className="panel p-4">
        <p className="kicker m-0">arena 3d · agents play live (three.js)</p>
        <p className="mono text-[11px] text-[var(--muted)] mt-1">
          real 3D arena — collect the glowing coins, the red hunters chase you. in agent mode every steer is chosen by our LLM brain.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={mode === "agent" ? "chip chip-on" : "chip"} onClick={() => setMode("agent")}>agent plays</button>
          <button className={mode === "human" ? "chip chip-on" : "chip"} onClick={() => setMode("human")}>i play</button>
          <select value={agentId ?? ""} onChange={(e) => setAgentId(Number(e.target.value))}
                  className="bg-[#04050c] border border-[var(--line)] p-1 mono text-[11px]">
            {agents.map((a) => <option key={a.id} value={a.id}>agent {a.id} · {a.name}</option>)}
          </select>
          <button className="chip chip-on" onClick={() => ref.current.reset?.()}>reset</button>
        </div>
        <p className="mono text-[11px] text-[var(--muted)] mt-2">
          coins {hud.coins} · lives {hud.lives}{hud.model ? ` · brain ${hud.model}` : ""}
        </p>
        {mode === "agent" && hud.reason && <p className="mono text-[11px] text-[var(--cyan)] mt-1">brain: {hud.reason}</p>}
        {mode === "human" && <p className="mono text-[10px] text-[var(--muted)] mt-1">WASD or arrow keys</p>}
      </section>
      <section className="panel p-4">
        <div ref={host} className="w-full" />
      </section>
    </div>
  );
}
