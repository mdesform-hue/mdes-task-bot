// lib/gcal.ts
import { google, calendar_v3 } from "googleapis";

// ==== ENV ====
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || "";
const RAW_PRIVATE_KEY     = process.env.GOOGLE_PRIVATE_KEY || "";
const CALENDAR_ID         = process.env.GCAL_CALENDAR_ID || ""; // ปฏิทินหลักที่ SA เขียนได้
const TIMEZONE            = "Asia/Bangkok";

// แปลง \n ใน private key (กรณีเก็บใน ENV แบบ single-line)
const GOOGLE_PRIVATE_KEY = RAW_PRIVATE_KEY.replace(/\\n/g, "\n");

// ตรวจ ENV ให้ครบ
if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !CALENDAR_ID) {
  // ชื่อที่แจ้งเตือนให้ตรงกับตัวแปรจริง
  console.warn(
    "⚠️ Missing Google Calendar envs. Required: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GCAL_CALENDAR_ID"
  );
}

// ==== Auth / Client ====
const auth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL || undefined,
  key: GOOGLE_PRIVATE_KEY || undefined,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

export const calendar = google.calendar({ version: "v3", auth });

// ==== Types ====
export type GcalEventInput = {
  title: string;
  startISO: string; // ISO string (e.g. 2025-01-31T10:00:00+07:00)
  endISO: string;   // ISO string (e.g. 2025-01-31T11:00:00+07:00)
  attendees?: string[];      // รายชื่ออีเมลผู้เข้าร่วม (optional)
  description?: string | null;
  location?: string | null;
};

// ==== Helpers ====
// ตรวจ ENV ก่อนยิง API (โยน error ชัดเจน)
function ensureEnv() {
  if (!GOOGLE_CLIENT_EMAIL) throw new Error("GOOGLE_CLIENT_EMAIL is missing");
  if (!GOOGLE_PRIVATE_KEY)  throw new Error("GOOGLE_PRIVATE_KEY is missing");
  if (!CALENDAR_ID)         throw new Error("GCAL_CALENDAR_ID is missing");
}

// ==== API ====
// สร้าง Event ลงปฏิทินหลัก (ที่กำหนดใน GCAL_CALENDAR_ID)
export async function createCalendarEvent(input: GcalEventInput) {
  ensureEnv();

  const { title, startISO, endISO, attendees, description, location } = input;

  const request: calendar_v3.Params$Resource$Events$Insert = {
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: title,
      description: description || undefined,
      location: location || undefined,
      start: { dateTime: startISO, timeZone: TIMEZONE },
      end:   { dateTime: endISO,   timeZone: TIMEZONE },
      attendees: (attendees && attendees.length)
        ? attendees.map((email) => ({ email }))
        : undefined,
    },
    // ส่งเชิญไปยังผู้ร่วมถ้ามี
    sendUpdates: (attendees && attendees.length) ? "all" : "none",
  };

  const res = await calendar.events.insert(request);
  return res.data;
}
