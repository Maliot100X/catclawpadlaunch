#!/usr/bin/env python3
"""Create 5 agents, give each a real radar trend as a signal, and have them
follow / like / comment on each other. Prints a compact verification summary."""
import json, time, urllib.request, urllib.error

B = "https://catclawpad.vercel.app"

def req(method, path, body=None, token=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B + path, data=data, method=method)
    r.add_header("content-type", "application/json")
    if token:
        r.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}: {e.read().decode()[:160]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:160]}

# 1) real trending topics from our own radar
radar = req("POST", "/api/radar", {"action": "scan"})
trends = [t.get("title") for t in (radar.get("trends") or []) if t.get("title")]
three = (radar.get("three") or {}).get("tokens") or []
print("radar trends:", len(trends), "| live tokens:", len(three))

PERSONAS = [
    ("CurveHawk", "curve-sniper", "Hunts early devnet curves and front-runs momentum"),
    ("DipClaw", "dip-buyer", "Buys panic dumps on thin curves and holds"),
    ("SignalCat", "curve-sniper", "Turns viral trends into tradeable signals"),
    ("VoltPaw", "launch-and-trade", "Launches coins from whatever is trending and trades them"),
    ("NightClaw", "dip-buyer", "Quiet accumulation, sells into strength"),
]

# 2) register the five
agents = []
for name, strat, persona in PERSONAS:
    r = req("POST", "/api/register/agent", {"name": name, "persona": persona, "strategy": strat})
    if r.get("ok"):
        agents.append({"id": r["agentId"], "name": name, "token": r["agentToken"]})
        print(f"  registered {name} id={r['agentId']} funded={r.get('fundedSol')}")
    else:
        print(f"  FAILED {name}: {r.get('error')}")

if len(agents) < 2:
    print("not enough agents — stopping")
    raise SystemExit(1)

# 3) each agent posts a signal, using a real trend + a real token when available
posts = []
for i, a in enumerate(agents):
    if trends:
        topic = trends[i % len(trends)]
        hype = f"Signal: \"{topic}\" is moving on the radar right now."
    else:
        hype = "Signal: radar is quiet, watching curve flow instead."
    if three:
        t = three[i % len(three)]
        hype += f" Watching ${t.get('symbol') or '?'} ({t.get('mint','')[:8]}…) at ${t.get('mcapUsd') or 0:,.0f} mcap."
    r = req("POST", "/api/community", {"content": hype, "kind": "signal"}, token=a["token"])
    if r.get("ok"):
        posts.append({"id": r["post"]["id"], "agent": a["name"]})
        print(f"  posted signal as {a['name']} (post {r['post']['id']})")

# 4) follow everyone else, like + comment on their posts
inter = {"follows": 0, "likes": 0, "comments": 0}
for a in agents:
    for other in agents:
        if other["id"] == a["id"]:
            continue
        if req("POST", "/api/community?action=follow", {"targetId": other["id"]}, token=a["token"]).get("ok"):
            inter["follows"] += 1
    for p in posts:
        if p["agent"] == a["name"]:
            continue
        if req("POST", "/api/community?action=like", {"postId": p["id"]}, token=a["token"]).get("ok"):
            inter["likes"] += 1
        msg = f"{a['name']} here — that's a clean read, adding it to my watchlist."
        if req("POST", "/api/community?action=comment", {"postId": p["id"], "content": msg}, token=a["token"]).get("ok"):
            inter["comments"] += 1

print("interactions created:", inter)

# 5) verify from the public API
feed = req("GET", "/api/community?kind=signal")
print("feed signals:", feed.get("count"), "| categories:", feed.get("categories"))
for p in (feed.get("posts") or [])[:5]:
    print(f"   {p['agent_name']:<12} likes={p['likes']} comments={p['comments']} followers={p['followers']} | {(p['content'] or '')[:64]}")

# 6) write the created agent ids so the operator can clean up or keep them
open("/tmp/five_agents.json", "w").write(json.dumps(agents))
print("agent ids:", [a["id"] for a in agents])
