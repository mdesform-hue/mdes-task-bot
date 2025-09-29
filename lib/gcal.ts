// lib/gcal.ts
import { google, calendar_v3 } from "googleapis";

/* ========================= ENV & CLIENT ========================= */

const GOOGLE_CLIENT_EMAIL = (process.env.GOOGLE_CLIENT_EMAIL || "").trim();
const RAW_PRIVATE_KEY     = (process.env.GOOGLE_PRIVATE_KEY || "").trim();
const CALENDAR_ID         = (process.env.GCAL_CALENDAR_ID || "").trim(); // ปฏิทินหลักที่ SA เขียนได้
export const DEFAULT_TIMEZONE = "Asia/Bangkok";

// แปลง \n ใน private key (กรณีเก็บใน ENV แบบ single-line)
const GOOGLE_PRIVATE_KEY = RAW_PRIVATE_KEY.replace(/\\n/g, "\n");

// เตือนตอนโหลดถ้า ENV ไม่ครบ (ไม่หยุด build)
if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !CALENDAR_ID) {
  console.warn(
    "⚠️ Missing Google Calendar envs. Required: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GCAL_CALENDAR_ID"
  );
}

// หมายเหตุ: โมดูลนี้โหลดครั้งเดียวใน runtime เดียว => auth reuse ได้
const auth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL || undefined,
  key: GOOGLE_PRIVATE_KEY || undefined,
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

export const calendar = google.calendar({ version: "v3", auth });

/* ========================= TYPES ========================= */

export type GcalEventInput = {
  title: string;
  startISO: string; // e.g. 2025-01-31T10:00:00+07:00
  endISO: string;   // e.g. 2025-01-31T11:00:00+07:00
  attendees?: string[];
  description?: string | null;
  location?: string | null;
  colorId?: string | number | null; // Google preset 1..11
};

export type CreatedEvent = calendar_v3.Schema$Event;

/* ========================= HELPERS ========================= */

// ตรวจ ENV ก่อนยิง API (โยน error ชัดเจน)
export function ensureGcalEnv() {
  if (!GOOGLE_CLIENT_EMAIL) throw new Error("GOOGLE_CLIENT_EMAIL is missing");
  if (!GOOGLE_PRIVATE_KEY)  throw new Error("GOOGLE_PRIVATE_KEY is missing");
  if (!CALENDAR_ID)         console.warn("GCAL_CALENDAR_ID is empty (required only for create)");
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
  if (e <= s) throw new Error("Invalid time range: endISO must be greater than startISO");
}

/** all-day → ISO (โซนเวลาไทย) ใช้ตอนอ่าน event แบบ date-only */
export function dateOnlyToISO(dateOnly: string, end = false) {
  const t = end ? "T23:59:00+07:00" : "T00:00:00+07:00";
  return new Date(`${dateOnly}${t}`).toISOString();
}

/** แปลงชื่อสี (lavender..tomato) → colorId (1..11) */
const COLOR_NAME_TO_ID: Record<string, string> = {
  lavender: "1", sage: "2", grape: "3", flamingo: "4", banana: "5",
  tangerine: "6", peacock: "7", graphite: "8", blueberry: "9", basil: "10", tomato: "11",
};
export function normalizeColorId(color?: string | number | null) {
  if (color == null) return null;
  const s = String(color).trim().toLowerCase();
  return COLOR_NAME_TO_ID[s] ?? String(color);
}

/* ========================= WRITE API ========================= */

