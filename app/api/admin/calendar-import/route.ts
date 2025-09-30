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
    // โหลด config เพื่อ map calendar_id -> tag
    const cfgRows = await sql/* sql */`
      select group_id, cal1_id, cal1_tag, cal2_id, cal2_tag
      from public.calendar_configs
      where group_id = ${group_id}
      limit 1
    `;
    if (!cfgRows.length) {
      return new NextResponse("settings not found for this group", { status: 404 });
    }
    const cfg = cfgRows[0] as {
      cal1_id?: string | null; cal1_tag?: string | null;
      cal2_id?: string | null; cal2_tag?: string | null;
    };

    const cal1Id = (cfg.cal1_id || "").trim();
    const cal2Id = (cfg.cal2_id || "").trim();
    const cal1Tag = (cfg.cal1_tag || "CAL1").trim();
    const cal2Tag = (cfg.cal2_tag || "CAL2").trim();

    // ดึงจาก mirror เฉพาะสีที่ต้องการ (Flamingo = '4')
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

      // map tag ตาม calendar_id ต้นทาง
      let tag = "CAL";
      if (cal1Id && ev.calendar_id === cal1Id) tag = cal1Tag;
      else if (cal2Id && ev.calendar_id === cal2Id) tag = cal2Tag;

      if (sample.length < 3) {
        sample.push({
          code, title, dueAt, colorId: ev.color_id, calendar_id: ev.calendar_id, tag
        });
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
            ${[tag]},             -- << ใส่ tag ตาม cal1/cal2
            ${'gcal'},
            ${ev.google_event_id},
            ${ev.calendar_id}
          )
          on conflict (group_id, code) do update set
            title = excluded.title,
            description = excluded.description,
            due_at = excluded.due_at,
            tags = excluded.tags,           -- อัปเดต tag หากเปลี่ยนปฏิทิน
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
