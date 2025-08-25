export const runtime = "nodejs";

import crypto from "crypto";
import { sql } from "../../../../lib/db";

// healthcheck / verify
export async function GET() { return new Response("ok", { status: 200 }); }
export async function HEAD() { return new Response(null, { status: 200 }); }

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get("x-line-signature") ?? "";
  const h = crypto.createHmac("sha256", process.env.LINE_CHANNEL_SECRET!);
  h.update(raw);
  if (sig !== h.digest("base64")) return new Response("bad signature", { status: 400 });

  const { events } = JSON.parse(raw.toString("utf8") || "{}");

  for (const ev of events ?? []) {
    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    if (ev.source?.type !== "group") continue;

    const groupId: string = ev.source.groupId;
    const text = (ev.message.text as string).trim();

    // ---- help ----
    if (/^(help|ช่วยเหลือ)$/i.test(text)) {
      await reply(ev.replyToken, { type: "text", text: helpText(groupId) });
      continue;
    }

    // ---- add <title> | desc=... | due=YYYY-MM-DD ----
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

        // ensure group exists
        await sql/* sql */`
          insert into public.groups(id) values (${groupId})
          on conflict (id) do nothing`;

        // due at 00:00 Asia/Bangkok -> ISO
        const dueIso = due ? new Date(`${due}T00:00:00+07:00`).toISOString() : null;

        // generate 4-digit code unique per group (retry on conflict)
        const genCode4 = () => Math.floor(Math.random() * 10000).toString().padStart(4, "0");

        let code = genCode4();
        let created: any[] = [];
        for (let i = 0; i < 25; i++) {
          try {
            created = await sql/* sql */`
              insert into public.tasks (group_id, code, title, description, due_at)
              values (${groupId}, ${code}, ${title}, ${desc}, ${dueIso})
              returning code, title, due_at`;
            break;
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (msg.includes("tasks_group_code_uq") || msg.includes("duplicate key value")) {
              code = genCode4(); // retry new code
              continue;
            }
            throw e;
          }
        }
        if (!created.length) throw new Error("Cannot allocate 4-digit code");

        const r = created[0];
        await reply(ev.replyToken, {
          type: "text",
          text: `🆕 เพิ่มงานแล้ว\n• CODE: ${r.code}\n• เรื่อง: ${r.title}${r.due_at ? `\n• กำหนด: ${fmtDate(r.due_at)}` : ""}`
        });
      } catch (e: any) {
        console.error("ADD_ERR", e);
        await reply(ev.replyToken, { type: "text",
          text: "เพิ่มงานไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์ help เพื่อดูรูปแบบคำสั่ง" });
      }
      continue;
    }

    // ---- list / list today ----
    if (/^list(\s+today)?$/i.test(text) || /^รายการ/i.test(text)) {
      const onlyToday = /today/i.test(text);
      const rows = onlyToday
        ? await sql/* sql */`
            select code, title, status, due_at, progress
            from public.tasks
            where group_id=${groupId}
              and date(timezone('Asia/Bangkok', due_at)) = date(timezone('Asia/Bangkok', now()))
            order by coalesce(due_at, now()+interval '10 years') asc
            limit 50`
        : await sql/* sql */`
            select code, title, status, due_at, progress
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
        `\n   code=${r.code}  progress=${r.progress ?? 0}%`
      ).join("\n");

      await reply(ev.replyToken, {
        type: "text",
        text: `📋 รายการงาน${onlyToday ? " (วันนี้)" : ""}\n` + body
      });
      continue;
    }

// ---- progress <code> <เปอร์เซ็นต์ หรือ +10/-5> ----
if (text.toLowerCase().startsWith("progress ") || text.toLowerCase().startsWith("update ")
    || text.startsWith("เปอร์เซ็นต์ ")) {
  try {
    const parts = text.trim().split(/\s+/);           // ["progress","5532","+20"]
    const key   = parts[1];                            // code 4 หลัก หรือ UUID
    let val     = (parts[2] || "").replace(/%$/, "");  // ตัด % ท้ายถ้ามี

    if (!key || !val) {
      await reply(ev.replyToken, {
        type: "text",
        text: "ตัวอย่าง:\nprogress 1234 50\nprogress 1234 +10\nprogress 1234 -5"
      });
      continue;
    }

    // ดึงค่า progress ปัจจุบัน
    const found = await sql/* sql */`
      select id, code, progress, status
      from public.tasks
      where group_id=${groupId} and (code=${key} or id::text=${key})
      limit 1`;
    if (!found.length) {
      await reply(ev.replyToken, { type: "text", text: "ไม่พบน้ำงานที่ระบุ (ตรวจสอบ code อีกครั้ง)" });
      continue;
    }
    const t   = found[0];
    const cur = Number(t.progress ?? 0);

    // คำนวณค่าใหม่
    const isDelta = /^[+-]/.test(val);
    const n = parseInt(val, 10);
    let next = isDelta ? cur + n : n;
    if (Number.isNaN(next)) next = cur;
    next = Math.max(0, Math.min(100, next)); // 0..100

    const nextStatus =
      next >= 100 ? 'done'
      : (t.status === 'todo' && next > 0 ? 'in_progress' : t.status);

    // อัปเดตหลัก — ถ้าอัปเดตได้อย่างน้อย 1 แถวถือว่าสำเร็จ
    await sql/* sql */`
      update public.tasks
      set progress=${next},
          status=${nextStatus}::task_status,
          updated_at=now()
      where id=${t.id}`;

    // ตอบกลับ "สำเร็จ" ทันที
    await reply(ev.replyToken, {
      type: "text",
      text: `อัปเดตความคืบหน้า [${t.code}] ${cur}% → ${next}%${next===100 ? " ✅ (done)" : ""}`
    });

    // บันทึกประวัติ (ผิดพลาดได้โดยไม่กระทบผู้ใช้)
    try {
      await sql/* sql */`
        insert into public.task_updates (task_id, actor_id, note, progress, new_status)
        values (${t.id}, ${ev.source.userId ?? null}, 'progress update via chat', ${next}, ${nextStatus}::task_status)`;
    } catch (e) {
      console.error("LOG_FAIL", e);
    }
  } catch (e:any) {
    console.error("PROGRESS_ERR", e);
    await reply(ev.replyToken, { type: "text", text: "อัปเดตเปอร์เซ็นต์ไม่สำเร็จ" });
  }
  continue;
}
    // ---- done <code> (also accepts UUID) ----
    if (/^done\s+/i.test(text) || /^เสร็จ\s+/i.test(text)) {
      const key = text.replace(/^(done|เสร็จ)\s+/i, "").trim();
      if (!key) {
        await reply(ev.replyToken, { type: "text", text: "พิมพ์: done <code>\nเช่น: done 0123" });
        continue;
      }
      const updated = await sql/* sql */`
        update public.tasks
        set status='done', progress=100, updated_at=now()
        where group_id=${groupId}
          and (code=${key} or id::text=${key})
        returning code, title`;
      if (!updated.length) {
        await reply(ev.replyToken, { type: "text", text: "ไม่พบงานที่ระบุ (ตรวจสอบ code อีกครั้ง)" });
        continue;
      }
      await reply(ev.replyToken, { type: "text",
        text: `✅ ทำเสร็จแล้ว: ${updated[0].title}\n(code=${updated[0].code})` });
      continue;
    }

    // default
    await reply(ev.replyToken, { type: "text", text: helpText() });
  }

  return new Response("ok", { status: 200 });
}

// ===== utils =====
function fmtDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function helpText(gid?: string) {
  const lines = [
    "🧭 คำสั่งที่ใช้ได้:",
    "• add ชื่องาน | desc=รายละเอียด | due=YYYY-MM-DD",
    "• list — แสดงรายการงาน (มี code 4 หลัก)",
    "• list today — แสดงงานวันนี้",
    "• progress <code> <เปอร์เซ็นต์ หรือ +10/-5> — อัปเดตความคืบหน้า",
    "• done <code> — ปิดงานโดยใช้ code 4 หลัก",
    "• help — แสดงวิธีใช้งาน",
  ];
  if (gid) {
    lines.push("", `🆔 GROUP_ID: ${gid}`);
  }
  return lines.join("\n");
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
