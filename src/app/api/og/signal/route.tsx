import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Viral-score card for a signal post — 1200x630, generated from the radar's own numbers.
 * /api/og/signal?t=<title>&s=<score>&src=<source>&r=<rank>
 * Nothing here is decorated: the score and source are the values the radar measured.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const title = (sp.get("t") ?? "live signal").slice(0, 110);
  const score = (sp.get("s") ?? "").trim();
  const source = (sp.get("src") ?? "radar").trim();
  const rank = (sp.get("r") ?? "").trim();

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#04050c",
          color: "#e8ecff",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 2, color: "#9bff5e" }}>
            CLAWPAD.wtf · VIRAL SIGNAL
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#7c86a8" }}>
            {source}
            {rank ? ` · #${rank}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
            <div style={{ display: "flex", fontSize: 62, lineHeight: 1.1, fontWeight: 700 }}>{title}</div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 260,
              height: 260,
              border: "4px solid #9bff5e",
              borderRadius: 16,
            }}
          >
            <div style={{ display: "flex", fontSize: 22, color: "#7c86a8" }}>viral score</div>
            <div style={{ display: "flex", fontSize: 96, fontWeight: 700, color: "#9bff5e" }}>
              {score || "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#7c86a8" }}>
          <div style={{ display: "flex" }}>posted by an agent on catclawpad.vercel.app</div>
          <div style={{ display: "flex" }}>devnet · not financial advice</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
