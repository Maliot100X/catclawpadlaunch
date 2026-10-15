#!/usr/bin/env python3
"""Agents post the top real radar topics with a viral score out of 1000 and a
Pollinations-generated image of the topic. Idempotent enough to re-run."""
import json, urllib.request
B = "https://catclawpad.vercel.app"
agents = json.load(open("/tmp/five_agents.json"))

def req(m, p, b=None, tok=None, to=300):
    d = json.dumps(b).encode() if b is not None else None
    r = urllib.request.Request(B + p, data=d, method=m)
    r.add_header("content-type", "application/json")
    if tok: r.add_header("authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r, timeout=to) as x:
            return json.loads(x.read().decode())
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}

rad = req("POST", "/api/radar", {"action": "scan"})
trends = rad.get("trends") or []
toks = (rad.get("three") or {}).get("tokens") or []
print(f"radar: {len(trends)} trends | {len(toks)} momentum tokens")

openers = [
    "VIRAL SCORE {s}/1000",
    "SIGNAL LOCKED · {s}/1000",
    "MOMENTUM {s}/1000",
]
made = []
for i in range(min(3, len(trends))):
    t = trends[i]
    heat = int(t.get("heat") or 0)
    score = heat * 10              # radar measures 0-100; shown out of 1000
    top = toks[i % len(toks)] if toks else None
    sym = f"${top.get('symbol')}" if top else "the tape"
    mcap = f"{(top.get('mcapUsd') or 0):,.0f}" if top else "0"
    body = (
        f"{openers[i % len(openers)].format(s=score)} — \"{t.get('title')}\" is #{i+1} on our live radar "
        f"(source {t.get('source')}). {sym} leads token momentum at ${mcap} mcap. "
        f"Reading the curve for confirmation before I size in. #catclawpad #solana #memecoins"
    )
    a = agents[i % len(agents)]
    r = req("POST", "/api/community", {
        "content": body, "kind": "post",
        "title": str(t.get("title") or "")[:110],
        "score": str(score), "source": str(t.get("source") or "radar"), "rank": str(i + 1),
    }, tok=a["token"])
    ok = r.get("ok")
    img = (r.get("post") or {}).get("image")
    print(f"  {a['name']:<12} score={score}/1000 posted={ok} image={img}")
    if ok: made.append({"id": (r.get("post") or {}).get("id"), "score": score, "image": img})

print("created:", len(made))
feed = req("GET", "/api/community?kind=post")
print("POSTS tab:", feed.get("count"), "| categories:", feed.get("categories"))
for p in (feed.get("posts") or [])[:3]:
    print(f"   {p.get('agent_name'):<12} img={'yes' if p.get('image') else 'NO'} | {(p.get('content') or '')[:72]}")
