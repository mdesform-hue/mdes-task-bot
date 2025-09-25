// app/api/line/webhook/route.t
export const runtime = "nodejs";

import crypto from "crypto";
import { sql } from "../../../../lib/db";
import { createCalendarEvent } from "../../../../lib/gcal";
import { parseLineTextToJson } from "../../../../lib/ai_parser"; // 👈 เพิ่มการเรียก AI

// ---------- CONFIG ----------
const TZ = "Asia/Bangkok";

// ---------- Healthcheck ----------
export async function GET() { return new Response("ok", { status: 200 }); }
export async function HEAD() { return new Response(null, { status: 200 }); }

// ---------- Small helpers ----------
function fmtDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  }).format(dt);
}
function fmtThaiDateOnly(dateStr: string) {
  const dt = new Date(`${dateStr}T00:00:00+07:00`);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(dt);
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

function helpText(gid?: string) {
  const lines = [
    "🧭 คำสั่งที่ใช้ได้:",
    "• ai ลงตาราง <เรื่อง> วันนี้ 14:30 | พรุ่งนี้ 09.00 | วันศุกร์ 15.00 | 27 ทั้งวัน | due=YYYY-MM-DD [time=HH:MM] | email=a@b.com",
    "   - ถ้าไม่ใส่ 'ลงตาราง' จะสร้างเป็นงาน (Task) อย่างเดียว",
    "• add ชื่องาน | desc=รายละเอียด | due=YYYY-MM-DD",
    "• list — แสดงรายการงาน",
    "• list today — เฉพาะงานวันนี้",
    "• progress <code> <เปอร์เซ็นต์ หรือ +10/-5>",
    "• done <code> — ปิดงาน",
    "• help — วิธีใช้งาน",
  ];
  if (gid) lines.push("", `🆔 GROUP_ID: ${gid}`);
  return lines.join("\n");
}

// ---------- Webhook ----------
export async function POST(req: Request) {
  // verify LINE signature
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
          continue;
        }

        const title = (m[1] || "").trim();
        const desc  = m[2]?.trim() || null;
        const due   = m[3]?.trim() || null;

        if (!title) {
          await reply(ev.replyToken, { type: "text",
            text: "กรุณาระบุชื่อเรื่องงาน เช่น:\nadd เตรียมเอกสาร | desc=สำหรับประชุม | due=2025-09-01" });
          continue;
        }

        await sql/* sql */`
          insert into public.groups(id) values(${groupId})
          on conflict (id) do nothing`;

        const dueIso = due ? new Date(`${due}T00:00:00+07:00`).toISOString() : null;

        const genCode4 = () => Math.floor(Math.random() * 10000).toString().padStart(4, "0");
        let code = genCode4();
        let row: any;
        for (let i = 0; i < 25; i++) {
          try {
            const r = await sql/* sql */`
              insert into public.tasks (group_id, code, title, description, due_at)
              values (${groupId}, ${code}, ${title}, ${desc}, ${dueIso})
              returning code, title, due_at`;
            row = r[0]; break;
          } catch (e:any) {
            if (String(e?.message ?? e).includes("duplicate key")) { code = genCode4(); continue; }
            throw e;
          }
        }
        if (!row) throw new Error("Cannot allocate code");

        await reply(ev.replyToken, {
          type: "text",
          text: `🆕 เพิ่มงานแล้ว\n• CODE: ${row.code}\n• เรื่อง: ${row.title}${row.due_at ? `\n• กำหนด: ${fmtDate(row.due_at)}` : ""}`
        });
      } catch (e:any) {
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
              and date(timezone(${TZ}, due_at)) = date(timezone(${TZ}, now()))
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
        const parts = text.trim().split(/\s+/);
        const key   = parts[1];
        let val     = (parts[2] || "").replace(/%$/, "");

        if (!key || !val) {
          await reply(ev.replyToken, {
            type: "text",
            text: "ตัวอย่าง:\nprogress 1234 50\nprogress 1234 +10\nprogress 1234 -5"
          });
          continue;
        }

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

        const isDelta = /^[+-]/.test(val);
        const n = parseInt(val, 10);
        let next = isDelta ? cur + n : n;
        if (Number.isNaN(next)) next = cur;
        next = Math.max(0, Math.min(100, next));

        const nextStatus =
          next >= 100 ? 'done'
          : (t.status === 'todo' && next > 0 ? 'in_progress' : t.status);

        await sql/* sql */`
          update public.tasks
          set progress=${next},
              status=${nextStatus}::task_status,
              updated_at=now()
          where id=${t.id}`;

        await reply(ev.replyToken, {
          type: "text",
          text: `อัปเดตความคืบหน้า [${t.code}] ${cur}% → ${next}%${next===100 ? " ✅ (done)" : ""}`
        });

        try {
          await sql/* sql */`
            insert into public.task_updates (task_id, actor_id, note, progress, new_status)
            values (${t.id}, ${ev.source.userId ?? null}, 'progress update via chat', ${next}, ${nextStatus}::task_status)`;
        } catch (e) { console.error("LOG_FAIL", e); }
      } catch (e:any) {
        console.error("PROGRESS_ERR", e);
        await reply(ev.replyToken, { type: "text", text: "อัปเดตเปอร์เซ็นต์ไม่สำเร็จ" });
      }
      continue;
    }

    // ---- done <code> ----
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

    // ---- AI branch: ให้ AI วิเคราะห์ทุกอย่างเมื่อเริ่มด้วย "ai "
    if (/^ai\s+/i.test(text)) {
      try {
        // เรียก AI ให้แปลงข้อความเป็น JSON ตาม schema
        const parsed = await parseLineTextToJson(text);
        const intent = parsed?.intent ?? "none";
        const title  = (parsed?.title ?? "").trim() || "งานใหม่";
        const when   = parsed?.when ?? null;
        const emails = Array.isArray(parsed?.attendees) ? parsed.attendees : [];

        // ensure group
        await sql/* sql */`
          insert into public.groups (id) values (${groupId})
          on conflict (id) do nothing`;

        // ตอบ help
        if (intent === "help") {
          await reply(ev.replyToken, { type: "text", text: helpText(groupId) });
          continue;
        }

        // ลงตาราง (schedule)
        if (intent === "schedule") {
          if (!when) {
            await reply(ev.replyToken, {
              type: "text",
              text:
                "ขอเวลาให้ชัดเจนหน่อยครับ ⏰\nเช่น:\n" +
                "• ai ลงตาราง ทดสอบ วันนี้ 15:00\n" +
                "• ai ลงตาราง ประชุม พรุ่งนี้ 09.30\n" +
                "• ai ลงตาราง แจ้งข่าว due=2025-09-30 time=14:00"
            });
            continue;
          }

          // ป้องกันเวลาย้อนหลัง (เฉพาะ kind=timed)
          if (when.kind === "timed") {
            const now = new Date(); // ใช้ epoch ปัจจุบันเทียบกับ startISO ซึ่งเป็น UTC string
            const start = new Date(when.startISO);
            if (start.getTime() <= now.getTime()) {
              await reply(ev.replyToken, {
                type: "text",
                text:
                  "เวลาที่ระบุผ่านมาแล้วครับ ⏰\nลองใส่เวลาในอนาคต เช่น วันนี้ 15:00 หรือ พรุ่งนี้ 09:30"
              });
              continue;
            }
          }

          // เรียก Calendar + สร้าง Task
          let dueAtISO: string | null = null;
          let descNote = `สร้างจาก LINE group ${groupId}`;
          let calendarMsg = "";

          if (when.kind === "timed") {
            dueAtISO = when.startISO;
            calendarMsg = `• เวลา: ${fmtDate(when.startISO)} - ${fmtDate(when.endISO)}`;
            await createCalendarEvent({
              title,
              startISO: when.startISO,
              endISO: when.endISO,
              attendees: emails,
              description: `${descNote}`,
            } as any);
          } else {
            // allday
            dueAtISO = new Date(`${when.startDate}T00:00:00+07:00`).toISOString();
            descNote = `[ALL_DAY] ${descNote}`;
            calendarMsg = when.startDate === when.endDate
              ? `• เวลา: ทั้งวัน ${fmtThaiDateOnly(when.startDate)}`
              : `• เวลา: ทั้งวัน ${fmtThaiDateOnly(when.startDate)} - ${fmtThaiDateOnly(when.endDate)}`;
            await createCalendarEvent({
              title,
              allDay: true,
              startDate: when.startDate,
              endDate: when.endDate,
              attendees: emails,
              description: `${descNote}`,
            } as any);
          }

          const ins = await sql/* sql */`
            insert into public.tasks (group_id, code, title, description, due_at)
            values (
              ${groupId},
              lpad((floor(random()*10000))::text, 4, '0'),
              ${title},
              ${descNote},
              ${dueAtISO}
            )
            returning code`;

          await reply(ev.replyToken, {
            type: "text",
            text:
              `📅 ลงตารางแล้ว\n` +
              `• เรื่อง: ${title}\n` +
              `${calendarMsg}` +
              (emails.length ? `\n• เชิญ: ${emails.join(", ")}` : "") +
              `\n• code: ${ins[0].code}`
          });
          continue;
        }

        // เพิ่มงาน (add_task)
        if (intent === "add_task") {
          let dueISO: string | null = null;
          let descForTask: string | null = null;
          if (when?.kind === "timed") {
            dueISO = when.startISO;
          } else if (when?.kind === "allday") {
            dueISO = new Date(`${when.startDate}T00:00:00+07:00`).toISOString();
            descForTask = "[ALL_DAY]";
          }

          const genCode4 = () => Math.floor(Math.random()*10000).toString().padStart(4,"0");
          let code = genCode4();
          let created: any[] = [];
          for (let i = 0; i < 25; i++) {
            try {
              created = await sql/* sql */`
                insert into public.tasks (group_id, code, title, description, due_at)
                values (${groupId}, ${code}, ${title}, ${descForTask}, ${dueISO})
                returning code, title, due_at`;
              break;
            } catch (e:any) {
              if (String(e?.message ?? e).includes("duplicate key")) { code = genCode4(); continue; }
              throw e;
            }
          }
          const r = created[0];
          await reply(ev.replyToken, {
            type: "text",
            text: `🆕 เพิ่มงานแล้ว\n• CODE: ${r.code}\n• เรื่อง: ${r.title}${r.due_at ? `\n• กำหนด: ${fmtDate(r.due_at)}` : ""}${descForTask ? `\n• หมายเหตุ: ${descForTask}` : ""}`
          });
          continue;
        }

        // none → ไม่ตอบ (ตาม requirement เดิม)
        continue;
      } catch (e:any) {
        console.error("AI_INTENT_ERR", e);
        await reply(ev.replyToken, { type: "text", text:
          "ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์ help เพื่อดูตัวอย่างคำสั่ง" });
      }
      continue;
    }

    // ---- default ----
    // ไม่ตอบกลับสำหรับข้อความที่ไม่เข้ากับคำสั่งใด ๆ
    continue;
  }

  return new Response("ok", { status: 200 });
}
