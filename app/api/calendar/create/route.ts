// app/api/calendar/create/route.ts
export const runtime = "nodejs";

import { google } from "googleapis";

// TZ ที่ใช้ตีความเวลาในฟอร์ม (เลือก Asia/Bangkok)
const TZ = "Asia/Bangkok";

// สร้าง client สำหรับ Service Account
function getAuth() {
  const email = process.env.GOOGLE_SERVICE_EMAIL!;
  const key = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function toRFC3339Local(date: string, time: string, tz: string) {
  // date: "YYYY-MM-DD", time: "HH:mm" → แปลงเป็น RFC3339 พร้อม offset +07:00
  // หมายเหตุ: ตีความเป็นเวลาท้องถิ่นไทย แล้ว serialize ออกมาแบบมี offset
  // วิธีง่าย: สร้าง Date จาก local แล้วตัดเป็นส่วน ๆ เอง
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = new Date(y, (m - 1), d, hh, mm, 0); // local time

  // หา offset ปัจจุบันของเครื่องรัน (บน Vercel เป็น UTC) เราจึงกำหนด offset +07:00 ตายตัว
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = local.getFullYear();
  const MM = pad(local.getMonth() + 1);
  const DD = pad(local.getDate());
  const HH = pad(local.getHours());
  const Min = pad(local.getMinutes());
  const SS = "00";

  // ใช้ offset ไทยตายตัว
  const offset = "+07:00";
  return `${yyyy}-${MM}-${DD}T${HH}:${Min}:${SS}${offset}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      description,
      location,
      date,        // "YYYY-MM-DD"
      start,       // "HH:mm"
      end,         // "HH:mm"
      attendeeEmail, // string | undefined
    } = body || {};

    if (!title || !date || !start || !end) {
      return new Response("bad request", { status: 400 });
    }

    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });

    // calendarId จาก ENV (แนะนำให้ตั้งเป็นอีเมลปฏิทินที่แชร์สิทธิ์ให้ SA แล้ว)
    const calendarId = process.env.CALENDAR_ID || "primary";

    const startStr = toRFC3339Local(date, start, TZ);
    const endStr   = toRFC3339Local(date, end, TZ);

    const attendees = attendeeEmail
      ? [{ email: attendeeEmail }]
      : [];

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: description || "",
        location: location || "",
        start: { dateTime: startStr, timeZone: TZ },
        end:   { dateTime: endStr,   timeZone: TZ },
        attendees,
      },
      // ส่งอีเมลเชิญ (ถ้าอยากให้มีอีเมลแจ้ง)
      sendUpdates: "all",
    });

    return Response.json({ ok: true, eventId: res.data.id });
  } catch (e: any) {
    console.error("CAL_CREATE_ERR", e?.message || e);
    return new Response("calendar insert failed", { status: 500 });
  }
}
