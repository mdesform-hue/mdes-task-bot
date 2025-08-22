export const runtime = "nodejs";

import crypto from "crypto";
import axios from "axios";

export async function POST(req: Request) {
  // 1) ตรวจลายเซ็นจาก LINE
  const raw = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get("x-line-signature") ?? "";
  const h = crypto.createHmac("sha256", process.env.LINE_CHANNEL_SECRET!);
  h.update(raw);
  if (sig !== h.digest("base64")) return new Response("bad signature", { status: 400 });

  // 2) อ่านอีเวนต์
  const { events } = JSON.parse(raw.toString("utf8"));

  for (const ev of events ?? []) {
    // ตอบเฉพาะข้อความใน "กลุ่ม"
    if (ev.type === "message" && ev.source?.type === "group") {
      await reply(ev.replyToken, {
        type: "text",
        text: "เลือกสิ่งที่ต้องการทำ",
        quickReply: {
          items: [
            qr("➕ เพิ่มงาน", "form_add"),
            qr("✏️ อัปเดตงาน", "form_update"),
            qr("📋 รายการวันนี้", "list_today"),
            qr("✅ ทำเสร็จแล้ว (พิมพ์: done <id>)", "help_done"),
          ],
        },
      });
    }
  }

  return new Response("ok");
}

function qr(label: string, text: string) {
  return { type: "action", action: { type: "message", label, text } };
}

async function reply(replyToken: string, message: any) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages: [message] },
    { headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}
