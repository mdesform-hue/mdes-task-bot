export const runtime = 'nodejs';
import { sql } from '../../../../lib/db';

// ใช้ context:any แทนการกำหนด type เคร่ง เพื่อหลบ error "invalid DELETE export"
export async function PATCH(req: Request, context: any) {
  const { id } = context.params as { id: string };
  const b = await req.json();

  const rows = await sql/* sql */`
    update public.tasks set
      title       = coalesce(${b.title}, title),
      description = coalesce(${b.description}, description),
      due_at      = coalesce(${b.due_at}, due_at),
      status      = coalesce(${b.status}, status),
      progress    = coalesce(${b.progress}::int, progress),
      updated_at  = now()
    where id = ${id}
    returning *`;
  return rows.length ? Response.json(rows[0]) : new Response('not found', { status: 404 });
}

export async function DELETE(_req: Request, context: any) {
  const { id } = context.params as { id: string };
  await sql/* sql */`delete from public.tasks where id = ${id}`;
  return new Response('ok');
}