/** สร้าง Event ลงปฏิทินหลัก (GCAL_CALENDAR_ID) */
export async function createCalendarEvent(input: GcalEventInput): Promise<CreatedEvent> {
  ensureGcalEnv();

  const { title, startISO, endISO, attendees, description, location, colorId } = input;

  if (!title?.trim()) throw new Error("title is required");
  if (!startISO?.trim() || !endISO?.trim()) throw new Error("startISO and endISO are required");
  assertTimeRange(startISO, endISO);

  const request: calendar_v3.Params$Resource$Events$Insert = {
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: title.trim(),
      description: normStr(description ?? undefined),
      location: normStr(location ?? undefined),
      start: { dateTime: startISO, timeZone: DEFAULT_TIMEZONE },
      end:   { dateTime: endISO,   timeZone: DEFAULT_TIMEZONE },
      attendees: (attendees && attendees.length)
        ? attendees.map((email) => ({ email: String(email).trim() })).filter(a => a.email)
        : undefined,
      colorId: colorId != null ? String(colorId) : undefined,
    },
    sendUpdates: (attendees && attendees.length) ? "all" : "none",
  };

  try {
    const res = await calendar.events.insert(request);
    return res.data;
  } catch (err: unknown) {
    // Generic error formatter (ไม่พึ่ง type ของ 'gaxios')
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

/* ========================= READ / DEBUG UTILITIES ========================= */

/**
 * ดึงอีเวนต์จาก calendar (รองรับแบ่งหน้า) + กรองสี (ชื่อหรือเลขก็ได้)
 * ใช้ช่วย debug ว่าช่วงเวลา/สิทธิ์/สี ตันตรงไหน
 */
export async function listCalendarEvents(options: {
  calendarId: string;
  timeMin: string;       // ISO (UTC) เช่น new Date("2025-09-01T00:00:00+07:00").toISOString()
  timeMax: string;       // ISO (UTC)
  colorFilter?: string | number | null;
  pageLimit?: number;    // ป้องกันลูปยาวเกิน (default 10 หน้า)
}) {
  ensureGcalEnv();

  const { calendarId, timeMin, timeMax, colorFilter, pageLimit = 10 } = options;
  const normColor = normalizeColorId(colorFilter);

  let pageToken: string | undefined;
  const events: calendar_v3.Schema$Event[] = [];
  let pages = 0;
  let fetched = 0;
  let kept = 0;

  do {
    const { data } = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: "startTime",
      timeMin,
      timeMax,
      pageToken,
      showDeleted: false,
      maxResults: 2500,
    });

    const items = (data.items ?? []) as calendar_v3.Schema$Event[];
    fetched += items.length;

    for (const ev of items) {
      if (normColor && ev.colorId && ev.colorId !== normColor) continue;
      kept++;
      events.push(ev);
    }

    pageToken = data.nextPageToken || undefined;
    pages++;
  } while (pageToken && pages < pageLimit);

  return {
    fetched,
    kept,
    pages,
    events,
    sample: events.slice(0, 3).map((ev) => ({
      id: ev.id ?? null,
      summary: ev.summary ?? null,
      status: ev.status ?? null,
      colorId: ev.colorId ?? null,
      start: ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date} (all-day)` : null),
      end:   ev.end?.dateTime   ?? (ev.end?.date   ? `${ev.end.date} (all-day)`   : null),
      link: ev.htmlLink ?? null,
    })),
  };
}

/** ทดสอบสิทธิ์เข้าถึง calendar แบบเร็ว (ดึงตัวอย่างภายในราว ๆ ±60วัน) */
export async function probeCalendarAccess(calendarId: string) {
  ensureGcalEnv();
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();

    const { data } = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: start,
      timeMax: end,
      maxResults: 5,
      showDeleted: false,
    });

    return {
      ok: true,
      count: data.items?.length ?? 0,
      sample: (data.items ?? []).slice(0, 3).map((ev) => ({
        id: ev.id ?? null,
        summary: ev.summary ?? null,
        status: ev.status ?? null,
        start: ev.start?.dateTime ?? ev.start?.date ?? null,
        colorId: ev.colorId ?? null,
      })),
    };
  } catch (e: any) {
    return {
      ok: false,
      error: e?.response?.data?.error?.message || e?.message || String(e),
      status: e?.response?.status ?? null,
    };
  }
}
