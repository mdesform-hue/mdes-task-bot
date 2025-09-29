// app/api/admin/calendar-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { google, calendar_v3 } from "googleapis";

export const runtime = "nodejs";

/** ───────── helpers ───────── */
function assertKey(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    // โยน Response 401 ให้ handler จับแล้ว return ออกไป
    throw new NextResponse("unauthorized", { status: 401 });
  }
}

function getServiceAccountCreds() {
  const client_email = process.env.GOOGLE_CLIENT_EMAIL;
  let private_key = process.env.GOOGLE_PRIVATE_KEY;
  if (!client_email || !private_key) {
    throw new Error("GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY missing");
  }
  // รองรับคีย์ที่ฝังเป็น single-line ใน ENV
  private_key = private_key.replace(/\\n/g, "\n");
  return { client_email, private_key };
}

// map ชื่อสี → colorId (Google Calendar preset)
const COLOR_NAME_TO_ID: Record<string, string> = {
  lavender: "1",
  sage: "2",
  grape: "3",
  flamingo: "4",
  banana: "5",
  tangerine: "6",
  peacock: "7",
  graphite: "8",
  blueberry: "9",
  basil: "10",
  tomato: "11",
};

function normColor(value?: string | null) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  return COLOR_NAME_TO_ID[v] ?? value; // ถ้าเป็นเลขมาแล้วก็ใช้เลขนั้น
}

