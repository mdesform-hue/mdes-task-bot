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
  // ครอบคลุม "ลงตาราง", "ลงตาราง เวลา", "ลงตารางเวลา"
  return /(?:^|\s)ลงตาราง(?:\s*เวลา)?(?:\s|$)/i.test(text);
}

function extractEmails(text: string): string[] {
  const picked = new Set<string>();
  const p = /email\s*=\s*([^\s|,;]+)/i.exec(text)?.[1];
  if (p) picked.add(p);
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    picked.add(m[0]);
  }
  return Array.from(picked);
}

function extractTitle(raw: string) {
  let t = raw.replace(/^ai\s*/i, "").trim();
  // ลบ "ลงตาราง" + "ลงตารางเวลา" + ช่องว่างหลังคำสั่ง
  t = t.replace(/^ลงตาราง(?:\s*เวลา)?\s*/i, "").trim();

  // ตัดส่วนเวลา/วันที่ออกจาก title ให้เกลี้ยงขึ้น (ไม่พึ่ง \b กับไทย)
  t = t
    // วันนี้ + เวลา (รองรับ 14:30 / 14.30 / 14 โมง / 14 น.)
    .replace(/วันนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/gi, "")
    // พรุ่งนี้ + เวลา
    .replace(/พรุ่งนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/gi, "")
    // รูปแบบ "<วันที่เดือนนี้> HH[:.]MM?" เช่น "27 10.30" หรือ "27 10"
    .replace(/(^|\s)(\d{1,2})\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?(\s|$)/gi, " ")
    // "<วันที่เดือนนี้> ทั้งวัน"
    .replace(/(^|\s)(\d{1,2})\s*ทั้งวัน(\s|$)/gi, " ")
    // due=YYYY-MM-DD | time=HH:MM | คำทั่วไป
    .replace(/time=\d{1,2}[.:]\d{2}/i, "")
    .replace(/due=\d{4}-\d{2}-\d{2}/i, "")
    .replace(/\bemail=[^\s|,;]+/i, "")
    .replace(/พรุ่งนี้/gi, "")
    .replace(/วันนี้/gi, "")
    .replace(/ทั้งวัน/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return t || "งานใหม่";
}

type ParsedWhen =
  | { kind: "timed"; startISO: string; endISO: string }
  | { kind: "allday"; startDate: string; endDate: string };

// สร้าง Date ไทยง่าย ๆ
const pad2 = (n: number) => String(n).padStart(2, "0");
function bkkToday() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: TZ }));
}
function ymdFrom(date: Date) {
  return {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
  };
}
function isoStartAtThai(y: number, m: number, d: number, hh = 0, mm = 0) {
  return new Date(`${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+07:00`);
}

