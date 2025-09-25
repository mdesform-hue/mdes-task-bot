// lib/ai_parser.ts
// ใช้กับ openai@^5 (Responses API)
// - เรียก AI ด้วย responses.parse() (structured output)
// - ถ้า AI error หรือไม่มี OPENAI_API_KEY → fallback parser (regex) ทำงานทันที
// - รองรับรูปแบบ: วันนี้ 15.00 | พรุ่งนี้ 09:30 | วันศุกร์ 15.00 | ศุกร์ที่ 26 15.00 | 27 10.30 | 27 ทั้งวัน
//   รวมถึง due=YYYY-MM-DD [time=HH:MM|HH.MM] และ email=a@b.com
// - ไทม์โซน Asia/Bangkok (+07:00)

import OpenAI from "openai";

const TZ = "Asia/Bangkok";
const apiKey = process.env.OPENAI_API_KEY;

// -------- Types ที่ฝั่ง route.ts ใช้ --------
export type ParsedWhen =
  | { kind: "timed"; startISO: string; endISO: string }
  | { kind: "allday"; startDate: string; endDate: string };

export interface ParsedAIResult {
  intent: "schedule" | "add_task" | "help" | "none";
  title: string;
  when?: ParsedWhen | null;
  attendees?: string[];
  notes?: string;
}

// -------- OpenAI client (ถ้ามีคีย์) --------
let client: OpenAI | null = null;
if (apiKey) client = new OpenAI({ apiKey });

// -------- Utils เวลาไทย --------
const pad2 = (n: number) => String(n).padStart(2, "0");

function nowBkk(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}
function toISOAtBkk(y: number, m: number, d: number, hh = 0, mm = 0): string {
  const s = `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+07:00`;
  return new Date(s).toISOString();
}
function addMinutesISO(iso: string, mins: number): string {
  const t = new Date(iso).getTime() + mins * 60 * 1000;
  return new Date(t).toISOString();
}
function ymd(date: Date) {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}
function endDateFromStartDate(startDate: string): string {
  const e = new Date(`${startDate}T00:00:00+07:00`);
  e.setDate(e.getDate() + 1);
  return `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`;
}

const WEEKIDX: Record<string, number> = {
  "อาทิตย์": 0, "จันทร์": 1, "อังคาร": 2, "พุธ": 3, "พฤหัส": 4,
  "พฤหัสบดี": 4, "ศุกร์": 5, "เสาร์": 6
};

function nextWeekday(base: Date, targetDow: number) {
  const d = new Date(base);
  const add = (targetDow - d.getDay() + 7) % 7 || 7; // ถ้าวันเดียวกัน → ข้ามไปสัปดาห์ถัดไป
  d.setDate(d.getDate() + add);
  return d;
}

// หา "วันที่ = day" ที่ "weekday = targetDow" ในอนาคตจาก base (ลองสูงสุด 24 เดือน)
function resolveExplicitWeekdayAndDay(base: Date, targetDow: number, day: number) {
  let y = base.getFullYear();
  let m = base.getMonth() + 1; // 1..12
  const baseMid = new Date(`${y}-${pad2(m)}-${pad2(base.getDate())}T00:00:00+07:00`).getTime();

  for (let i = 0; i < 24; i++) {
    const candidate = new Date(`${y}-${pad2(m)}-${pad2(day)}T00:00:00+07:00`);
    if (candidate.getTime() >= baseMid && candidate.getDay() === targetDow) {
      return candidate;
    }
    // ไปเดือนถัดไป
    if (m === 12) { y += 1; m = 1; } else { m += 1; }
  }
  // สำรอง (แทบไม่เกิด)
  return new Date(`${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(day)}T00:00:00+07:00`);
}

// -------- อีเมล fallback --------
function extractEmails(text: string): string[] {
  const picked = new Set<string>();
  const p = /email\s*=\s*([^\s|,;]+)/i.exec(text)?.[1];
  if (p) picked.add(p);
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) picked.add(m[0]);
  return Array.from(picked);
}

