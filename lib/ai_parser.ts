// lib/ai_parser.ts
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

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

let client: OpenAI | null = null;
if (apiKey) client = new OpenAI({ apiKey });

export async function parseLineTextToJson(inputText: string) {
  if (!client) {
    const err: any = new Error("OPENAI_API_KEY_MISSING");
    err.code = "OPENAI_API_KEY_MISSING";
    throw err;
  }

  const system = [
    "คุณคือตัวแยกคำสั่งลงตาราง/สร้างงานสำหรับผู้ใช้คนไทย",
    "ไทม์โซนหลัก: Asia/Bangkok (+07:00)",
    "รองรับรูปแบบเวลา: วันนี้/พรุ่งนี้ HH, HH:MM, HH.MM, ทั้งวัน, due=YYYY-MM-DD [time=HH:MM|HH.MM], วันจันทร์-อาทิตย์, วันศุกร์ 15.00, เลขไทย, 'โมง', 'น.', 'นาฬิกา'",
    "ตอบเป็น JSON ตาม schema เท่านั้น",
    "ถ้าเห็นคำว่า 'ลงตาราง' ให้ intent = schedule, หากไม่มีให้ intent = add_task",
    "ถ้าถามวิธีใช้ → intent = help",
    "ถ้าตีความไม่ได้ → intent = none และใส่ notes"
  ].join("\n");

  // v5: responses.parse จะรีเทิร์นเป็นอ็อบเจ็กต์ที่ parse แล้วตาม schema
  const parsed = await client.responses.parse({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: `ข้อความจากผู้ใช้ (LINE): """${inputText}"""` }
    ],
    schema
  });

  return parsed as any;
}
