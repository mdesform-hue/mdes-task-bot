// app/api/admin/calendar-settings/route.ts
import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// ---- guard ----
function assertKey(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    throw new Response("unauthorized", { status: 401 });
  }
}

export async function GET(req: NextRequest) {
  try {
    assertKey(req);
  } catch (res: any) { return res; }

  const group_id = req.nextUrl.searchParams.get("group_id");
  if (!group_id) return new Response("group_id required", { status: 400 });

  const rows = await sql/* sql */`
    select group_id, cal1_id, cal1_tag, cal1_color,
           cal2_id, cal2_tag, cal2_color,
           since_month, tz, last_sync_at, created_at, updated_at
    from public.calendar_configs
    where group_id=${group_id}
    limit 1`;

  return Response.json(rows[0] ?? null);
}

export async function PUT(req: NextRequest) {
  try {
    assertKey(req);
  } catch (res: any) { return res; }

  let body: any;
  try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }

  const {
    group_id,
    cal1_id, cal1_tag, cal1_color,
    cal2_id, cal2_tag, cal2_color,
    since_month, tz
  } = body || {};

  if (!group_id) return new Response("group_id required", { status: 400 });

  // ensure group exists
  await sql/* sql */`
    insert into public.groups(id) values (${group_id})
    on conflict (id) do nothing`;

  const rows = await sql/* sql */`
    insert into public.calendar_configs (
      group_id, cal1_id, cal1_tag, cal1_color,
      cal2_id, cal2_tag, cal2_color,
      since_month, tz, updated_at
    ) values (
      ${group_id}, ${cal1_id ?? null}, ${cal1_tag ?? 'CAL1'}, ${cal1_color ?? null},
      ${cal2_id ?? null}, ${cal2_tag ?? 'CAL2'}, ${cal2_color ?? null},
      ${since_month ?? null}, ${tz ?? 'Asia/Bangkok'}, now()
    )
    on conflict (group_id) do update set
      cal1_id=excluded.cal1_id,
      cal1_tag=excluded.cal1_tag,
      cal1_color=excluded.cal1_color,
      cal2_id=excluded.cal2_id,
      cal2_tag=excluded.cal2_tag,
      cal2_color=excluded.cal2_color,
      since_month=excluded.since_month,
      tz=excluded.tz,
      updated_at=now()
    returning *`;

  return Response.json(rows[0]);
}
