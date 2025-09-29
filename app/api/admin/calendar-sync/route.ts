import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { google, calendar_v3 } from "googleapis";

export const runtime = "nodejs";

/* helpers */
function assertKey(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    throw new NextResponse("unauthorized", { status: 401 });
  }
}
function getServiceAccountCreds() {
  const client_email = process.env.GOOGLE_CLIENT_EMAIL;
  let private_key = process.env.GOOGLE_PRIVATE_KEY;
  if (!client_email || !private_key) throw new Error("GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY missing");
  private_key = private_key.replace(/\\n/g, "\n");
  return { client_email, private_key };
}
function toDateInTZ(dateOnly: string, tz: string, end = false): string {
  const base = end ? "T23:59:00" : "T00:00:00";
  const offset = tz === "Asia/Bangkok" ? "+07:00" : "Z";
  return new Date(`${dateOnly}${base}${offset}`).toISOString();
}
async function upsertEvent(group_id: string, calendar_id: string, ev: calendar_v3.Schema$Event, tz = "Asia/Bangkok") {
  const startISO = ev.start?.dateTime ?? (ev.start?.date ? toDateInTZ(ev.start.date, tz, false) : null);
  const endISO   = ev.end?.dateTime   ?? (ev.end?.date   ? toDateInTZ(ev.end.date, tz, true)   : null);

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

/* handler */
export async function POST(req: NextRequest) {
  try { assertKey(req); } catch (res: any) { return res; }

  const url = new URL(req.url);
  const group_id = url.searchParams.get("group_id");
  if (!group_id) return new NextResponse("group_id required", { status: 400 });

  // debug flags
  const isDebug = url.searchParams.get("debug") === "1";
  const calOverride = url.searchParams.get("cal_id") || undefined;
  const sinceOverride = url.searchParams.get("since") || undefined; // YYYY-MM-01

  try {
    // โหลด settings ให้ตรงสคีมา "fetch_from" (ไม่มี cal*_color)
    const rows = await sql/* sql */`
      select group_id,
             cal1_id, cal1_tag,
             cal2_id, cal2_tag,
             fetch_from, tz, last_synced_at
      from public.calendar_configs
      where group_id = ${group_id}
      limit 1
    `;
    if (!rows.length) return new NextResponse("settings not found for this group", { status: 404 });

    const settings = rows[0] as {
      cal1_id?: string | null; cal1_tag?: string | null;
      cal2_id?: string | null; cal2_tag?: string | null;
      fetch_from?: string | null; tz?: string | null;
    };

    // auth
    const { client_email, private_key } = getServiceAccountCreds();
    const auth = new google.auth.JWT({
      email: client_email, key: private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
    const gcal = google.calendar({ version: "v3", auth });

    // ช่วงเวลา: ใช้ sinceOverride > fetch_from > default
    const tz = settings.tz || "Asia/Bangkok";
    const since = sinceOverride
      ? new Date(`${sinceOverride}T00:00:00+07:00`)
      : (settings.fetch_from ? new Date(`${settings.fetch_from}T00:00:00+07:00`) : new Date("2025-09-01T00:00:00+07:00"));
    const now = new Date();
    const plus6 = new Date(now.getFullYear(), now.getMonth() + 6, 1);
    const timeMin = since.toISOString();
    const timeMax = plus6.toISOString();

    // calendars (ไม่มี color filter)
    const calendars: Array<{ id: string; tag: string }> = [];
    if (calOverride) {
      calendars.push({ id: calOverride, tag: "OVERRIDE" });
    } else {
      if (settings.cal1_id) calendars.push({ id: settings.cal1_id, tag: settings.cal1_tag ?? "CAL1" });
      if (settings.cal2_id) calendars.push({ id: settings.cal2_id, tag: settings.cal2_tag ?? "CAL2" });
    }
    if (!calendars.length) {
      return NextResponse.json({ ok: false, error: "no calendar configured", group_id }, { status: 400 });
    }

    const diag: Array<{ calendarId: string; fetched: number; kept: number; sample: any[] }> = [];
    let total = 0;

    for (const { id: calId } of calendars) {
      let pageToken: string | undefined;
      let fetched = 0, kept = 0;
      const sample: any[] = [];

      do {
        const { data } = await gcal.events.list({
          calendarId: calId,
          singleEvents: true,
          orderBy: "startTime",
          timeMin, timeMax, pageToken,
          showDeleted: false,
          maxResults: 2500,
        });

        const events = (data.items ?? []) as calendar_v3.Schema$Event[];
        fetched += events.length;

        for (const ev of events) {
          kept++;
          if (sample.length < 3) {
            const s = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date} (all-day)` : null);
            const e = ev.end?.dateTime   ?? (ev.end?.date   ? `${ev.end.date} (all-day)`   : null);
            sample.push({ id: ev.id ?? null, summary: ev.summary ?? null, start: s, end: e, status: ev.status ?? null });
          }
          if (!isDebug) {
            await upsertEvent(group_id, calId, ev, tz);
            total++;
          }
        }

        pageToken = data.nextPageToken || undefined;
      } while (pageToken);

      diag.push({ calendarId: calId, fetched, kept, sample });
    }

    if (isDebug) {
      return NextResponse.json({ ok: true, mode: "debug", group_id, timeMin, timeMax, tz, calendars: diag });
    }

    await sql/* sql */`
      update public.calendar_configs
      set last_synced_at = now(), updated_at = now()
      where group_id = ${group_id}
    `;

    return NextResponse.json({ ok: true, group_id, total, timeMin, timeMax, tz, calendars: diag });
  } catch (e: any) {
    const status = e?.response?.status ?? 500;
    const body = e?.response?.data?.error ?? null;
    return new NextResponse(
      JSON.stringify({
        ok: false,
        where: "handler",
        error: body?.message || e?.message || String(e),
        status,
        details: body ?? null,
      }),
      { status, headers: { "content-type": "application/json" } },
    );
  }
}