// คืนช่วงเวลา 60 นาที / หรือ all-day ถ้าตีความได้
function parseThaiDate(text: string): ParsedWhen | null {
  const base = bkkToday();
  const { y, m, d } = ymdFrom(base);

  // --- 1) TODAY / "วันนี้" ---
  // วันนี้ ทั้งวัน (ไม่พึ่ง \b)
  if (/(วันนี้.*ทั้งวัน|ทั้งวัน.*วันนี้)/i.test(text)) {
    const startDate = `${y}-${pad2(m)}-${pad2(d)}`;
    const end = new Date(base); end.setDate(end.getDate() + 1);
    const { y: y2, m: m2, d: d2 } = ymdFrom(end);
    const endDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
    return { kind: "allday", startDate, endDate };
  }
  // วันนี้ HH[:.|]MM? (ยอมรับไม่มีช่องว่าง/มีคำแทรกสั้น ๆ)
  let mTodayTime = text.match(/วันนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/i);
  if (mTodayTime) {
    const hh = Math.max(0, Math.min(23, parseInt(mTodayTime[1], 10)));
    const mm = mTodayTime[2] ? Math.max(0, Math.min(59, parseInt(mTodayTime[2], 10))) : 0;
    const start = isoStartAtThai(y, m, d, hh, mm);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { kind: "timed", startISO: start.toISOString(), endISO: end.toISOString() };
  }
  // แค่ "วันนี้" → all-day
  if (/วันนี้/i.test(text)) {
    const startDate = `${y}-${pad2(m)}-${pad2(d)}`;
    const end = new Date(base); end.setDate(end.getDate() + 1);
    const { y: y2, m: m2, d: d2 } = ymdFrom(end);
    const endDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
    return { kind: "allday", startDate, endDate };
  }

  // --- 2) "พรุ่งนี้" ---
  if (/(พรุ่งนี้.*ทั้งวัน|ทั้งวัน.*พรุ่งนี้)/i.test(text)) {
    const tmr = new Date(base); tmr.setDate(tmr.getDate() + 1);
    const { y: y1, m: m1, d: d1 } = ymdFrom(tmr);
    const startDate = `${y1}-${pad2(m1)}-${pad2(d1)}`;
    const end = new Date(tmr); end.setDate(end.getDate() + 1);
    const { y: y2, m: m2, d: d2 } = ymdFrom(end);
    const endDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
    return { kind: "allday", startDate, endDate };
  }
  let mTmr = text.match(/พรุ่งนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/i);
  if (mTmr) {
    const hh = Math.max(0, Math.min(23, parseInt(mTmr[1], 10)));
    const mm = mTmr[2] ? Math.max(0, Math.min(59, parseInt(mTmr[2], 10))) : 0;
    const tmr = new Date(base); tmr.setDate(tmr.getDate() + 1);
    const { y: y1, m: m1, d: d1 } = ymdFrom(tmr);
    const start = isoStartAtThai(y1, m1, d1, hh, mm);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { kind: "timed", startISO: start.toISOString(), endISO: end.toISOString() };
  }
  if (/พรุ่งนี้/i.test(text)) {
    const tmr = new Date(base); tmr.setDate(tmr.getDate() + 1);
    const { y: y1, m: m1, d: d1 } = ymdFrom(tmr);
    const startDate = `${y1}-${pad2(m1)}-${pad2(d1)}`;
    const end = new Date(tmr); end.setDate(end.getDate() + 1);
    const { y: y2, m: m2, d: d2 } = ymdFrom(end);
    const endDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
    return { kind: "allday", startDate, endDate };
  }

  // --- 3) "<วันที่เดือนนี้> เวลา HH[:.|]MM? (น.|โมง optional)" หรือ "<วันที่เดือนนี้> HH[:.|]MM?"
  let mDayTime = text.match(/(^|\s)(\d{1,2})\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?(\s|$)/);
  if (mDayTime) {
    const dd = Math.max(1, Math.min(31, parseInt(mDayTime[2], 10)));
    const hh = Math.max(0, Math.min(23, parseInt(mDayTime[3], 10)));
    const mm = mDayTime[4] ? Math.max(0, Math.min(59, parseInt(mDayTime[4], 10))) : 0;
    const start = isoStartAtThai(y, m, dd, hh, mm);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { kind: "timed", startISO: start.toISOString(), endISO: end.toISOString() };
  }
  // "<วันที่เดือนนี้> ทั้งวัน" เช่น "27 ทั้งวัน"
  let mDayAll = text.match(/(^|\s)(\d{1,2})\s*ทั้งวัน(\s|$)/);
  if (mDayAll) {
    const dd = Math.max(1, Math.min(31, parseInt(mDayAll[2], 10)));
    const startDate = `${y}-${pad2(m)}-${pad2(dd)}`;
    const endDateObj = new Date(isoStartAtThai(y, m, dd, 0, 0));
    endDateObj.setDate(endDateObj.getDate() + 1);
    const { y: y2, m: m2, d: d2 } = ymdFrom(new Date(endDateObj.toLocaleString("en-US", { timeZone: TZ })));
    const endDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
    return { kind: "allday", startDate, endDate };
  }

  // --- 4) due=YYYY-MM-DD | time=HH[:.|]MM ---
  const due = /due=(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1];
  const tim = /time=(\d{1,2})[:.](\d{2})/i.exec(text);
  if (due && tim) {
    const hh = Number(tim[1]), mm = Number(tim[2]);
    const start = new Date(`${due}T${pad2(hh)}:${pad2(mm)}:00+07:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { kind: "timed", startISO: start.toISOString(), endISO: end.toISOString() };
  } else if (due && !tim) {
    // ไม่มี time → ถือเป็น all-day
    const startDate = due;
    const endObj = new Date(`${due}T00:00:00+07:00`);
    endObj.setDate(endObj.getDate() + 1);
    const { y: y2, m: m2, d: d2 } = ymdFrom(new Date(endObj.toLocaleString("en-US", { timeZone: TZ })));
    const endDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
    return { kind: "allday", startDate, endDate };
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
function fmtThaiDateOnly(dateStr: string) {
  // dateStr = YYYY-MM-DD
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
    "• ai ลงตาราง <เรื่อง> วันนี้ | วันนี้ 14.30 | พรุ่งนี้ 10 โมง | 27 10 โมง | 27 10.30 | 27 ทั้งวัน | due=YYYY-MM-DD [time=HH:MM] | email=a@b.com",
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
        const when = parseThaiDate(text); // อาจคืน timed หรือ allday หรือ null

        const title = extractTitle(text);

        // ensure group
        await sql/* sql */`
          insert into public.groups (id) values (${groupId})
          on conflict (id) do nothing`;

        // ---- ถ้าสั่ง "ลงตาราง" แต่ parse เวลาไม่ได้ → แจ้งให้ระบุเวลา ----
        if (wantCalendar && !when) {
          await reply(ev.replyToken, {
            type: "text",
            text: "ขอเวลาให้ชัดเจนหน่อยครับ เช่น:\nai ลงตาราง ทดสอบ วันนี้ 14:00\nai ลงตาราง ประชุม due=2025-09-30 time=14.00"
          });
          continue;
        }

        // ---- ลง Calendar + Task (เมื่อ wantCalendar && when) ----
        if (wantCalendar && when) {
          let dueAtISO: string | null = null;
          let descNote = `สร้างจาก LINE group ${groupId}`;
          let calendarMsg = "";

          if (when.kind === "timed") {
            // ป้องกันเวลาย้อนหลัง → แจ้งผู้ใช้ให้ใส่เวลาใหม่ (ไม่เลื่อนอัตโนมัติ)
            const nowBkk = bkkToday();
            const start = new Date(when.startISO);

            if (start.getTime() <= nowBkk.getTime()) {
              await reply(ev.replyToken, {
                type: "text",
                text:
                  "เวลาที่ระบุผ่านมาแล้วครับ ⏰\n" +
                  "ลองใส่เวลาในอนาคต เช่น:\n" +
                  "• ai ลงตาราง ทดสอบ วันนี้ 15:00\n" +
                  "• ai ลงตาราง ประชุม พรุ่งนี้ 09:30\n" +
                  "• ai ลงตาราง แจ้งข่าว due=2025-09-30 time=14.00"
              });
              continue;
            }

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
            // all-day: ใช้ต้นวันเป็น due_at ไว้เรียง/list และใส่ note
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

        // ---- ไม่ลงตาราง → แค่สร้าง Task (มี due ถ้าตีความได้) ----
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
            const msg = String(e?.message ?? e);
            if (msg.includes("duplicate key")) { code = genCode4(); continue; }
            throw e;
          }
        }
        const r = created[0];
        await reply(ev.replyToken, {
          type: "text",
          text: `🆕 เพิ่มงานแล้ว\n• CODE: ${r.code}\n• เรื่อง: ${r.title}${r.due_at ? `\n• กำหนด: ${fmtDate(r.due_at)}` : ""}${descForTask ? `\n• หมายเหตุ: ${descForTask}` : ""}`
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
    // ไม่ตอบกลับ (ปล่อยผ่าน) สำหรับข้อความที่ไม่เข้ากับคำสั่งใด ๆ
    continue;
  }

  return new Response("ok", { status: 200 });
}
