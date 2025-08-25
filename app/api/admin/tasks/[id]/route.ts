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

export async function PATCH(req: Request, { params }: any) {
  if (!ok(req)) return new Response("forbidden", { status: 403 });
  const id = params.id;
  const b  = await req.json();

  const rows = await sql/* sql */`
    update public.tasks set
      title       = coalesce(${b.title}, title),
      description = coalesce(${b.description}, description),
      due_at      = coalesce(${tzDate(b.due_at)}, due_at),
      status      = coalesce(${b.status}, status),
      progress    = coalesce(${b.progress}::int, progress),
      updated_at  = now()
    where id=${id}
    returning *`;
  return rows.length ? Response.json(rows[0]) : new Response("not found", { status: 404 });
}

export async function DELETE(req: Request, { params }: any) {
  if (!ok(req)) return new Response("forbidden", { status: 403 });
  await sql/* sql */`delete from public.tasks where id=${params.id}`;
  return new Response("ok");
}