// -------- Fallback Parser (regex) --------
function localFallbackParse(inputText: string): ParsedAIResult {
  const text = inputText.trim();
  const wantSchedule = /(?:^|\s)ลงตาราง(?:\s*เวลา)?(?:\s|$)/i.test(text);
  const help = /^(help|ช่วยเหลือ)$/i.test(text);
  const emails = extractEmails(text);
  const base = nowBkk();
  const { y, m, d } = ymd(base);

  let when: ParsedWhen | null = null;

  // 0) วันในสัปดาห์ + (ที่)? + วันที่ + (เวลา)? — เช่น "ศุกร์ที่ 26 15.00", "วันศุกร์ 26 9:30"
  if (!when) {
    const mwx = text.match(
      /(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์)(?:\s*ที่)?(?:\s+(\d{1,2}))?(?:\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?)?/i
    );
    if (mwx) {
      const dowName = mwx[1];
      const ddGiven = mwx[2] ? Math.max(1, Math.min(31, parseInt(mwx[2], 10))) : null;
      const hhGiven = mwx[3] ? Math.max(0, Math.min(23, parseInt(mwx[3], 10))) : null;
      const mmGiven = mwx[4] ? Math.max(0, Math.min(59, parseInt(mwx[4], 10))) : 0;
      const dow = WEEKIDX[dowName];

      if (ddGiven !== null) {
        // ✅ หาอนาคตที่เป็น "วันที่ ddGiven" และ "ตรงกับวันในสัปดาห์ dow"
        const target = resolveExplicitWeekdayAndDay(base, dow, ddGiven);
        const { y: ty, m: tm, d: td } = ymd(target);
        if (hhGiven !== null) {
          const startISO = toISOAtBkk(ty, tm, td, hhGiven, mmGiven);
          const endISO = addMinutesISO(startISO, 60);
          when = { kind: "timed", startISO, endISO };
        } else {
          const startDate = `${ty}-${pad2(tm)}-${pad2(td)}`;
          const endDate = endDateFromStartDate(startDate);
          when = { kind: "allday", startDate, endDate };
        }
      } else {
        // ไม่มีเลขวันที่ → ใช้ "วันนั้นในสัปดาห์ถัดไป"
        const dayObj = nextWeekday(base, dow);
        const { y: y2, m: m2, d: d2 } = ymd(dayObj);
        if (hhGiven !== null) {
          const startISO = toISOAtBkk(y2, m2, d2, hhGiven, mmGiven);
          const endISO = addMinutesISO(startISO, 60);
          when = { kind: "timed", startISO, endISO };
        } else {
          const startDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
          const endDate = endDateFromStartDate(startDate);
          when = { kind: "allday", startDate, endDate };
        }
      }
    }
  }

  // 1) วันนี้ HH(.|:)MM? | วันนี้ HH โมง | วันนี้ ทั้งวัน
  if (!when) {
    const mt = text.match(/วันนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/i);
    if (mt) {
      const hh = Math.max(0, Math.min(23, parseInt(mt[1], 10)));
      const mm = mt[2] ? Math.max(0, Math.min(59, parseInt(mt[2], 10))) : 0;
      const startISO = toISOAtBkk(y, m, d, hh, mm);
      const endISO = addMinutesISO(startISO, 60);
      when = { kind: "timed", startISO, endISO };
    } else if (/วันนี้/i.test(text)) {
      const startDate = `${y}-${pad2(m)}-${pad2(d)}`;
      const endDate = endDateFromStartDate(startDate);
      when = { kind: "allday", startDate, endDate };
    }
  }

  // 2) พรุ่งนี้ HH(.|:)MM? | พรุ่งนี้ ทั้งวัน
  if (!when) {
    const mt2 = text.match(/พรุ่งนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/i);
    if (mt2) {
      const tmr = new Date(base); tmr.setDate(tmr.getDate() + 1);
      const { y: y1, m: m1, d: d1 } = ymd(tmr);
      const hh = Math.max(0, Math.min(23, parseInt(mt2[1], 10)));
      const mm = mt2[2] ? Math.max(0, Math.min(59, parseInt(mt2[2], 10))) : 0;
      const startISO = toISOAtBkk(y1, m1, d1, hh, mm);
      const endISO = addMinutesISO(startISO, 60);
      when = { kind: "timed", startISO, endISO };
    } else if (/พรุ่งนี้/i.test(text)) {
      const tmr = new Date(base); tmr.setDate(tmr.getDate() + 1);
      const { y: y1, m: m1, d: d1 } = ymd(tmr);
      const startDate = `${y1}-${pad2(m1)}-${pad2(d1)}`;
      const endDate = endDateFromStartDate(startDate);
      when = { kind: "allday", startDate, endDate };
    }
  }

  // 3) "<วันที่เดือนนี้> HH(.|:)MM?" เช่น "27 15.00" | "<วันที่เดือนนี้> ทั้งวัน"
  if (!when) {
    const md = text.match(/(^|\s)(\d{1,2})\s+(\d{1,2})(?:[:.](\d{2}))?(\s|$)/);
    if (md) {
      const dd = Math.max(1, Math.min(31, parseInt(md[2], 10)));
      const hh = Math.max(0, Math.min(23, parseInt(md[3], 10)));
      const mm = md[4] ? Math.max(0, Math.min(59, parseInt(md[4], 10))) : 0;
      const startISO = toISOAtBkk(y, m, dd, hh, mm);
      const endISO = addMinutesISO(startISO, 60);
      when = { kind: "timed", startISO, endISO };
    } else {
      const mdAll = text.match(/(^|\s)(\d{1,2})\s*ทั้งวัน(\s|$)/);
      if (mdAll) {
        const dd = Math.max(1, Math.min(31, parseInt(mdAll[2], 10)));
        const startDate = `${y}-${pad2(m)}-${pad2(dd)}`;
        const endDate = endDateFromStartDate(startDate);
        when = { kind: "allday", startDate, endDate };
      }
    }
  }

  // 4) due=YYYY-MM-DD [time=HH(:|.)MM]
  if (!when) {
    const due = /due=(\d{4}-\d{2}-\d{2})/i.exec(text)?.[1];
    const tim = /time=(\d{1,2})(?:[:.](\d{2}))?/i.exec(text);
    if (due && tim) {
      const hh = Math.max(0, Math.min(23, parseInt(tim[1], 10)));
      const mm = tim[2] ? Math.max(0, Math.min(59, parseInt(tim[2], 10))) : 0;
      const [yy, mm2, dd] = due.split("-").map(Number);
      const startISO = toISOAtBkk(yy, mm2, dd, hh, mm);
      const endISO = addMinutesISO(startISO, 60);
      when = { kind: "timed", startISO, endISO };
    } else if (due) {
      const startDate = due;
      const endDate = endDateFromStartDate(startDate);
      when = { kind: "allday", startDate, endDate };
    }
  }

  // ทำความสะอาด title: ลบ prefix/คำเวลา/วัน/ที่/วันที่/รูปแบบ due/time/email ออก
  let title = text
    .replace(/^ai\s*/i, "")
    .replace(/(?:^|\s)ลงตาราง(?:\s*เวลา)?\s*/i, " ")
    .replace(/(?:วัน)?(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์)(?:\s*ที่)?/gi, " ")
    .replace(/\bวันนี้\b/gi, " ")
    .replace(/\bพรุ่งนี้\b/gi, " ")
    .replace(/(^|\s)(\d{1,2})\s+(\d{1,2})(?:[:.](\d{2}))?(\s|$)/g, " ")
    .replace(/(^|\s)(\d{1,2})\s*ทั้งวัน(\s|$)/g, " ")
    .replace(/\bdue=\d{4}-\d{2}-\d{2}\b/gi, " ")
    .replace(/\btime=\d{1,2}(?:[:.]\d{2})?\b/gi, " ")
    .replace(/\bemail=[^\s|,;]+\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!title) title = "งานใหม่";

  const intent: ParsedAIResult["intent"] =
    help ? "help" : (wantSchedule ? "schedule" : "add_task");

  return {
    intent,
    title,
    when: when ?? null,
    attendees: emails,
    notes: "fallback_local"
  };
}

