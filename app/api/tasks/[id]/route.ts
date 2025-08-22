export const runtime = 'nodejs';
import { sql } from '@vercel/postgres';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json();
  const { rows } = await sql`
    update public.tasks set
      title      = coalesce(${b.title}, title),
      description= coalesce(${b.description}, description),
      due_at     = coalesce(${b.due_at}, due_at),
      status     = coalesce(${b.status}, status),
      progress   = coalesce(${b.progress}::int, progress),
      updated_at = now()
    where id = ${params.id}
    returning *`;
  return rows.length ? Response.json(rows[0]) : new Response('not found', { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await sql`delete from public.tasks where id=${params.id}`;
  return new Response('ok');
}
