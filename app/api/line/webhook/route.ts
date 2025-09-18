// app/api/line/webhook/route.ts
export const runtime = "nodejs";

import crypto from "crypto";
import { sql } from "../../../../lib/db";
import { createCalendarEvent } from "../../../../lib/gcal";

// ---------- CONFIG ----------
const TZ = "Asia/Bangkok";

// ---------- Healthcheck ----------
export async function GET() { return new Response("ok", { status: 200 }); }
export async function HEAD() { return new Response(null, { status: 200 }); }

// ---------- Helpers (AI intent & parsing) ----------
function hasScheduleKeyword(text: string) {
  return /ลงตาราง/i.test(text);
}

function extractEmails(text: string): string[] {
  const picked = new Set<string>();
  // email=someone@domain
  const p = /email\s*=\s*([^\s|,;]+)/i.exec(text)?.[1];
  if (p) picked.add(p);
  // อีเมลที่โผล่ในประโยค
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    picked.add(m[0]);
  }
  return Array.from(picked);
}

function extractTitle(raw: string) {
  let t = raw.replace(/^ai\s*/i, "").trim();
  t = t.replace(/^ลงตาราง\s*/i, "").trim();
  return t;
}

// คืนช่วงเวลา 60 นาที ถ้าตีความได้
function parseThaiDate(text: string): { startISO: string; endISO: string } | null {
  const now = new Date();
  const bkkNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));

  // พรุ่งนี้ HH โมง
  let m = text.match(/พรุ่งนี้\s*(\d{1,2})\s*โมง/i);
  if (m) {
    const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const start = new Date(bkkNow);
    start.setDate(start.getDate() + 1);
    start.setHours(hh, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }

  // <วันที่เดือนนี้> HH โมง  เช่น "27 10 โมง"
  m = text.match(/\b(\d{1,2})\s+(\d{1,2})\s*โมง\b/);
  if (m) {
    const dd = Math.max(1, Math.min(31, parseInt(m[1], 10)));
    const hh = Math.max(0, Math.min(23, parseInt(m[2], 10)));
    const y = bkkNow.getFullYear();
    const mo = bkkNow.getMonth(); // เดือนนี้
    // สร้างเวลาแบบไทยแล้วแปลงเป็น ISO
    const start = new Date(`${y}-${String(mo + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00:00+07:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }

  // รูปแบบชัดเจน: due=YYYY-MM-DD | time=HH:MM
  const due = /due=(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1];
  const tim = /time=(\d{1,2}):(\d{2})/i.exec(text);
  if (due) {
    const hh = tim ? Number(tim[1]) : 9;
    const mm = tim ? Number(tim[2]) : 0;
    const start = new Date(`${due}T${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:00+07:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }

  return null;
}

function fmtDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
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
    "• ai ลงตาราง <เรื่อง> พรุ่งนี้ 10 โมง | 27 10 โมง | due=YYYY-MM-DD time=HH:MM | email=a@b.com",
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

    // ---- AI Intent (ดักก่อน) ----
    if (/^ai\s+/i.test(text)) {
      try {
        const wantCalendar = hasScheduleKeyword(text);
        const emails = extractEmails(text);
        const when = parseThaiDate(text); // อาจได้หรือไม่ได้

        const titleRaw = extractTitle(text);
        const title = titleRaw
          .replace(/พรุ่งนี้\s*\d{1,2}\s*โมง/i, "")
          .replace(/\b\d{1,2}\s+\d{1,2}\s*โมง\b/, "")
          .replace(/due=\d{4}-\d{2}-\d{2}/i, "")
          .replace(/time=\d{1,2}:\d{2}/i, "")
          .replace(/email=[^\s|,;]+/i, "")
          .replace(/\s{2,}/g, " ")
          .trim() || "งานใหม่";

        // ensure group
        await sql/* sql */`
          insert into public.groups (id) values (${groupId})
          on conflict (id) do nothing`;

        // ถ้ามี "ลงตาราง" และตีความเวลาได้ → Calendar + Task
        if (wantCalendar && when) {
          const ins = await sql/* sql */`
            insert into public.tasks (group_id, code, title, description, due_at)
            values (
              ${groupId},
              lpad((floor(random()*10000))::text, 4, '0'),
              ${title},
              ${null},
              ${when.startISO}
            )
            returning code`;

          await createCalendarEvent({
            title,
            startISO: when.startISO,
            endISO: when.endISO,
            attendees: emails,
            description: `สร้างจาก LINE group ${groupId} / task code=${ins[0].code}`,
          });

          await reply(ev.replyToken, {
            type: "text",
            text: `📅 ลงตารางแล้ว\n• เรื่อง: ${title}\n• เวลา: ${fmtDate(when.startISO)} - ${fmtDate(when.endISO)}${emails.length ? `\n• เชิญ: ${emails.join(", ")}` : ""}`
          });
          continue;
        }

        // ไม่ลงตาราง → แค่สร้าง Task (มี due ถ้าตีความได้
        const dueISO = when?.startISO ?? null;
        let code = Math.floor(Math.random()*10000).toString().padStart(4,"0");
        let created: any[] = [];
        for (let i = 0; i < 25; i++) {
          try {
            created = await sql/* sql */`
              insert into public.tasks (group_id, code, title, description, due_at)
              values (${groupId}, ${code}, ${title}, ${null}, ${dueISO})
              returning code, title, due_at`;
            break;
          } catch (e:any) {
            const msg = String(e?.message ?? e);
            if (msg.includes("duplicate key")) { code = Math.floor(Math.random()*10000).toString().padStart(4,"0"); continue; }
            throw e;
          }
        }
        const r = created[0];
        await reply(ev.replyToken, {
          type: "text",
          text: `🆕 เพิ่มงานแล้ว\n• CODE: ${r.code}\n• เรื่อง: ${r.title}${r.due_at ? `\n• กำหนด: ${fmtDate(r.due_at)}` : ""}`
        });
      } catch (e:any) {
        console.error("AI_INTENT_ERR", e);
        await reply(ev.replyToken, { type: "text", text: "ดำเนินการไม่สำเร็จ ลองใหม่อีกครั้ง หรือระบุเวลาให้ชัดเจน" });
      }
      continue;
    }

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

    // ---- default ----
    await reply(ev.replyToken, { type: "text", text: helpText(groupId) });
  }

  return new Response("ok", { status: 200 });
}
