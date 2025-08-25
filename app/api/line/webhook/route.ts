export const runtime = "nodejs";

import crypto from "crypto";
import { sql } from "../../../../lib/db"; // <= สำคัญ: พาธจาก app/api/line/webhook

// สำหรับทดสอบเปิดในเบราว์เซอร์/Verify
export async function GET() { return new Response("ok", { status: 200 }); }
export async function HEAD() { return new Response(null, { status: 200 }); }

export async function POST(req: Request) {
  // --- verify LINE signature ---
  const raw = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get("x-line-signature") ?? "";
  const h = crypto.createHmac("sha256", process.env.LINE_CHANNEL_SECRET!);
  h.update(raw);
  if (sig !== h.digest("base64")) {
    return new Response("bad signature", { status: 400 });
  }

  const { events } = JSON.parse(raw.toString("utf8") || "{}");

  for (const ev of events ?? []) {
    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    if (ev.source?.type !== "group") continue;

    const groupId: string = ev.source.groupId;
    const text = (ev.message.text as string).trim();

    // ====== ROUTER แบบง่าย ======
    if (/^(help|ช่วยเหลือ)$/i.test(text)) {
      await reply(ev.replyToken, { type: "text", text: helpText() });
      continue;
    }

// add <title> | desc=ข้อความ | due=YYYY-MM-DD
if (/^add\s+/i.test(text) || /^เพิ่ม\s+/i.test(text)) {
  try {
    const m = text
      .replace(/^(add|เพิ่ม)\s+/i, "")
      .match(/^(.*?)(?:\s*\|\s*desc=(.*?))?(?:\s*\|\s*due=(\d{4}-\d{2}-\d{2}))?\s*$/);

    if (!m) {
      await reply(ev.replyToken, { type: "text",
        text: "รูปแบบไม่ถูกต้อง\nตัวอย่าง:\nadd ชื่องาน | desc=รายละเอียด | due=2025-09-01" });
      return;
    }

    const title = (m[1] || "").trim();
    const desc  = m[2]?.trim() || null;
    const due   = m[3]?.trim() || null;

    if (!title) {
      await reply(ev.replyToken, { type: "text",
        text: "กรุณาระบุชื่อเรื่องงาน เช่น:\nadd เตรียมเอกสาร | desc=สำหรับประชุม | due=2025-09-01" });
      return;
    }

    // ให้มี group ในตารางก่อน (กัน FK)
    await sql/* sql */`
      insert into public.groups(id) values (${groupId})
      on conflict (id) do nothing`;

    // เวลาไทย 00:00
    const dueIso = due ? new Date(`${due}T00:00:00+07:00`).toISOString() : null;

    // gen code 4 หลัก (0000-9999) และ retry ถ้าชนภายในกลุ่ม
    const genCode4 = () =>
      Math.floor(Math.random() * 10000).toString().padStart(4, "0");

    let code = genCode4();
    let rows: any[] = [];
    for (let i = 0; i < 25; i++) {
      try {
        rows = await sql/* sql */`
          insert into public.tasks (group_id, code, title, description, due_at)
          values (${groupId}, ${code}, ${title}, ${desc}, ${dueIso})
          returning code, title, due_at`;
        break; // success
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        // unique (group_id, code) ชน → สุ่มใหม่
        if (msg.includes("tasks_group_code_uq") || msg.includes("duplicate key value")) {
          code = genCode4();
          continue;
        }
        throw e; // error อื่น ๆ
      }
    }

    if (!rows.length) throw new Error("Cannot allocate 4-digit code");

    const r = rows[0];
    await reply(ev.replyToken, {
      type: "text",
      text: `🆕 เพิ่มงานแล้ว
• CODE: ${r.code}
• เรื่อง: ${r.title}${r.due_at ? `\n• กำหนด: ${fmtDate(r.due_at)}` : ""}`
    });
  } catch (e: any) {
    console.error("ADD_ERR", e);
    await reply(ev.replyToken, { type: "text",
      text: "เพิ่มงานไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์ help เพื่อดูรูปแบบคำสั่ง" });
  }
  return;
}
    // list (ทั้งหมด) หรือ list today
    if (/^list(\s+today)?$/i.test(text) || /^รายการ/i.test(text)) {
      const onlyToday = /today/i.test(text);
      const rows = onlyToday
        ? await sql/* sql */`
            select id, title, status, due_at, progress
            from public.tasks
            where group_id=${groupId}
              and date(timezone('Asia/Bangkok', due_at)) = date(timezone('Asia/Bangkok', now()))
  order by coalesce(due_at, now()+interval '10 years') asc
  limit 50`;
        : await sql/* sql */`
            select id, title, status, due_at, progress
            from public.tasks
            where group_id=${groupId}
            order by coalesce(due_at, now()+interval '10 years') asc
            limit 50`;

      if (!rows.length) {
        await reply(ev.replyToken, { type: "text", text: onlyToday ? "วันนี้ยังไม่มีงาน" : "ยังไม่มีงานในกลุ่มครับ" });
        continue;
      }

      const body = rows.map((r: any, i: number) =>
        `${i + 1}. [${r.status ?? "todo"}] ${r.title}` +
        (r.due_at ? `  (due: ${fmtDate(r.due_at)})` : "") +
        `\n   id=${r.id}  progress=${r.progress ?? 0}%`
      ).join("\n");

      await reply(ev.replyToken, {
        type: "text",
        text: `📋 รายการงาน${onlyToday ? " (วันนี้)" : ""}\n` + body
      });
      continue;
    }

    // done <id>
    if (/^done\s+/i.test(text) || /^เสร็จ\s+/i.test(text)) {
      const id = text.replace(/^(done|เสร็จ)\s+/i, "").trim();
      if (!id) {
        await reply(ev.replyToken, { type: "text", text: "พิมพ์: done <id>\nเช่น: done 123e4567-..." });
        continue;
      }
      const rows = await sql/* sql */`
        update public.tasks
        set status='done', progress=100, updated_at=now()
        where id=${id} and group_id=${groupId}
        returning id, title`;
      if (!rows.length) {
        await reply(ev.replyToken, { type: "text", text: "ไม่พบน้ำงานที่ระบุ หรือ id ไม่อยู่ในกลุ่มนี้" });
        continue;
      }
      await reply(ev.replyToken, { type: "text", text: `✅ ทำเสร็จแล้ว: ${rows[0].title}\n(id=${rows[0].id})` });
      continue;
    }

    // ช่วยเหลือ/คำสั่งเริ่มต้น
    await reply(ev.replyToken, { type: "text", text: helpText() });
  }

  return new Response("ok", { status: 200 });
}

// ---------- utils ----------
function fmtDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  // en-CA หรือ sv-SE ให้รูปแบบ YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}
function helpText() {
  return [
    "🧭 คำสั่งที่ใช้ได้:",
    "• add ชื่องาน | desc=รายละเอียด | due=YYYY-MM-DD",
    "• list   — แสดงรายการงาน",
    "• list today — แสดงงานที่กำหนดวันนี้",
    "• done <id> — ปิดงานโดยระบุ id",
    "• help — แสดงวิธีใช้งาน",
  ].join("\n");
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
