export const runtime = 'nodejs';
import { sql } from '@vercel/postgres';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gid = url.searchParams.get('group_id');
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const { rows } = gid
    ? await sql`select * from public.tasks
                where group_id=${gid}
                order by coalesce(due_at, now()+interval '10 years') asc
                limit ${limit}`
    : await sql`select * from public.tasks
                order by coalesce(due_at, now()+interval '10 years') asc
                limit ${limit}`;
  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const b = await req.json();
  if (!b?.group_id || !b?.title) return new Response('bad request', { status: 400 });
  await sql`insert into public.groups(id) values(${b.group_id})
            on conflict (id) do nothing`;
  const { rows } = await sql`
    insert into public.tasks (group_id, title, description, due_at)
    values (${b.group_id}, ${b.title}, ${b.description ?? null}, ${b.due_at ?? null})
    returning *`;
  return Response.json(rows[0]);
}
