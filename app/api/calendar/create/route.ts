// app/api/calendar/create/route.ts
export const runtime = "nodejs";

import { google } from "googleapis";

const TZ = "Asia/Bangkok";

/** สร้าง JWT สำหรับ Service Account; ถ้าต้อง impersonate ให้ใส่ subject */
function getAuth(subject?: string) {
  const email = process.env.GOOGLE_CLIENT_EMAIL!;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
    ...(subject ? { subject } : {}),
  });
}

/** แปลง date+time (โลคอลไทย) เป็น RFC3339 +07:00 */
function toRFC3339Local(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const local = new Date(y, m - 1, d, hh, mm, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}:00+07:00`;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const {
      title,
      description = "",
      location = "",
      date,     // "YYYY-MM-DD"
      start,    // "HH:mm"
      end,      // "HH:mm"
      attendeeEmail, // ← ต้องกรอกอีเมลที่ต้องการให้ "ลงตาราง"
      // หมายเหตุ: จะไม่ใช้ GCAL_CALENDAR_ID แล้วในเคสนี้
    } = await req.json();

    // เช็คช่องบังคับ
    if (!title || !date || !start || !end) {
      return new Response("bad request: missing title/date/start/end", { status: 400 });
    }

    const targetRaw = String(attendeeEmail || "").trim();
    if (!targetRaw) {
      return new Response("กรุณากรอกอีเมลปฏิทิน (เชิญเข้าร่วม) ก่อน", { status: 400 });
    }
    if (targetRaw.includes(",")) {
      return new Response("กรุณากรอกอีเมลเดียวเท่านั้น (ห้ามคั่น ,)", { status: 400 });
    }
    if (!emailRe.test(targetRaw)) {
      return new Response("อีเมลไม่ถูกต้อง", { status: 400 });
    }

    // ── ใช้อีเมลที่กรอกเป็น 'calendarId' ปลายทาง ──
    const calendarId = targetRaw;

    // ถ้าองค์กรคุณเปิด Domain-wide Delegation และต้องการให้ SA สวมสิทธิ์ user ปลายทาง:
    // ตั้ง ENV CALENDAR_IMPERSONATE=1 แล้วเราจะใส่ subject = calendarId
    const useImpersonation = (process.env.CALENDAR_IMPERSONATE || "").toLowerCase() === "1";
    const auth = getAuth(useImpersonation ? calendarId : undefined);

    const calendar = google.calendar({ version: "v3", auth });
    const startStr = toRFC3339Local(date, start);
    const endStr = toRFC3339Local(date, end);

    const res = await calendar.events.insert({
      calendarId, // ✅ สร้างลงปฏิทินของอีเมลที่กรอก
      requestBody: {
        summary: title,
        description,
        location,
        start: { dateTime: startStr, timeZone: TZ },
        end:   { dateTime: endStr,   timeZone: TZ },
      },
      // ไม่ส่งอีเมลเชิญ เพราะเราเขียนลงปฏิทินปลายทางโดยตรง
      sendUpdates: "none",
    });

    return Response.json({
      ok: true,
      eventId: res.data.id,
      calendarId,
      htmlLink: res.data.htmlLink,
    });
  } catch (e: any) {
    console.error("CAL_CREATE_ERR", e?.response?.data || e?.message || e);
    // ส่งข้อความช่วยไดบั๊กเรื่องสิทธิ์
    if (e?.code === 403 || e?.response?.status === 403) {
      return new Response(
        "permission_denied: Service Account ยังไม่มีสิทธิ์เขียนในปฏิทินของอีเมลนี้ — ให้แชร์สิทธิ์แก้ไขให้ SA หรือเปิด Domain-wide Delegation แล้วตั้ง CALENDAR_IMPERSONATE=1",
        { status: 403 }
      );
    }
    return new Response("calendar insert failed", { status: 500 });
  }
}
