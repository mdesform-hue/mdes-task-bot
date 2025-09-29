// lib/gcal.ts
import { google, calendar_v3 } from "googleapis";

// ==== ENV ====
const GOOGLE_CLIENT_EMAIL = (process.env.GOOGLE_CLIENT_EMAIL || "").trim();
const RAW_PRIVATE_KEY     = (process.env.GOOGLE_PRIVATE_KEY || "").trim();
const CALENDAR_ID         = (process.env.GCAL_CALENDAR_ID || "").trim(); // ปฏิทินหลักที่ SA เขียนได้
const TIMEZONE            = "Asia/Bangkok";

// แปลง \n ใน private key (กรณีเก็บใน ENV แบบ single-line)
const GOOGLE_PRIVATE_KEY = RAW_PRIVATE_KEY.replace(/\\n/g, "\n");

// ตรวจ ENV ให้ครบ (เตือนตอนโหลดโมดูล)
if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !CALENDAR_ID) {
  console.warn(
    "⚠️ Missing Google Calendar envs. Required: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GCAL_CALENDAR_ID"
  );
}

// ==== Auth / Client ====
// หมายเหตุ: โมดูลนี้โหลดครั้งเดียวใน runtime เดียว => auth reuse ได้
const auth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL || undefined,
  key: GOOGLE_PRIVATE_KEY || undefined,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

export const calendar = google.calendar({ version: "v3", auth });

// ==== Types ====
export type GcalEventInput = {
  title: string;
  startISO: string; // e.g. 2025-01-31T10:00:00+07:00
  endISO: string;   // e.g. 2025-01-31T11:00:00+07:00
  attendees?: string[];      // รายชื่ออีเมลผู้เข้าร่วม (optional)
  description?: string | null;
  location?: string | null;
  colorId?: string | number | null; // เพิ่ม: รองรับกำหนดสี (Google preset 1..11)
};

export type CreatedEvent = calendar_v3.Schema$Event;

// ==== Helpers ====
// ตรวจ ENV ก่อนยิง API (โยน error ชัดเจน)
function ensureEnv() {
  if (!GOOGLE_CLIENT_EMAIL) throw new Error("GOOGLE_CLIENT_EMAIL is missing");
  if (!GOOGLE_PRIVATE_KEY)  throw new Error("GOOGLE_PRIVATE_KEY is missing");
  if (!CALENDAR_ID)         throw new Error("GCAL_CALENDAR_ID is missing");
}

function normStr(s?: string | null) {
  if (s == null) return undefined;
  const t = String(s).trim();
  return t.length ? t : undefined;
}

function assertTimeRange(startISO: string, endISO: string) {
  const s = Date.parse(startISO);
  const e = Date.parse(endISO);
  if (Number.isNaN(s) || Number.isNaN(e)) {
    throw new Error("Invalid datetime: startISO/endISO must be valid ISO strings");
  }
  if (e <= s) {
    throw new Error("Invalid time range: endISO must be greater than startISO");
  }
}

// ==== API ====
// สร้าง Event ลงปฏิทินหลัก (ที่กำหนดใน GCAL_CALENDAR_ID)
export async function createCalendarEvent(input: GcalEventInput): Promise<CreatedEvent> {
  ensureEnv();

  const { title, startISO, endISO, attendees, description, location, colorId } = input;

  // validate พื้นฐาน
  if (!title?.trim()) throw new Error("title is required");
  if (!startISO?.trim() || !endISO?.trim()) {
    throw new Error("startISO and endISO are required");
  }
  assertTimeRange(startISO, endISO);

  // สร้าง request
  const request: calendar_v3.Params$Resource$Events$Insert = {
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: title.trim(),
      description: normStr(description ?? undefined),
      location: normStr(location ?? undefined),
      start: { dateTime: startISO, timeZone: TIMEZONE },
      end:   { dateTime: endISO,   timeZone: TIMEZONE },
      attendees: (attendees && attendees.length)
        ? attendees.map((email) => ({ email: String(email).trim() })).filter(a => a.email)
        : undefined,
      colorId: colorId != null ? String(colorId) : undefined,
    },
    // ส่งเชิญไปยังผู้ร่วมถ้ามี
    sendUpdates: (attendees && attendees.length) ? "all" : "none",
  };

  try {
    const res = await calendar.events.insert(request);
    return res.data;
  } catch (err: unknown) {
    // ไม่พึ่งพา type จาก 'gaxios' อีกต่อไป
    // พยายามดึงรายละเอียดที่เป็นประโยชน์ออกมาถ้ามี
    const anyErr = err as any;
    const status = anyErr?.response?.status;
    const body   = anyErr?.response?.data?.error;

    const message =
      body?.message ||
      anyErr?.message ||
      "Google Calendar API error while creating event";

    const details = {
      status,
      code: body?.code,
      errors: body?.errors,
    };

    const enriched = new Error(`${message} (${JSON.stringify(details)})`);
    (enriched as any).cause = err;
    throw enriched;
  }
}
