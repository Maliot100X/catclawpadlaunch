import { NextRequest } from "next/server";
import { MODEL_MAP, RETAIL_PER_1M } from "./cluster";
import { deductCredits, estimateCostCredits, resolveKey } from "./ledger";

export type ChatBody = {
  model?: string;
  messages?: { role: string; content: string }[];
  max_tokens?: number;
  stream?: boolean;
};

export async function handleChatCompletions(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  if (!raw) {
    return Response.json({ error: { message: "Missing API key", type: "auth_error" } }, { status: 401 });
  }
  const key = resolveKey(raw);
  if (!key) {
    return Response.json({ error: { message: "Invalid API key", type: "auth_error" } }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: { message: "Invalid JSON", type: "invalid_request" } }, { status: 400 });
  }

  const model = body.model || "claude";
  if (!MODEL_MAP[model] && !Object.values(MODEL_MAP).includes(model)) {
    return Response.json(
      {
        error: {
          message: `Model not allowed: ${model}. Allowed: ${Object.keys(MODEL_MAP).join(", ")}`,
          type: "catclawpad_error",
        },
      },
      { status: 400 }
    );
  }

  const messages = body.messages || [];
  const last = messages[messages.length - 1]?.content || "";
  const promptTokens = Math.ceil(JSON.stringify(messages).length / 4);
  const maxOut = Math.min(body.max_tokens || 256, 4096);
  const retail = RETAIL_PER_1M[model] ?? 10;
  // pre-auth roughly max cost
  const est = estimateCostCredits(model, promptTokens, maxOut, retail);
  const bill = deductCredits(key.wallet, est);
  if (!bill.ok) {
    return Response.json(
      { error: { message: "Insufficient LLM credits. Buy or stake to top up.", type: "rate_limit_error", code: 402 } },
      { status: 402 }
    );
  }

  const upstream = process.env.UPSTREAM_OPENAI_BASE_URL;
  const upstreamKey = process.env.UPSTREAM_OPENAI_API_KEY;
  let content = "";
  let completionTokens = 8;
  let usedModel = MODEL_MAP[model] || model;

  if (upstream && upstreamKey) {
    try {
      const r = await fetch(`${upstream.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstreamKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: usedModel,
          messages,
          max_tokens: maxOut,
          stream: false,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        content = data.choices?.[0]?.message?.content || "";
        completionTokens = data.usage?.completion_tokens || Math.ceil(content.length / 4);
        usedModel = data.model || usedModel;
      } else {
        content = `[upstream ${r.status}] ${data.error?.message || "failed"} — local echo: ${last.slice(0, 200)}`;
      }
    } catch (e) {
      content = `[upstream error] ${String(e)} — local echo: ${last.slice(0, 200)}`;
    }
  } else {
    // Local mock completion (devnet / no upstream yet)
    content = `gm from CatClawPad (${model}→${usedModel}) on cluster mock.\nYou said: ${last.slice(0, 500)}`;
    completionTokens = Math.ceil(content.length / 4);
  }

  const actual = estimateCostCredits(model, promptTokens, completionTokens, retail);
  // already deducted est; if actual < est, refund difference
  if (actual < est) {
    const { creditWallet } = await import("./ledger");
    creditWallet(key.wallet, est - actual);
  }

  return Response.json({
    id: `ccp-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: usedModel,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content },
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    catclawpad: {
      billed_credits: actual,
      cluster: process.env.NEXT_PUBLIC_CLUSTER || "devnet",
    },
  });
}
