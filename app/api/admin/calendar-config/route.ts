export const runtime = "nodejs";

import { sql } from "@/lib/db";

// ใช้ query ?group_id=...&key=...
function guard(params: URLSearchParams) {
  const group_id = params.get("group_id") || "";
  const key = params.get("key") || "";
  if (!group_id || !key) throw new Error("missing group_id or key");
  if (key !== process.env.ADMIN_KEY) throw new Error("invalid admin key");
  return { group_id };
}

// GET: อ่าน config
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const { group_id } = guard(url.searchParams);

    const rows = await sql/* sql */`
      select group_id, cal1_id, cal1_tag, cal2_id, cal2_tag, last_synced_at
      from public.calendar_configs
      where group_id=${group_id}
      limit 1`;

    return Response.json(rows[0] ?? { group_id, cal1_id: null, cal1_tag: "CAL1", cal2_id: null, cal2_tag: "CAL2", last_synced_at: null });
  } catch (e: any) {
    return new Response(String(e?.message ?? e), { status: 400 });
  }
}

// PUT: บันทึก/อัปเดต config
export async function PUT(req: Request) {
  try {
    const url = new URL(req.url);
    const { group_id } = guard(url.searchParams);
    const body = await req.json().catch(() => ({}));

    const cal1_id = (body.cal1_id ?? null) as string | null;
    const cal1_tag = (body.cal1_tag ?? "CAL1") as string;
    const cal2_id = (body.cal2_id ?? null) as string | null;
    const cal2_tag = (body.cal2_tag ?? "CAL2") as string;

    // ensure group exists
    await sql/* sql */`
      insert into public.groups(id) values (${group_id})
      on conflict (id) do nothing`;

    const rows = await sql/* sql */`
      insert into public.calendar_configs (group_id, cal1_id, cal1_tag, cal2_id, cal2_tag)
      values (${group_id}, ${cal1_id}, ${cal1_tag}, ${cal2_id}, ${cal2_tag})
      on conflict (group_id) do update
      set cal1_id=${cal1_id}, cal1_tag=${cal1_tag}, cal2_id=${cal2_id}, cal2_tag=${cal2_tag}
      returning group_id, cal1_id, cal1_tag, cal2_id, cal2_tag, last_synced_at`;

    return Response.json(rows[0]);
  } catch (e: any) {
    return new Response(String(e?.message ?? e), { status: 400 });
  }
}
