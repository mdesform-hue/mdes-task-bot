import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// ----- guard -----
function assertKey(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    throw new Response("unauthorized", { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertKey(req);
  } catch (res: any) {
    return res;
  }

  const group_id = req.nextUrl.searchParams.get("group_id");
  if (!group_id) return new Response("group_id required", { status: 400 });

  // default เอาเฉพาะ Flamingo = "4"
  const colorId = (req.nextUrl.searchParams.get("colorId") || "4").trim();

  try {
    const events = await sql/*sql*/`
      select calendar_id, google_event_id, summary, description, start_at, end_at, html_link, color_id
      from public.external_calendar_events
      where group_id = ${group_id} and color_id = ${colorId}
      order by coalesce(start_at, end_at) asc nulls last
      limit 2000
    `;

    let imported = 0;
    for (const ev of events) {
      const code = "GCAL-" + ev.google_event_id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);

      await sql/*sql*/`
        insert into public.tasks (group_id, code, title, description, due_at, progress, status, priority, tags, external_source, external_id, external_ref)
        values (
          ${group_id},
          ${code},
          ${ev.summary || "(ไม่มีชื่ออีเวนต์)"},
          ${ev.html_link ? `${ev.html_link}\n\n${ev.description ?? ""}` : ev.description ?? null},
          ${ev.start_at},
          0,
          'todo',
          'medium',
          ARRAY['calendar'],
          'google_calendar',
          ${ev.google_event_id},
          ${ev.calendar_id}
        )
        on conflict (group_id, code) do update set
          title = excluded.title,
          description = excluded.description,
          due_at = excluded.due_at,
          updated_at = now()
      `;
      imported++;
    }

    return Response.json({ ok: true, group_id, imported, colorId });
  } catch (e: any) {
    return Response.json(
      { ok: false, where: "import", error: e?.message || e },
      { status: 500 }
    );
  }
}
