// lib/ai_parser.ts
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * สคีมาผลลัพธ์ที่ "บังคับ" ให้โมเดลตอบ
 * - รองรับ intent หลัก ๆ: schedule (ลงตาราง), add_task (เพิ่มงาน), help (ขอวิธีใช้), none (ไม่เข้าใจ)
 * - เมื่อ kind = "timed" -> startISO/endISO เป็น ISO-8601 พร้อมโซน +07:00
 * - เมื่อ kind = "allday" -> startDate/endDate เป็น YYYY-MM-DD (ขอบเขต [start, end) แบบ Google Calendar)
 */
const structuredSchema = {
  name: "ScheduleIntent",
  schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["schedule", "add_task", "help", "none"] },
      title: { type: "string", description: "ชื่อเรื่อง/หัวข้อ" },
      when: {
        anyOf: [
          {
            type: "object",
            properties: {
              kind: { type: "string", const: "timed" },
              startISO: { type: "string", description: "เช่น 2025-09-25T15:00:00+07:00" },
              endISO: { type: "string", description: "เช่น 2025-09-25T16:00:00+07:00" }
            },
            required: ["kind", "startISO", "endISO"]
          },
          {
            type: "object",
            properties: {
              kind: { type: "string", const: "allday" },
              startDate: { type: "string", description: "YYYY-MM-DD" },
              endDate: { type: "string", description: "YYYY-MM-DD (exclusive)" }
            },
            required: ["kind", "startDate", "endDate"]
          }
        ]
      },
      attendees: {
        type: "array",
        items: { type: "string", description: "email" },
        default: []
      },
      // ถ้าตีความเวลาไม่ได้ ให้ reasons/notes แจ้งสาเหตุ
      notes: { type: "string", description: "หมายเหตุ/สาเหตุถ้าตีความไม่ได้", default: "" }
    },
    required: ["intent", "title"],
    additionalProperties: false
  },
  strict: true
};

/**
 * เรียก OpenAI Responses API ด้วยโหมด Structured Outputs (json_schema)
 * ให้โมเดล "แปลง" ข้อความไทยเป็น JSON ตาม schema ข้างบน
 */
export async function parseLineTextToJson(inputText: string) {
  const system = [
    "คุณคือตัวแยกคำสั่งลงตาราง/สร้างงานสำหรับผู้ใช้คนไทย",
    "ไทม์โซนหลัก: Asia/Bangkok (+07:00)",
    "รองรับรูปแบบเวลา: วันนี้/พรุ่งนี้ HH, HH:MM, HH.MM, \"ทั้งวัน\", \"due=YYYY-MM-DD [time=HH:MM|HH.MM]\", วันที่เลขไทย, คำว่า 'โมง', 'น.', 'นาฬิกา'",
    "ห้ามแต่งข้อความอิสระ ให้ตอบเป็น JSON ตาม schema เท่านั้น",
    "ถ้าเห็นคำว่า 'ลงตาราง' ให้ตั้ง intent = schedule, หากไม่มีให้ตั้งเป็น add_task",
    "ถ้าฟังดูเป็นการถามวิธีใช้ ให้ intent = help",
    "ถ้าตีความไม่ได้ ให้ intent = none และใส่ notes ระบุสาเหตุ"
  ].join("\n");

  const user = `ข้อความจากผู้ใช้ (LINE): """${inputText}"""`;

  // Responses API + structured outputs
  const resp = await openai.responses.create({
    model: "gpt-4.1-mini", // หรือรุ่นที่คุณใช้
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_schema", json_schema: structuredSchema }
  });

  // ตัว Responses API จะคืนผลแบบโครงสร้างเดียว; ใช้ .output[0].content[0].text ใน SDK เก่าบางตัว
  // แต่ในเวอร์ชันล่าสุด จะมี resp.output[0].content[0].json
  // เพื่อความเข้ากันได้ ลองอ่านทั้งสองแบบ:
  const item = (resp as any)?.output?.[0]?.content?.[0];
  const jsonStr = item?.text ?? JSON.stringify(item?.json ?? {});
  let parsed: any = {};
  try { parsed = JSON.parse(jsonStr); } catch { parsed = item?.json ?? {}; }

  return parsed;
}
