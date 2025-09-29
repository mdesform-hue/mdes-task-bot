// app/api/admin/calendar-sync/route.ts
import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { google } from "googleapis";

export const runtime = "nodejs";

/** ───────── helpers ───────── */
function assertKey(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    throw new Response("unauthorized", { status: 401 });
  }
}

function getServiceAccountAuth() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error("GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY missing");
  }
  // เผื่อคีย์ถูกเก็บด้วย \n
  privateKey = privateKey.replace(/\\n/g, "\n");
  return new google.auth.JWT(
    clientEmail,
    undefined,
    privateKey,
    ["https://www.googleapis.com/auth/calendar.readonly"]
  );
}

/** แปลงช่วงเวลา */
function toISODateRange(start: Date, end: Date) {
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/** upsert เข้า public.tasks โดยใช้กุญแจ (group_id, external_source, external_id) */
async function upsertTaskFromEvent(params: {
  group_id: string;
  calendar_id: string;
  tag: string;
  ev: any;
}) {
  const { group_id, calendar_id, tag, ev } = params;

  const startISO =
    ev.start?.dateTime ??
    (ev.start?.date ? `${ev.start.date}T00:00:00+07:00` : null);
  const endISO =
    ev.end?.dateTime ??
    (ev.end?.date ? `${ev.end.date}T23:59:00+07:00` : null);

  // ใช้ start เป็น due_at (พอสำหรับแสดงในปฏิทินงาน)
  const dueAt = startISO ?? endISO ?? null;

  // สร้าง code แบบคงที่จาก event.id (4 ตัวอักษรแรกของ md5)
  // หมายเหตุ: ใน on conflict เราจะไม่แตะ code เดิม
  await sql/* sql */`
    insert into public.tasks (
      group_id, title, description, due_at,
      progress, status, code, priority, tags,
      external_source, external_id, external_ref,
      created_at, updated_at
    )
    values (
      ${group_id},
      ${ev.summary ?? "(no title)"},
      ${ev.description ?? null},
      ${dueAt},
      0, 'todo',
      substring(md5(${ev.id}) from 1 for 4),
      'medium',
      array[${tag}]::text[],
      'google_calendar', ${ev.id}, ${calendar_id},
      now(), now()
    )
    on conflict (group_id, external_source, external_id) do update set
      title       = excluded.title,
      description = excluded.description,
      due_at      = excluded.due_at,
      -- รวม tag เดิมกับ tag ใหม่ และลดซ้ำ
      tags = (
        select array_agg(distinct x)
        from unnest(coalesce(public.tasks.tags, '{}')::text[] || excluded.tags) as t(x)
      ),
      updated_at  = now()
  `;
}

/** ───────── handler ───────── */
export async function POST(req: NextRequest) {
  try { assertKey(req); } catch (res: any) { return res; }

  const group_id = req.nextUrl.searchParams.get("group_id");
  if (!group_id) return new Response("group_id required", { status: 400 });

  // โหลด settings จาก public.calendar_configs
  const setRows = await sql/* sql */`
    select group_id, cal1_id, cal1_tag, cal2_id, cal2_tag, fetch_from, last_synced_at
    from public.calendar_configs
    where group_id = ${group_id}
    limit 1
  `;
  if (!setRows.length) {
    return new Response("settings not found for this group", { status: 404 });
  }
  const settings = setRows[0] as {
    group_id: string;
    cal1_id: string | null;
    cal1_tag: string | null;
    cal2_id: string | null;
    cal2_tag: string | null;
    fetch_from: string | null;        // date
    last_synced_at: string | null;
  };

  // auth (Service Account)
  const auth = getServiceAccountAuth();
  const calendar = google.calendar({ version: "v3", auth });

  // กำหนดช่วงเวลา: ตั้งแต่ fetch_from (ถ้ามี) ไม่งั้นเริ่ม 2025-09-01 → ถึงอีก 6 เดือนข้างหน้า
  const start = settings.fetch_from
    ? new Date(settings.fetch_from + "T00:00:00+07:00")
    : new Date("2025-09-01T00:00:00+07:00");
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 6, 1);
  const { timeMin, timeMax } = toISODateRange(start, end);

  // เตรียมรายการปฏิทินที่ต้องดึง พร้อม tag
  const calendars: Array<{ id: string; tag: string }> = [];
  if (settings.cal1_id) calendars.push({ id: settings.cal1_id, tag: settings.cal1_tag || "CAL1" });
  if (settings.cal2_id) calendars.push({ id: settings.cal2_id, tag: settings.cal2_tag || "CAL2" });
  if (!calendars.length) {
    return new Response("no calendars configured for this group", { status: 400 });
  }

  // ดึง event และ upsert เป็น tasks
  let total = 0;
  for (const { id: calId, tag } of calendars) {
    let pageToken: string | undefined = undefined;
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
        await upsertTaskFromEvent({ group_id, calendar_id: calId, tag, ev });
        total++;
      }

      pageToken = resp.data.nextPageToken || undefined;
    } while (pageToken);
  }

  // อัปเดตเวลาซิงค์ล่าสุด
  await sql/* sql */`
    update public.calendar_configs
    set last_synced_at = now(), updated_at = now()
    where group_id = ${group_id}
  `;

  return Response.json({ ok: true, group_id, total, timeMin, timeMax });
}