// -------- main: parse ด้วย AI; ถ้า error → fallback --------
export async function parseLineTextToJson(inputText: string): Promise<ParsedAIResult> {
  // ไม่มีคีย์ → fallback ทันที
  if (!client) {
    const out = localFallbackParse(inputText);
    out.notes = (out.notes ? out.notes + " | " : "") + "no_openai_key";
    return out;
  }

  // มีคีย์ → ใช้ AI ก่อน
  const system = [
    "คุณคือตัวแยกคำสั่งภาษาไทย สำหรับลงตาราง/สร้างงาน",
    `ไทม์โซนหลัก: ${TZ} (+07:00)`,
    "หน้าที่ของคุณ:",
    "• ถ้าเห็นคำว่า 'ลงตาราง' ให้ intent='schedule', ถ้าไม่เห็นให้ 'add_task'. ถ้าเป็นวิธีใช้ → 'help', ถ้าไม่เข้าใจ → 'none'.",
    "• วิเคราะห์รูปแบบเวลาไทย: วันนี้/พรุ่งนี้/วันในสัปดาห์/(เลขวันที่) HH:MM หรือ HH.MM/ทั้งวัน/due=YYYY-MM-DD[ time=HH:MM|HH.MM ]",
    "• รองรับ 'ศุกร์ที่ 26 15.00' (มีคำว่า 'ที่' คั่นวันกับวันที่)",
    "• ถ้าเป็น timed ตั้ง end = start + 60 นาที",
    "• ดึงอีเมลเป็น attendees[]",
    "• ตอบ JSON ตาม schema เท่านั้น",
  ].join("\n");

  const schema = {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["schedule", "add_task", "help", "none"] },
      title: { type: "string" },
      when: {
        anyOf: [
          {
            type: "object",
            properties: {
              kind: { type: "string", const: "timed" },
              startISO: { type: "string" },
              endISO: { type: "string" }
            },
            required: ["kind", "startISO", "endISO"]
          },
          {
            type: "object",
            properties: {
              kind: { type: "string", const: "allday" },
              startDate: { type: "string" },
              endDate: { type: "string" }
            },
            required: ["kind", "startDate", "endDate"]
          }
        ]
      },
      attendees: { type: "array", items: { type: "string" }, default: [] },
      notes: { type: "string", default: "" }
    },
    required: ["intent", "title"],
    additionalProperties: false
  } as const;

  try {
    const parsed = await client.responses.parse({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: `ข้อความจากผู้ใช้ (LINE): """${inputText}"""` }
      ],
      schema
    });

    const out = parsed as unknown as ParsedAIResult;

    // เสริมความทนทาน
    if (!out.attendees || !Array.isArray(out.attendees)) out.attendees = [];
    for (const e of extractEmails(inputText)) if (!out.attendees.includes(e)) out.attendees.push(e);
    if (!out.title) out.title = "งานใหม่";
    if (!out.notes) out.notes = "";
    return out;
  } catch (e: any) {
    // AI พัง → fallback
    console.error("OPENAI_PARSE_ERR -> using local fallback", e?.message ?? e);
    const out = localFallbackParse(inputText);
    out.notes = (out.notes ? out.notes + " | " : "") + "fallback_after_ai_error";
    return out;
  }
}
