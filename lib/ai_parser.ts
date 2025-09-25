// lib/ai_parser.ts
// ใช้กับ openai@^5 (SDK เวอร์ชันใหม่)
// - บังคับโมเดลตอบเป็น JSON ตาม schema ด้วย responses.parse()
// - ออกแบบมาสำหรับงาน "สั่งลงตาราง/สร้างงาน" ภาษาไทย
// - ไทม์โซนหลัก: Asia/Bangkok (+07:00)

import OpenAI from "openai";

const TZ = "Asia/Bangkok";
const apiKey = process.env.OPENAI_API_KEY;

// --------- Types ที่ฝั่ง route.ts คาดหวัง ---------
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

// --------- JSON Schema สำหรับ Structured Output ---------
const schema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["schedule", "add_task", "help", "none"] },
    title: { type: "string", description: "ชื่อเรื่อง/หัวข้อของงานหรืออีเวนต์" },
    when: {
      anyOf: [
        {
          type: "object",
          properties: {
            kind: { type: "string", const: "timed" },
            // ต้องเป็น ISO-8601 พร้อม timezone +07:00 (เช่น 2025-09-26T15:00:00+07:00)
            startISO: { type: "string" },
            endISO: { type: "string" }
          },
          required: ["kind", "startISO", "endISO"]
        },
        {
          type: "object",
          properties: {
            kind: { type: "string", const: "allday" },
            // ขอบเขต [startDate, endDate) ตาม Google Calendar (YYYY-MM-DD)
            startDate: { type: "string" },
            endDate: { type: "string" }
          },
          required: ["kind", "startDate", "endDate"]
        }
      ]
    },
    attendees: {
      type: "array",
      items: { type: "string", description: "อีเมลผู้เข้าร่วม" },
      default: []
    },
    notes: { type: "string", default: "" }
  },
  required: ["intent", "title"],
  additionalProperties: false
} as const;

// --------- OpenAI Client ---------
let client: OpenAI | null = null;
if (apiKey) client = new OpenAI({ apiKey });

// --------- Utilities ---------
function nowInBangkokISOForPrompt(): string {
  // ให้โมเดลรู้ "ตอนนี้" ในไทม์โซนกรุงเทพ เพื่อคำนวณคำอย่าง "วันนี้/พรุ่งนี้/วันศุกร์"
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`;
}

function extractEmailsFallback(text: string): string[] {
  const picked = new Set<string>();
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    picked.add(m[0]);
  }
  // email=a@b.com รูปแบบพิเศษ
  const p = /email\s*=\s*([^\s|,;]+)/i.exec(text)?.[1];
  if (p) picked.add(p);
  return Array.from(picked);
}

// --------- Main: เรียก AI ให้แปลงข้อความเป็น JSON ---------
export async function parseLineTextToJson(inputText: string): Promise<ParsedAIResult> {
  if (!client) {
    const err: any = new Error("OPENAI_API_KEY_MISSING");
    err.code = "OPENAI_API_KEY_MISSING";
    throw err;
  }

  const nowBkk = nowInBangkokISOForPrompt();

  // คำสั่งระบบ (system) เพื่อกำกับให้ตีความข้อความไทยเป็น JSON ตาม schema
  const system = [
    "คุณคือตัวแยกคำสั่งภาษาไทย สำหรับลงตาราง/สร้างงาน",
    `ตอนนี้ (ปัจจุบัน) คือ ${nowBkk} ในไทม์โซน Asia/Bangkok (+07:00).`,
    "หน้าที่ของคุณ:",
    "1) ระบุ intent: ถ้าเห็นคำว่า 'ลงตาราง' ให้ intent = schedule, ถ้าไม่เห็นให้ intent = add_task; ถ้าผู้ใช้ขอวิธีใช้ → help; ถ้าไม่เข้าใจ → none",
    "2) วิเคราะห์เวลาไทย: 'วันนี้', 'พรุ่งนี้', 'วันศุกร์', '15:00', '15.00', '10 โมง', 'ทั้งวัน', 'due=YYYY-MM-DD [time=HH:MM|HH.MM]'",
    "3) ถ้าเป็น schedule และระบุเวลาแบบเจาะจง ให้ when.kind='timed' โดยกำหนด startISO/endISO เป็น ISO-8601 ใส่ timezone +07:00 ชัดเจน, ถ้าไม่เจาะจงเวลาให้เป็น allday (startDate/endDate)",
    "4) ถ้าให้เฉพาะเวลาเริ่ม ให้ตั้ง end เป็น 60 นาทีถัดไปโดยอัตโนมัติ",
    "5) อนุญาตให้คำนวณ 'วันศุกร์' → วันที่ 'วันศุกร์' ถัดไปจากปัจจุบัน",
    "6) ดึงอีเมลจากข้อความเป็น attendees (array) ถ้ามี",
    "7) ตอบเป็น JSON ตาม schema เท่านั้น ห้ามเพิ่มข้อความอื่น"
  ].join("\n");

  // เรียก Responses API (v5) และบังคับสคีมาด้วย responses.parse
  const parsed = await client.responses.parse({
    model: "gpt-4.1-mini", // เร็ว/คุ้มราคา; จะใช้รุ่นอื่นได้ตามต้องการ
    input: [
      { role: "system", content: system },
      { role: "user", content: `ข้อความจากผู้ใช้ (LINE): """${inputText}"""` }
    ],
    schema
  });

  // typesafe ตาม schema ที่กำหนด
  const out = parsed as unknown as ParsedAIResult;

  // ---------- เสริมความทนทาน (hardening) ----------
  // 1) เติม attendees ถ้าโมเดลมองไม่เห็น แต่ฝั่งข้อความมี
  if (!out.attendees || !Array.isArray(out.attendees)) {
    out.attendees = [];
  }
  const fallbackEmails = extractEmailsFallback(inputText);
  for (const e of fallbackEmails) {
    if (!out.attendees.includes(e)) out.attendees.push(e);
  }

  // 2) ถ้าโมเดลลืมใส่ when สำหรับ schedule → บังคับ none + notes
  if (out.intent === "schedule" && !out.when) {
    out.intent = "none";
    out.notes = (out.notes ? out.notes + " | " : "") + "missing_when_for_schedule";
  }

  // 3) ป้องกันค่าผิดพลาด
  if (!out.title || typeof out.title !== "string") {
    out.title = "งานใหม่";
  }
  if (!out.notes) out.notes = "";

  return out;
}
