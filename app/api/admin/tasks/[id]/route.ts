export const runtime = "nodejs";
import { sql } from "../../../../../lib/db";

function ok(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("key") ?? req.headers.get("x-admin-key");
  return k && process.env.ADMIN_KEY && k === process.env.ADMIN_KEY;
}
const tzDate = (v: any) => {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T00:00:00+07:00`).toISOString();
  }
  return new Date(v).toISOString();
};
const normPriority = (p: any) => {
  const s = String(p ?? "").toLowerCase();
  return (["low","medium","high","urgent"] as const).includes(s as any) ? s : null;
};
const normTags = (t: any): string[] | null => {
  if (t == null) return null;
  if (Array.isArray(t)) return t.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof t === "string") return t.split(",").map(s => s.trim()).filter(Boolean);
  return null;
};

export async function PATCH(req: Request, { params }: any) {
  if (!ok(req)) return new Response("forbidden", { status: 403 });
  const id = params.id;
  const b  = await req.json();

  const due_at   = tzDate(b?.due_at);
  const priority = normPriority(b?.priority);
  const tags     = normTags(b?.tags);

  const rows = await sql/* sql */`
    update public.tasks set
      title       = coalesce(${b.title}, title),
      description = coalesce(${b.description}, description),
      due_at      = coalesce(${due_at}, due_at),
      status      = coalesce(${b.status}, status),
      progress    = coalesce(${b.progress}::int, progress),
      priority    = coalesce(${priority}::task_priority, priority),
      tags        = coalesce(${tags}, tags),
      updated_at  = now()
    where id = ${id}
    returning *`;

  return rows.length ? Response.json(rows[0]) : new Response("not found", { status: 404 });
}

export async function DELETE(req: Request, { params }: any) {
  if (!ok(req)) return new Response("forbidden", { status: 403 });
  await sql/* sql */`delete from public.tasks where id=${params.id}`;
  return new Response("ok");
}
