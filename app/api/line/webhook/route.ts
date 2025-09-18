// app/api/line/webhook/route.ts
export const runtime = "nodejs";

import crypto from "crypto";
import { google } from "googleapis";
import { sql } from "../../../../lib/db";

// ---------------------------------------------------------------------------
// TIME HELPERS (โซนไทย, ไม่ใช้ toISOString)
// ---------------------------------------------------------------------------
const TZ = "Asia/Bangkok";
const pad = (n: number) => String(n).padStart(2, "0");

// คืนค่าสตริง RFC3339 ที่ผูกออฟเซ็ต +07:00 เช่น 2025-09-19T10:00:00+07:00
function rfcBkk(y: number, m: number, d: number, hh = 0, mm = 0) {
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+07:00`;
}

// บวกนาที โดยยึดเวลาไทย (เลี่ยงการแปลงเป็น UTC/ISO)
function addMinutesBkk(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  plus: number
) {
  // สร้าง epoch โดยสมมติว่าเวลาอินพุตคือ +07:00 (ลบ 7 ชม. ตอนแปลงเป็น UTC)
  const utc = Date.UTC(y, m - 1, d, hh - 7, mm) + plus * 60_000;
  // กลับมาอ่านส่วนประกอบวัน/เวลาในโซนไทย (บวก 7 ชม.)
  const t = new Date(utc + 7 * 60 * 60 * 1000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
  };
}

// ฟอร์แมตเวลาไทยเพื่อแสดงผลในข้อความตอบกลับ
function fmtBkk(dt: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dt));
}

// ---------------------------------------------------------------------------
// Google Calendar (Service Account)
// ---------------------------------------------------------------------------
function getGoogleAuth() {
  const clientEmail = process.env.GOOGLE_SERVICE_EMAIL || "";
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
  // รองรับคีย์ที่เก็บมาเป็นบรรทัดเดียว (มี \n) ให้แปลงกลับเป็นบรรทัดจริง
  privateKey = privateKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}
function getCalendar() {
  return google.calendar({ version: "v3", auth: getGoogleAuth() });
}

// ---------------------------------------------------------------------------
// LINE util
// ---------------------------------------------------------------------------
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
    "• ai ลงตาราง <เรื่อง> พรุ่งนี้ | 27 10 โมง | due=YYYY-MM-DD time=HH:MM | email=a@b.com",
    "  - ถ้าไม่ใส่ 'ลงตาราง' จะสร้างเป็นงาน (Task) อย่างเดียว",
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

function fmtDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

// ดึงอีเมลทั้งหมดจากข้อความ (แบบไม่ใช้ matchAll เพื่อรองรับ target ต่ำ)
function extractEmails(text: string): string[] {
  const picked = new Set<string>();
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    picked.add(m[0]);
  }
  return Array.from(picked);
}

// ---------------------------------------------------------------------------
// Healthcheck
// ---------------------------------------------------------------------------
export async function GET() {
  return new Response("ok", { status: 200 });
}
export async function HEAD() {
  return new Response(null, { status: 200 });
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  // verify LINE signature
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

    // help
    if (/^(help|ช่วยเหลือ)$/i.test(text)) {
      await reply(ev.replyToken, { type: "text", text: helpText(groupId) });
      continue;
    }

    // -----------------------------------------------------------------------
    // AI mode: ถ้ามี "ai" นำหน้า
    // - ถ้าข้อความมีคำว่า "ลงตาราง" → สร้าง Google Calendar + บันทึก task
    // - ถ้าไม่มีคำว่า "ลงตาราง" → บันทึก task อย่างเดียว
    // ตัวอย่าง:  ai ลงตาราง ส่งใบเสนอราคา พรุ่งนี้ 10 โมง
    //           ai ลงตาราง ส่งของ 27 10 โมง
    //           ai เตรียมเอกสาร พรุ่งนี้ 9 โมง
    // -----------------------------------------------------------------------
    if (/^ai\s+/i.test(text)) {
      const lower = text.toLowerCase();
      const wantCalendar = lower.includes("ลงตาราง");

      // แยก title อย่างง่าย: ตัดคำว่า "ai" และ "ลงตาราง" ออก
      let title = text.replace(/^ai\s+/i, "");
      title = title.replace(/^ลงตาราง\s*/i, "").trim();

      // หาเวลา: รองรับ "พรุ่งนี้ HH โมง" | "วันนี้ HH โมง" | "27 10 โมง" | due= | time=
      const now = new Date();
      // เวลาไทย
      const todayBkk = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours() + 7,
          now.getUTCMinutes()
        )
      );
      let y = todayBkk.getUTCFullYear();
      let m = todayBkk.getUTCMonth() + 1;
      let d = todayBkk.getUTCDate();
      let hh = 9;
      let mm = 0;

      // parse due=YYYY-MM-DD
      const dueMatch = text.match(/\bdue=(\d{4})-(\d{2})-(\d{2})\b/i);
      if (dueMatch) {
        y = parseInt(dueMatch[1], 10);
        m = parseInt(dueMatch[2], 10);
        d = parseInt(dueMatch[3], 10);
      }

      // parse time=HH:MM
      const timeMatch = text.match(/\btime=(\d{1,2}):(\d{2})\b/i);
      if (timeMatch) {
        hh = parseInt(timeMatch[1], 10);
        mm = parseInt(timeMatch[2], 10);
      }

      // "พรุ่งนี้ 10 โมง" | "วันนี้ 14 โมง"
      const rxDayHour = /(วันนี้|พรุ่งนี้)\s*(\d{1,2})\s*โมง/;
      const dh = text.match(rxDayHour);
      if (dh) {
        const word = dh[1];
        const hour = parseInt(dh[2], 10);
        if (word === "พรุ่งนี้") {
          // +1 วัน (เวลาไทย)
          const add1 = addMinutesBkk(y, m, d, 0, 0, 24 * 60);
          y = add1.y;
          m = add1.m;
          d = add1.d;
        }
        hh = hour;
        mm = 0;
      }

      // "27 10 โมง" (27 ของเดือนนี้)
      const rxDomHour = /\b(\d{1,2})\s+(\d{1,2})\s*โมง/;
      const dm = text.match(rxDomHour);
      if (dm) {
        d = parseInt(dm[1], 10);
        hh = parseInt(dm[2], 10);
        // เดือนไม่ระบุ → ใช้เดือนนี้ (ถ้าเลยไปแล้วค่อยข้ามเดือนเองได้ตามต้องการ)
      }

      // ถ้า title ว่างมาก ให้ fallback
      if (!title || /^ลงตาราง$/i.test(title)) title = "งานใหม่";

      // ดึง emails (ถ้ามี)
      const emails = extractEmails(text);

      // สร้าง task เสมอ (AI โหมดต้องมีใน DB)
      try {
        await sql/* sql */`
          insert into public.groups(id) values(${groupId})
          on conflict (id) do nothing`;
        // สุ่ม code 4 หลักแบบ unique ต่อ group
        const gen4 = () =>
          Math.floor(Math.random() * 10000).toString().padStart(4, "0");
        let code = gen4();
        let created: any[] = [];
        for (let i = 0; i < 25; i++) {
          try {
            created = await sql/* sql */`
              insert into public.tasks(group_id, code, title, description, due_at)
              values (${groupId}, ${code}, ${title}, null, ${
              rfcBkk(y, m, d, hh, mm)
            })
              returning id, code, title, due_at`;
            break;
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (msg.includes("duplicate key")) {
              code = gen4();
              continue;
            }
            throw e;
          }
        }

        // ถ้าขอ "ลงตาราง" → ยิง Google Calendar ด้วยเวลาไทย
        if (wantCalendar) {
          const startStr = rfcBkk(y, m, d, hh, mm);
          const duration =
            Number(process.env.DEFAULT_EVENT_DURATION_MIN ?? "60") || 60;
          const endParts = addMinutesBkk(y, m, d, hh, mm, duration);
          const endStr = rfcBkk(
            endParts.y,
            endParts.m,
            endParts.d,
            endParts.hh,
            endParts.mm
          );

          try {
            const calendar = getCalendar();
            await calendar.events.insert({
              calendarId: "primary", // ถ้าใช้ SA เข้าปฏิทินเฉพาะที่แชร์สิทธิ์ให้ Service Account
              requestBody: {
                summary: title,
                start: { dateTime: startStr, timeZone: TZ },
                end: { dateTime: endStr, timeZone: TZ },
                attendees: emails.map((e) => ({ email: e })),
              },
            });

            await reply(ev.replyToken, {
              type: "text",
              text:
                "📅 ลงตารางแล้ว\n" +
                `• เรื่อง: ${title}\n` +
                `• เวลา: ${fmtBkk(startStr)} - ${fmtBkk(endStr)}`,
            });
          } catch (e: any) {
            console.error("CALENDAR_ERR", e);
            await reply(ev.replyToken, {
              type: "text",
              text:
                "สร้าง Task สำเร็จ แต่ลง Calendar ไม่สำเร็จ\n" +
                "ตรวจสิทธิ์แชร์ปฏิทินให้ Service Account และค่า ENV อีกครั้ง",
            });
          }
        } else {
          // แค่ task
          const r = created[0];
          await reply(ev.replyToken, {
            type: "text",
            text:
              `🆕 เพิ่มงานแล้ว\n• CODE: ${r.code}\n• เรื่อง: ${r.title}` +
              (r.due_at ? `\n• กำหนด: ${fmtDate(r.due_at)}` : ""),
          });
        }
      } catch (e: any) {
        console.error("AI_TASK_ERR", e);
        await reply(ev.replyToken, {
          type: "text",
          text: "เพิ่มงาน (AI) ไม่สำเร็จ กรุณาลองใหม่ หรือพิมพ์ help",
        });
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // add <title> | desc=... | due=YYYY-MM-DD
    // -----------------------------------------------------------------------
    if (/^add\s+/i.test(text) || /^เพิ่ม\s+/i.test(text)) {
      try {
        const m = text
          .replace(/^(add|เพิ่ม)\s+/i, "")
          .match(
            /^(.*?)(?:\s*\|\s*desc=(.*?))?(?:\s*\|\s*due=(\d{4}-\d{2}-\d{2}))?\s*$/
          );

        if (!m) {
          await reply(ev.replyToken, {
            type: "text",
            text:
              "รูปแบบไม่ถูกต้อง\nตัวอย่าง:\nadd ชื่องาน | desc=รายละเอียด | due=2025-09-01",
          });
          continue;
        }

        const title = (m[1] || "").trim();
        const desc = m[2]?.trim() || null;
        const due = m[3]?.trim() || null;

        if (!title) {
          await reply(ev.replyToken, {
            type: "text",
            text:
              "กรุณาระบุชื่อเรื่องงาน เช่น:\nadd เตรียมเอกสาร | desc=สำหรับประชุม | due=2025-09-01",
          });
          continue;
        }

        await sql/* sql */`
          insert into public.groups(id) values (${groupId})
          on conflict (id) do nothing`;

        // ถ้ามี due= ใช้ 00:00 โซนไทย → RFC +07:00
        let dueIso: string | null = null;
        if (due) {
          const [yy, mm, dd] = due.split("-").map((n) => parseInt(n, 10));
          dueIso = rfcBkk(yy, mm, dd, 0, 0);
        }

        const gen4 = () =>
          Math.floor(Math.random() * 10000).toString().padStart(4, "0");

        let code = gen4();
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
            if (msg.includes("duplicate key")) {
              code = gen4();
              continue;
            }
            throw e;
          }
        }
        const r = created[0];
        await reply(ev.replyToken, {
          type: "text",
          text:
            `🆕 เพิ่มงานแล้ว\n• CODE: ${r.code}\n• เรื่อง: ${r.title}` +
            (r.due_at ? `\n• กำหนด: ${fmtDate(r.due_at)}` : ""),
        });
      } catch (e: any) {
        console.error("ADD_ERR", e);
        await reply(ev.replyToken, {
          type: "text",
          text: "เพิ่มงานไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์ help เพื่อดูรูปแบบคำสั่ง",
        });
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // list / list today
    // -----------------------------------------------------------------------
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
        await reply(ev.replyToken, {
          type: "text",
          text: onlyToday ? "วันนี้ยังไม่มีงาน" : "ยังไม่มีงานในกลุ่มครับ",
        });
        continue;
      }

      const body = rows
        .map(
          (r: any, i: number) =>
            `${i + 1}. [${r.status ?? "todo"}] ${r.title}` +
            (r.due_at ? `  (due: ${fmtDate(r.due_at)})` : "") +
            `\n   code=${r.code}  progress=${r.progress ?? 0}%`
        )
        .join("\n");

      await reply(ev.replyToken, {
        type: "text",
        text: `📋 รายการงาน${onlyToday ? " (วันนี้)" : ""}\n` + body,
      });
      continue;
    }

    // -----------------------------------------------------------------------
    // progress <code> <เปอร์เซ็นต์ หรือ +10/-5>
    // -----------------------------------------------------------------------
    if (
      text.toLowerCase().startsWith("progress ") ||
      text.toLowerCase().startsWith("update ") ||
      text.startsWith("เปอร์เซ็นต์ ")
    ) {
      try {
        const parts = text.trim().split(/\s+/);
        const key = parts[1]; // code 4 หลัก หรือ UUID
        let val = (parts[2] || "").replace(/%$/, "");

        if (!key || !val) {
          await reply(ev.replyToken, {
            type: "text",
            text:
              "ตัวอย่าง:\nprogress 1234 50\nprogress 1234 +10\nprogress 1234 -5",
          });
          continue;
        }

        const found = await sql/* sql */`
          select id, code, progress, status
          from public.tasks
          where group_id=${groupId} and (code=${key} or id::text=${key})
          limit 1`;
        if (!found.length) {
          await reply(ev.replyToken, {
            type: "text",
            text: "ไม่พบน้ำงานที่ระบุ (ตรวจสอบ code อีกครั้ง)",
          });
          continue;
        }
        const t = found[0];
        const cur = Number(t.progress ?? 0);

        const isDelta = /^[+-]/.test(val);
        const n = parseInt(val, 10);
        let next = isDelta ? cur + n : n;
        if (Number.isNaN(next)) next = cur;
        next = Math.max(0, Math.min(100, next));

        const nextStatus =
          next >= 100
            ? "done"
            : t.status === "todo" && next > 0
            ? "in_progress"
            : t.status;

        await sql/* sql */`
          update public.tasks
          set progress=${next},
              status=${nextStatus}::task_status,
              updated_at=now()
          where id=${t.id}`;

        await reply(ev.replyToken, {
          type: "text",
          text: `อัปเดตความคืบหน้า [${t.code}] ${cur}% → ${next}%${
            next === 100 ? " ✅ (done)" : ""
          }`,
        });

        try {
          await sql/* sql */`
            insert into public.task_updates (task_id, actor_id, note, progress, new_status)
            values (${t.id}, ${ev.source.userId ?? null}, 'progress update via chat', ${next}, ${nextStatus}::task_status)`;
        } catch (e) {
          console.error("LOG_FAIL", e);
        }
      } catch (e: any) {
        console.error("PROGRESS_ERR", e);
        await reply(ev.replyToken, {
          type: "text",
          text: "อัปเดตเปอร์เซ็นต์ไม่สำเร็จ",
        });
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // done <code>
    // -----------------------------------------------------------------------
    if (/^done\s+/i.test(text) || /^เสร็จ\s+/i.test(text)) {
      const key = text.replace(/^(done|เสร็จ)\s+/i, "").trim();
      if (!key) {
        await reply(ev.replyToken, {
          type: "text",
          text: "พิมพ์: done <code>\nเช่น: done 0123",
        });
        continue;
      }
      const updated = await sql/* sql */`
        update public.tasks
        set status='done', progress=100, updated_at=now()
        where group_id=${groupId}
          and (code=${key} or id::text=${key})
        returning code, title`;
      if (!updated.length) {
        await reply(ev.replyToken, {
          type: "text",
          text: "ไม่พบงานที่ระบุ (ตรวจสอบ code อีกครั้ง)",
        });
        continue;
      }
      await reply(ev.replyToken, {
        type: "text",
        text: `✅ ทำเสร็จแล้ว: ${updated[0].title}\n(code=${updated[0].code})`,
      });
      continue;
    }

    // default → help
    await reply(ev.replyToken, { type: "text", text: helpText(groupId) });
  }

  return new Response("ok", { status: 200 });
}
