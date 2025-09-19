// app/api/calendar/create/route.ts
export const runtime = "nodejs";

import { google } from "googleapis";

const TZ = "Asia/Bangkok";

function getAuth() {
  const email = process.env.GOOGLE_CLIENT_EMAIL!; // <-- ใช้ชื่อตาม ENV ของคุณ
  const key = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"); // สำคัญ
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function toRFC3339Local(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = new Date(y, m - 1, d, hh, mm, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = local.getFullYear();
  const MM = pad(local.getMonth() + 1);
  const DD = pad(local.getDate());
  const HH = pad(local.getHours());
  const MIN = pad(local.getMinutes());
  return `${yyyy}-${MM}-${DD}T${HH}:${MIN}:00+07:00`; // เวลาไทย
}

export async function POST(req: Request) {
  try {
    const { title, description, location, date, start, end, attendeeEmail } =
      await req.json();

    if (!title || !date || !start || !end) {
      return new Response("bad request", { status: 400 });
    }

    const auth = getAuth();
    const calendar = google.calendar({ version: "v3", auth });

    const calendarId = process.env.GCAL_CALENDAR_ID || "primary"; // <-- ใช้ ENV ของคุณ

    const startStr = toRFC3339Local(date, start);
    const endStr = toRFC3339Local(date, end);

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description: description || "",
        location: location || "",
        start: { dateTime: startStr, timeZone: TZ },
        end: { dateTime: endStr, timeZone: TZ },
        attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
      },
      sendUpdates: "all",
    });

    return Response.json({ ok: true, eventId: res.data.id });
  } catch (e: any) {
    console.error("CAL_CREATE_ERR", e?.message || e);
    return new Response("calendar insert failed", { status: 500 });
  }
}
