// app/api/admin/calendar-import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { google, calendar_v3 } from "googleapis";

export const runtime = "nodejs";

// ----- guard -----
function assertKey(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    throw new NextResponse("unauthorized", { status: 401 });
  }
}

// แปลง private key ที่มี \n ใน ENV
function getJwtAuth() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  if (!email || !rawKey) {
    throw new Error("Missing GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY");
  }
  const key = rawKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

// สร้าง code ที่ deterministic จาก eventId (กันซ้ำในกลุ่ม)
function codeFromEventId(evId: string) {
  return "GCAL-" + evId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

// แปลง all-day ให้เป็น ISO แบบโซนไทย
function dateOnlyToISO(dateOnly: string, end = false) {
  // Asia/Bangkok +07:00
  const t = end ? "T23:59:00+07:00" : "T00:00:00+07:00";
  return new Date(`${dateOnly}${t}`).toISOString();
}

export async function POST(req: NextRequest) {
  // 0) guard
  try {
    assertKey(req);
  } catch (res: any) {
    return res;
  }

  const group_id = req.nextUrl.searchParams.get("group_id");
  if (!group_id) return new NextResponse("group_id required", { status: 400 });

  try {
    // 1) อ่าน config จากตารางที่มีจริง: calendar_configs
    const cfgRows = await sql/*sql*/`
      select group_id, cal1_id, cal1_tag, cal2_id, cal2_tag, fetch_from
      from public.calendar_configs
      where group_id = ${group_id}
      limit 1`;
    if (!cfgRows.length) {
      return new NextResponse("settings not found for this group", { status: 404 });
    }
    const cfg = cfgRows[0] as {
      cal1_id: string | null;
      cal1_tag: string | null;
      cal2_id: string | null;
      cal2_tag: string | null;
      fetch_from: string | null; // date (YYYY-MM-DD)
    };

    const calendars: Array<{ id: string; tag: string }> = [];
    if (cfg.cal1_id) calendars.push({ id: cfg.cal1_id, tag: cfg.cal1_tag ?? "CAL1" });
    if (cfg.cal2_id) calendars.push({ id: cfg.cal2_id, tag: cfg.cal2_tag ?? "CAL2" });
    if (calendars.length === 0) {
      return new NextResponse("no calendar configured", { status: 400 });
    }

    // 2) กำหนดช่วงเวลา: ตั้งแต่ fetch_from (หรือ 2025-09-01) → อีก 6 เดือนข้างหน้า
    const since = cfg.fetch_from
      ? new Date(`${cfg.fetch_from}T00:00:00+07:00`)
      : new Date("2025-09-01T00:00:00+07:00");
    const now = new Date();
    const until = new Date(now.getFullYear(), now.getMonth() + 6, 1);
    const timeMin = since.toISOString();
    const timeMax = until.toISOString();

    // 3) Google Calendar client (Service Account)
    const auth = getJwtAuth();
    const calendar = google.calendar({ version: "v3", auth });

    let imported = 0;

    // 4) ดึง event แล้ว import → tasks โดยตรง
    for (const { id: calId, tag } of calendars) {
      let pageToken: string | undefined;
      do {
        const { data } = await calendar.events.list({
          calendarId: calId,
          singleEvents: true,
          orderBy: "startTime",
          timeMin,
          timeMax,
          pageToken,
          showDeleted: false,
          maxResults: 2500,
        });

        const items = (data.items ?? []) as calendar_v3.Schema$Event[];

        for (const ev of items) {
          // ข้าม event ที่ถูกยกเลิก หรือไม่มี id
          if (ev.status === "cancelled" || !ev.id) continue;

          const evId = ev.id;
          const title = ev.summary?.trim() || "(ไม่มีชื่ออีเวนต์)";

          const startISO =
            ev.start?.dateTime ??
            (ev.start?.date ? dateOnlyToISO(ev.start.date, false) : null);
          const endISO =
            ev.end?.dateTime ??
            (ev.end?.date ? dateOnlyToISO(ev.end.date, true) : null);

          // ถ้าไม่มีเวลาเริ่ม ให้ข้าม (กันบันทึก task ที่กำหนด due ไม่ได้)
          if (!startISO) continue;

          // อธิบาย/ลิงก์
          const description =
            ev.htmlLink ? `${ev.htmlLink}\n\n${ev.description ?? ""}` : (ev.description ?? null);

          // code เดียวต่อ event ต่อกลุ่ม
          const code = codeFromEventId(evId);

          // เตรียม tags (array) จากปฏิทิน
          const tags: string[] = tag ? [tag] : [];

          // upsert: (group_id, code) unique
          await sql/*sql*/`
            insert into public.tasks (
              group_id, code, title, description, due_at, progress, status, priority, tags
            ) values (
              ${group_id},
              ${code},
              ${title},
              ${description},
              ${startISO},
              ${0},
              ${'todo'},
              ${'medium'},
              ${tags}
            )
            on conflict (group_id, code) do update set
              title = excluded.title,
              description = excluded.description,
              due_at = excluded.due_at,
              updated_at = now()
          `;

          imported++;
        }

        pageToken = data.nextPageToken || undefined;
      } while (pageToken);
    }

    // 5) อัปเดต stamp
    await sql/*sql*/`
      update public.calendar_configs
      set last_synced_at = now(), updated_at = now()
      where group_id = ${group_id}
    `;

    return NextResponse.json({ ok: true, group_id, imported, timeMin, timeMax });
  } catch (e: any) {
    return new NextResponse(`Error: ${e?.message || e}`, { status: 500 });
  }
}
