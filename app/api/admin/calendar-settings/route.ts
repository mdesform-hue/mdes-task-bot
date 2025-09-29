// app/api/admin/calendar-settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// ---------- helpers ----------
function assertKey(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    throw new NextResponse("unauthorized", { status: 401 });
  }
}

function normNonEmpty(value: unknown): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

// YYYY-MM-01 เท่านั้น (optional)
function validateSinceMonth(v: unknown): string | null {
  const s = normNonEmpty(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-01$/.test(s)) {
    throw new NextResponse("since_month must be 'YYYY-MM-01'", { status: 400 });
  }
  return s;
}

// ---------- GET ----------
export async function GET(req: NextRequest) {
  try {
    assertKey(req);
  } catch (res: any) { return res; }

  const group_id = req.nextUrl.searchParams.get("group_id");
  if (!group_id) return new NextResponse("group_id required", { status: 400 });

  const rows = await sql/* sql */`
    select group_id, cal1_id, cal1_tag, cal1_color,
           cal2_id, cal2_tag, cal2_color,
           since_month, tz, last_synced_at, created_at, updated_at
    from public.calendar_configs
    where group_id = ${group_id}
    limit 1
  `;

  // ถ้าอยากให้ชัดเจนว่าไม่มีให้ตอบ 404 ก็เปลี่ยนเป็น:
  // if (!rows.length) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(rows[0] ?? null);
}

// ---------- PUT ----------
type CalendarSettings = {
  group_id: string;
  cal1_id?: string | null;
  cal1_tag?: string | null;
  cal1_color?: string | null;
  cal2_id?: string | null;
  cal2_tag?: string | null;
  cal2_color?: string | null;
  since_month?: string | null;
  tz?: string | null;
};

export async function PUT(req: NextRequest) {
  try {
    assertKey(req);
  } catch (res: any) { return res; }

  let body: Partial<CalendarSettings>;
  try {
    body = (await req.json()) as Partial<CalendarSettings>;
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const group_id = normNonEmpty(body.group_id);
  if (!group_id) return new NextResponse("group_id required", { status: 400 });

  // sanitize + defaults
  const cal1_id = normNonEmpty(body.cal1_id);
  const cal1_tag = normNonEmpty(body.cal1_tag) ?? "CAL1";
  const cal1_color = normNonEmpty(body.cal1_color);

  const cal2_id = normNonEmpty(body.cal2_id);
  const cal2_tag = normNonEmpty(body.cal2_tag) ?? "CAL2";
  const cal2_color = normNonEmpty(body.cal2_color);

  const since_month = validateSinceMonth(body.since_month);
  const tz = normNonEmpty(body.tz) ?? "Asia/Bangkok";

  // ensure group exists
  await sql/* sql */`
    insert into public.groups(id) values (${group_id})
    on conflict (id) do nothing
  `;

  const rows = await sql/* sql */`
    insert into public.calendar_configs (
      group_id, cal1_id, cal1_tag, cal1_color,
      cal2_id, cal2_tag, cal2_color,
      since_month, tz, updated_at
    ) values (
      ${group_id}, ${cal1_id}, ${cal1_tag}, ${cal1_color},
      ${cal2_id}, ${cal2_tag}, ${cal2_color},
      ${since_month}, ${tz}, now()
    )
    on conflict (group_id) do update set
      cal1_id = excluded.cal1_id,
      cal1_tag = excluded.cal1_tag,
      cal1_color = excluded.cal1_color,
      cal2_id = excluded.cal2_id,
      cal2_tag = excluded.cal2_tag,
      cal2_color = excluded.cal2_color,
      since_month = excluded.since_month,
      tz = excluded.tz,
      updated_at = now()
    returning *
  `;

  return NextResponse.json(rows[0]);
}
