// lib/ai_parser.ts
// ใช้กับ openai@^5; ถ้า AI ล้มเหลว จะ fallback เป็นพาร์เซอร์ภายในทันที

import OpenAI from "openai";

const TZ = "Asia/Bangkok";
const apiKey = process.env.OPENAI_API_KEY;

// --------- Types ที่ฝั่ง route.ts ใช้ ---------
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

// --------- OpenAI client (ถ้ามีคีย์) ---------
let client: OpenAI | null = null;
if (apiKey) client = new OpenAI({ apiKey });

// --------- Utils เวลาไทย ---------
const pad2 = (n: number) => String(n).padStart(2, "0");
function nowBkk() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}
function toISOAtBkk(y: number, m: number, d: number, hh = 0, mm = 0) {
  // สร้าง Date ที่เจาะจงโซน +07:00 แล้วคืน .toISOString()
  const s = `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+07:00`;
  return new Date(s).toISOString();
}
function addMinutesISO(iso: string, mins: number) {
  const t = new Date(iso).getTime() + mins * 60 * 1000;
  return new Date(t).toISOString();
}
function ymd(date: Date) {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}
const WEEKIDX: Record<string, number> = {
  "อาทิตย์": 0, "จันทร์": 1, "อังคาร": 2, "พุธ": 3, "พฤหัส": 4, "พฤหัสบดี": 4, "ศุกร์": 5, "เสาร์": 6
};
function nextWeekday(base: Date, targetDow: number) {
  const d = new Date(base);
  const add = (targetDow - d.getDay() + 7) % 7 || 7; // ถ้าตรงวันเดียวกันให้กระโดดไป "สัปดาห์ถัดไป"
  d.setDate(d.getDate() + add);
  return d;
}

// --------- ดึงอีเมลแบบ fallback ---------
function extractEmails(text: string): string[] {
  const picked = new Set<string>();
  const p = /email\s*=\s*([^\s|,;]+)/i.exec(text)?.[1];
  if (p) picked.add(p);
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) picked.add(m[0]);
  return Array.from(picked);
}

// --------- พาร์เซอร์ภายใน (รองรับรูปแบบที่ถามมา) ---------
function localFallbackParse(inputText: string): ParsedAIResult {
  const text = inputText.trim();
  const wantSchedule = /(?:^|\s)ลงตาราง(?:\s*เวลา)?(?:\s|$)/i.test(text);
  const help = /^(help|ช่วยเหลือ)$/i.test(text);
  const emails = extractEmails(text);
  const base = nowBkk();
  const { y, m, d } = ymd(base);

  // เวลา: วันนี้ / พรุ่งนี้ / วันศุกร์ (วันในสัปดาห์)
  let when: ParsedWhen | null = null;

  // 1) วันนี้ HH(.|:)MM? | วันนี้ HH โมง
  let mt = text.match(/วันนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/i);
  if (mt) {
    const hh = Math.max(0, Math.min(23, parseInt(mt[1], 10)));
    const mm = mt[2] ? Math.max(0, Math.min(59, parseInt(mt[2], 10))) : 0;
    const startISO = toISOAtBkk(y, m, d, hh, mm);
    const endISO = addMinutesISO(startISO, 60);
    when = { kind: "timed", startISO, endISO };
  } else if (/วันนี้/i.test(text)) {
    // วันนี้ทั้งวัน
    const startDate = `${y}-${pad2(m)}-${pad2(d)}`;
    const e = new Date(`${startDate}T00:00:00+07:00`); e.setDate(e.getDate() + 1);
    const endDate = `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`;
    when = { kind: "allday", startDate, endDate };
  }

  // 2) พรุ่งนี้ HH(.|:)MM? | พรุ่งนี้ ทั้งวัน
  if (!when) {
    let mt2 = text.match(/พรุ่งนี้\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?/i);
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
      const e = new Date(`${startDate}T00:00:00+07:00`); e.setDate(e.getDate() + 1);
      const endDate = `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`;
      when = { kind: "allday", startDate, endDate };
    }
  }

  // 3) วันในสัปดาห์ เช่น วันศุกร์ 15.00 / วันศุกร์ ทั้งวัน
  if (!when) {
    const mw = text.match(/วัน(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์)(?:\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:น\.|โมง)?)?/i);
    if (mw) {
      const dow = WEEKIDX[mw[1]]; // 0..6
      const day = nextWeekday(base, dow);
      const { y: y2, m: m2, d: d2 } = ymd(day);
      if (mw[2]) {
        const hh = Math.max(0, Math.min(23, parseInt(mw[2], 10)));
        const mm = mw[3] ? Math.max(0, Math.min(59, parseInt(mw[3], 10))) : 0;
        const startISO = toISOAtBkk(y2, m2, d2, hh, mm);
        const endISO = addMinutesISO(startISO, 60);
        when = { kind: "timed", startISO, endISO };
      } else {
        const startDate = `${y2}-${pad2(m2)}-${pad2(d2)}`;
        const e = new Date(`${startDate}T00:00:00+07:00`); e.setDate(e.getDate() + 1);
        const endDate = `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`;
        when = { kind: "allday", startDate, endDate };
      }
    }
  }

  // 4) "<วันที่เดือนนี้> HH(.|:)MM?" เช่น "27 15.00" | "<วันที่เดือนนี้> ทั้งวัน"
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
        const e = new Date(`${startDate}T00:00:00+07:00`); e.setDate(e.getDate() + 1);
        const endDate = `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`;
        when = { kind: "allday", startDate, endDate };
      }
    }
  }

  // 5) due=YYYY-MM-DD [time=HH(:|.)MM]
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
      const e = new Date(`${startDate}T00:00:00+07:00`); e.setDate(e.getDate() + 1);
      const endDate = `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`;
      when = { kind: "allday", startDate, endDate };
    }
  }

  // Title: ตัด prefix/คำสั่ง/เวลาออกอย่างคร่าว ๆ
  let title = text
    .replace(/^ai\s*/i, "")
    .replace(/(?:^|\s)ลงตาราง(?:\s*เวลา)?\s*/i, " ")
    .replace(/วันนี้\s*\d{1,2}(?:[:.]\d{2})?\s*(?:น\.|โมง)?/gi, " ")
    .replace(/พรุ่งนี้\s*\d{1,2}(?:[:.]\d{2})?\s*(?:น\.|โมง)?/gi, " ")
    .replace(/วัน(อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์)(?:\s+\d{1,2}(?:[:.]\d{2})?\s*(?:น\.|โมง)?)?/gi, " ")
    .replace(/(^|\s)(\d{1,2})\s+(\d{1,2})(?:[:.](\d{2}))?(\s|$)/g, " ")
    .replace(/(^|\s)(\d{1,2})\s*ทั้งวัน(\s|$)/g, " ")
    .replace(/due=\d{4}-\d{2}-\d{2}/gi, " ")
    .replace(/time=\d{1,2}(?:[:.]\d{2})?/gi, " ")
    .replace(/email=[^\s|,;]+/gi, " ")
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