function toISODateRange(start: Date, end: Date) {
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/**
 * แปลง date-only ("YYYY-MM-DD") ให้เป็น ISO ตามโซนเวลา (ง่ายๆพอใช้)
 * Google all-day จะส่ง end.date เป็นวันถัดไปแบบ exclusive อยู่แล้ว
 * ที่นี่ตั้งสมมติ 00:00 / 23:59 ตาม TZ แล้วค่อย toISOString()
 */
function toDateInTZ(dateOnly: string, tz: string, end = false): string {
  const base = end ? "T23:59:00" : "T00:00:00";
  const offset = tz === "Asia/Bangkok" ? "+07:00" : "Z";
  return new Date(`${dateOnly}${base}${offset}`).toISOString();
}

// upsert 1 event → external_calendar_events
async function upsertEvent(
  group_id: string,
  calendar_id: string,
  ev: calendar_v3.Schema$Event,
  tz = "Asia/Bangkok",
) {
  const startISO =
    ev.start?.dateTime ??
    (ev.start?.date ? toDateInTZ(ev.start.date, tz, false) : null);

  const endISO =
    ev.end?.dateTime ??
    (ev.end?.date ? toDateInTZ(ev.end.date, tz, true) : null);

  // หมายเหตุ: ถ้า lib/db ของคุณรองรับการ serialize JSON อัตโนมัติ
  // สามารถใส่ ev ตรงๆได้ หากไม่รองรับให้ใช้ JSON.stringify(ev)
  await sql/* sql */`
    insert into public.external_calendar_events(
      group_id, calendar_id, google_event_id, etag, status,
      summary, description, location, color_id,
      start_at, end_at, html_link, raw, updated_at
    ) values (
      ${group_id}, ${calendar_id}, ${ev.id}, ${ev.etag ?? null}, ${ev.status ?? null},
      ${ev.summary ?? null}, ${ev.description ?? null}, ${ev.location ?? null}, ${ev.colorId ?? null},
      ${startISO ?? null}, ${endISO ?? null}, ${ev.htmlLink ?? null}, ${ev as any}, now()
    )
    on conflict (group_id, calendar_id, google_event_id) do update set
      etag = excluded.etag,
      status = excluded.status,
      summary = excluded.summary,
      description = excluded.description,
      location = excluded.location,
      color_id = excluded.color_id,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      html_link = excluded.html_link,
      raw = excluded.raw,
      updated_at = now()
  `;
}

/** ───────── handler ───────── */
export async function POST(req: NextRequest) {
  // ตรวจ key
  try {
    assertKey(req);
  } catch (res: any) {
    return res;
  }

  const group_id = req.nextUrl.searchParams.get("group_id");
  if (!group_id) {
    return new NextResponse("group_id required", { status: 400 });
  }

  // โหลด settings จาก calendar_configs
  const setRows = await sql/* sql */`
    select group_id,
           cal1_id, cal1_tag, cal1_color,
           cal2_id, cal2_tag, cal2_color,
           since_month, tz, last_synced_at
    from public.calendar_configs
    where group_id = ${group_id}
    limit 1
  `;

  if (!setRows.length) {
    return new NextResponse("settings not found for this group", { status: 404 });
  }

  const settings = setRows[0] as {
    cal1_id?: string | null;
    cal1_tag?: string | null;   // (ยังไม่ได้ใช้กรองในโค้ดนี้)
    cal1_color?: string | null;
    cal2_id?: string | null;
    cal2_tag?: string | null;   // (ยังไม่ได้ใช้กรองในโค้ดนี้)
    cal2_color?: string | null;
    since_month?: string | null; // date (YYYY-MM-01)
    tz?: string | null;
    last_synced_at?: string | null;
  };

  // ต้องมีอย่างน้อย 1 calendar id
  if (!settings.cal1_id && !settings.cal2_id) {
    return new NextResponse("no calendar configured for this group", { status: 400 });
  }

  // auth service account (readonly)
  let calendar: ReturnType<typeof google.calendar>;
  try {
    const { client_email, private_key } = getServiceAccountCreds();
    const scopes = ["https://www.googleapis.com/auth/calendar.readonly"];
    const auth = new google.auth.JWT({ email: client_email, key: private_key, scopes });
    calendar = google.calendar({ version: "v3", auth });
  } catch (e: any) {
    return new NextResponse(`google auth error: ${e?.message ?? e}`, { status: 500 });
  }

  // กำหนดช่วงเวลา
  const tz = settings.tz || "Asia/Bangkok";
  // ถ้ามี since_month ให้ถือว่าเป็นวันแรกของเดือนนั้น (UTC-safe)
  const since = settings.since_month
    ? new Date(settings.since_month) // ex: "2025-09-01"
    : new Date("2025-09-01T00:00:00+07:00"); // default: กันยายน 2568 ตามโจทย์

  const now = new Date();
  // เผื่ออนาคตอีก 6 เดือน (ตั้งเป็นวันแรกของเดือนที่ n+6)
  const plus6 = new Date(now.getFullYear(), now.getMonth() + 6, 1);

  const { timeMin, timeMax } = toISODateRange(since, plus6);

  // สีที่อยากกรอง (ชื่อหรือเลขก็ได้)
  const cal1Color = normColor(settings.cal1_color);
  const cal2Color = normColor(settings.cal2_color);

  const calendars: Array<{ id: string; color?: string | null }> = [];
  if (settings.cal1_id) calendars.push({ id: settings.cal1_id, color: cal1Color });
  if (settings.cal2_id) calendars.push({ id: settings.cal2_id, color: cal2Color });

  let total = 0;

  for (const { id: calId, color } of calendars) {
    let pageToken: string | undefined;

    try {
      do {
        const resp = await calendar.events.list({
          calendarId: calId,
          singleEvents: true,
          orderBy: "startTime",
          timeMin,
          timeMax,
          pageToken,
          showDeleted: false,
          maxResults: 2500,
        });

        const events = resp.data.items ?? [];
        for (const ev of events) {
          // ถ้ากำหนดกรองสี: ต้องมี ev.colorId และต้องตรง
          if (color && ev.colorId && ev.colorId !== color) continue;
          await upsertEvent(group_id, calId, ev, tz);
          total++;
        }

        pageToken = resp.data.nextPageToken || undefined;
      } while (pageToken);
    } catch (e: any) {
      // ไม่ให้ทั้งงานล้มเพราะ calendar เดียวพัง — ใส่รายละเอียดใน payload กลับ
      return NextResponse.json(
        {
          ok: false,
          error: `fetch events failed for calendarId=${calId}: ${e?.message ?? e}`,
          group_id,
          partial_total: total,
          timeMin,
          timeMax,
          tz,
        },
        { status: 502 },
      );
    }
  }

  // อัปเดต last_synced_at
  await sql/* sql */`
    update public.calendar_configs
    set last_synced_at = now(), updated_at = now()
    where group_id = ${group_id}
  `;

  return NextResponse.json({ ok: true, group_id, total, timeMin, timeMax, tz });
}
