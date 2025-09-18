// lib/gcal.ts
import { google } from "googleapis";

// อ่านค่า env
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL!;
const GOOGLE_PRIVATE_KEY  = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const CALENDAR_ID         = process.env.GCAL_CALENDAR_ID!; // ปฏิทินหลักที่ให้ Service Account เขียนได้
const TIMEZONE            = "Asia/Bangkok";

if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !CALENDAR_ID) {
  console.warn("⚠️ Missing Google Calendar envs: GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY / GCAL_CALENDAR_ID");
}

const auth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });

export type GcalEventInput = {
  title: string;
  startISO: string; // ISO string
  endISO: string;   // ISO string
  attendees?: string[]; // email รายชื่อผู้ร่วม
  description?: string | null;
};

export async function createCalendarEvent(input: GcalEventInput) {
  const { title, startISO, endISO, attendees, description } = input;
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: title,
      description: description || undefined,
      start: { dateTime: startISO, timeZone: TIMEZONE },
      end:   { dateTime: endISO,   timeZone: TIMEZONE },
      attendees: (attendees && attendees.length)
        ? attendees.map(email => ({ email }))
        : undefined,
    },
    sendUpdates: (attendees && attendees.length) ? "all" : "none", // ส่งเชิญไปที่อีเมล
  });
  return res.data;
}