// --------- เรียก AI; ถ้า error จะ fallback อัตโนมัติ ---------
export async function parseLineTextToJson(inputText: string): Promise<ParsedAIResult> {
  // 1) ไม่มีคีย์ → ใช้ fallback ทันที (อย่าโยน error)
  if (!client) {
    const out = localFallbackParse(inputText);
    out.notes = (out.notes ? out.notes + " | " : "") + "no_openai_key";
    return out;
  }

  // 2) มีคีย์ → พยายามใช้ AI ก่อน
  const system = [
    "คุณคือตัวแยกคำสั่งภาษาไทย สำหรับลงตาราง/สร้างงาน",
    `ไทม์โซนหลัก: ${TZ} (+07:00)`,
    "หน้าที่ของคุณ:",
    "• ถ้าเห็นคำว่า 'ลงตาราง' ให้ intent='schedule', ถ้าไม่เห็นให้ 'add_task'. ถ้าเป็นวิธีใช้ → 'help', ถ้าไม่เข้าใจ → 'none'.",
    "• วิเคราะห์รูปแบบเวลาไทย วันนี้/พรุ่งนี้/วันในสัปดาห์/HH:MM/HH.MM/ทั้งวัน/due=YYYY-MM-DD[ time=HH:MM|HH.MM ]",
    "• ถ้ากำหนดเวลาชัดเจน → when.kind='timed' พร้อม startISO/endISO (+07:00), ไม่ชัดเจนเวลา → 'allday' ด้วย startDate/endDate",
    "• end ของ timed ให้ตั้ง +60 นาทีจาก start ถ้าไม่ได้กำหนด",
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

    // แข็งแรงขึ้นนิดหน่อย
    if (!out.attendees || !Array.isArray(out.attendees)) out.attendees = [];
    for (const e of extractEmails(inputText)) if (!out.attendees.includes(e)) out.attendees.push(e);
    if (!out.title) out.title = "งานใหม่";
    if (!out.notes) out.notes = "";
    return out;
  } catch (e: any) {
    // 3) ถ้า AI พัง (quota/รุ่น/เน็ต) → fallback
    console.error("OPENAI_PARSE_ERR -> using local fallback", e?.message ?? e);
    const out = localFallbackParse(inputText);
    out.notes = (out.notes ? out.notes + " | " : "") + "fallback_after_ai_error";
    return out;
  }
}
