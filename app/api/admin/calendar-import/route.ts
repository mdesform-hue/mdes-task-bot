// app/api/admin/calendar-import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/* ----- guard ----- */
function assertKey(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key !== process.env.ADMIN_KEY) {
    throw new NextResponse("unauthorized", { status: 401 });
  }
}

/* code จาก google_event_id */
function codeFromEventId(evId: string) {
  return "GCAL-" + String(evId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

export async function POST(req: NextRequest) {
  try { assertKey(req); } catch (res: any) { return res; }

  const url = new URL(req.url);
  const group_id = url.searchParams.get("group_id");
  const debug = url.searchParams.get("debug") === "1";
  // ต้องการเฉพาะ Flamingo = '4' (ให้ override ได้ผ่าน ?colorId=4)
  const colorId = (url.searchParams.get("colorId") || "4").trim();

  if (!group_id) return new NextResponse("group_id required", { status: 400 });

  try {
    const events = await sql/* sql */`
      select calendar_id, google_event_id, summary, description, start_at, end_at, html_link, color_id
      from public.external_calendar_events
      where group_id = ${group_id} and color_id = ${colorId}
      order by coalesce(start_at, end_at) asc nulls last
      limit 5000
    `;

    let imported = 0;
    const sample: any[] = [];

    for (const ev of events as any[]) {
      const code = codeFromEventId(ev.google_event_id);
      const title = ev.summary || "(ไม่มีชื่ออีเวนต์)";
      const desc  = ev.html_link ? `${ev.html_link}\n\n${ev.description ?? ""}` : (ev.description ?? null);
      const dueAt = ev.start_at ?? null;
      const tags = ['calendar']; // จะ map ตาม calendar_id เป็น CAL1/CAL2 ก็ได้

      if (sample.length < 3) {
        sample.push({ code, title, dueAt, colorId: ev.color_id, calendar_id: ev.calendar_id });
      }

      if (!debug) {
        await sql/* sql */`
          insert into public.tasks (
            group_id, code, title, description, due_at,
            progress, status, priority, tags,
            external_source, external_id, external_ref
          ) values (
            ${group_id},
            ${code},
            ${title},
            ${desc},
            ${dueAt},
            ${0},
            ${'todo'},
            ${'medium'},
            ${tags},
            ${'gcal'},
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
    }

    return NextResponse.json({
      ok: true,
      mode: debug ? "debug" : "write",
      group_id,
      colorId,
      total_read: (events as any[]).length,
      imported,
      sample
    });
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({ ok: false, where: "import", error: e?.message || String(e) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
