// app/api/calendar/create/route.ts
import { NextRequest } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

function getJwt() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  if (!email || !rawKey) throw new Error("Missing GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY");
  const key = rawKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

function toISO(date: string, time: string, tz = "Asia/Bangkok") {
  // date: yyyy-mm-dd, time: HH:mm
  // ใช้ offset +07:00 แบบง่าย
  const base = `${date}T${time}:00+07:00`;
  return new Date(base).toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      calendarId,   // <- ระบุ calendar ที่จะบันทึกลง
      title,
      description = "",
      location = "",
      date,         // yyyy-mm-dd
      start,        // HH:mm
      end,          // HH:mm
    } = body || {};

    if (!calendarId) return new Response("calendarId required", { status: 400 });
    if (!title) return new Response("title required", { status: 400 });
    if (!date || !start || !end) return new Response("date/start/end required", { status: 400 });

    const auth = getJwt();
    const cal = google.calendar({ version: "v3", auth });

    const startISO = toISO(String(date), String(start));
    const endISO = toISO(String(date), String(end));

    const resp = await cal.events.insert({
      calendarId: String(calendarId),
      requestBody: {
        summary: String(title),
        description: String(description || ""),
        location: String(location || ""),
        start: { dateTime: startISO, timeZone: "Asia/Bangkok" },
        end: { dateTime: endISO, timeZone: "Asia/Bangkok" },
      },
      sendUpdates: "none",
    });

    return Response.json({
      ok: true,
      eventId: resp.data.id || null,
      htmlLink: resp.data.htmlLink || null,
    });
  } catch (e: any) {
    console.error("CAL_CREATE_ERR", e?.errors || e?.message || e);
    return new Response(String(e?.message || e), { status: 500 });
  }
}
