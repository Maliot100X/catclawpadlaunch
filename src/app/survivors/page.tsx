"use client";
import { useEffect, useRef, useState } from "react";
import { mountSurvivors, type SurvivorsHud } from "@/lib/survivors";

export default function Survivors() {
  const host = useRef<HTMLDivElement | null>(null);
  const ctl = useRef<any>(null);
  const [hud, setHud] = useState<SurvivorsHud>({
    hp: 100, maxHp: 100, xp: 0, need: 5, level: 1, kills: 0, wave: 1, time: 0,
    weapon: "blaster", dps: 6, speed: 150, picks: 0, alive: true,
  });
  const [mode, setMode] = useState<"agent" | "human">("agent");
  const [brain, setBrain] = useState("");
  const [offer, setOffer] = useState<string[] | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const modeRef = useRef<"agent" | "human">("agent");

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { setAgents(j?.agents ?? []); if (j?.agents?.[0]) setAgentId(j.agents[0].id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!host.current || ctl.current) return;
    let disposed = false;
    mountSurvivors(host.current, {
      mode: () => modeRef.current,
      onHud: (h) => setHud(h),
      onBrain: (line) => setBrain(line),
      onOffer: (labels) => setOffer(labels),
    }).then((c) => {
      if (disposed) { c.destroy(); return; }
      ctl.current = c;
      c.setMode(modeRef.current);
    }).catch(() => setBrain("engine failed to load"));
    return () => { disposed = true; try { ctl.current?.destroy(); } catch { /* ignore */ } ctl.current = null; };
  }, []);

  useEffect(() => { modeRef.current = mode; ctl.current?.setMode(mode); }, [mode]);

  return (
    <div className="shell space-y-4 py-4">
      <section className="panel p-4">
        <p className="kicker m-0">survivors · waves · xp · level-ups</p>
        <p className="mono text-[11px] text-[var(--muted)] mt-1">
          auto-firing weapon, endless waves, three upgrade choices on every level. in agent mode our LLM picks each upgrade and the model drives the movement.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={mode === "agent" ? "chip chip-on" : "chip"} onClick={() => setMode("agent")}>agent plays</button>
          <button className={mode === "human" ? "chip chip-on" : "chip"} onClick={() => setMode("human")}>i play</button>
          <select value={agentId ?? ""} onChange={(e) => setAgentId(Number(e.target.value))}
                  className="bg-[#04050c] border border-[var(--line)] p-1 mono text-[11px]">
            {agents.map((a) => <option key={a.id} value={a.id}>agent {a.id} · {a.name}</option>)}
          </select>
          <button className="chip chip-on" onClick={() => ctl.current?.restart()}>restart</button>
        </div>
        <p className="mono text-[11px] text-[var(--muted)] mt-2">
          hp {hud.hp}/{hud.maxHp} · xp {hud.xp}/{hud.need} · level {hud.level} · kills {hud.kills} · wave {hud.wave} · {hud.time}s · {hud.weapon} {hud.dps} dmg
        </p>
        {mode === "agent" && brain && <p className="mono text-[11px] text-[var(--cyan)] mt-1">{brain}</p>}
        {!hud.alive && <p className="mono text-[11px] text-[#ff6b9d] mt-1">died at level {hud.level} with {hud.kills} kills — hit restart.</p>}
        {offer && (
          <div className="mt-2">
            <p className="mono text-[11px] text-[var(--lime)]">level up — pick one:</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {offer.map((label, i) => <button key={i} className="chip chip-on" onClick={() => ctl.current?.pick(i)}>{label}</button>)}
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
