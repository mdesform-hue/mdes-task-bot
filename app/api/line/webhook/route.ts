export const runtime = "nodejs";

import crypto from "crypto";

export async function GET() {
  return new Response("ok", { status: 200 });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get("x-line-signature") ?? "";
  const skipSig = process.env.SKIP_LINE_SIGNATURE === "1";

  if (!skipSig) {
    const h = crypto.createHmac("sha256", process.env.LINE_CHANNEL_SECRET!);
    h.update(raw);
    if (sig !== h.digest("base64")) {
      return new Response("bad signature", { status: 400 });
    }
  }

  const { events } = JSON.parse(raw.toString("utf8") || "{}");
  for (const ev of events ?? []) {
    if (ev.type === "message" && ev.replyToken) {
      await reply(ev.replyToken, { type: "text", text: "Webhook OK ✅" });
    }
  }
  return new Response("ok", { status: 200 });
}

async function reply(replyToken: string, message: any) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
}
