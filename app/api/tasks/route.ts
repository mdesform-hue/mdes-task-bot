export const runtime = 'nodejs';
import { sql } from '../../../lib/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gid = url.searchParams.get('group_id');
  const limit = Number(url.searchParams.get('limit') ?? 50);

  const rows = gid
    ? await sql/* sql */`
        select *
        from public.tasks
        where group_id = ${gid}
        order by coalesce(due_at, now()+interval '10 years') asc
        limit ${limit}`
    : await sql/* sql */`
        select *
        from public.tasks
        order by coalesce(due_at, now()+interval '10 years') asc
        limit ${limit}`;

  return Response.json({ items: rows });
}

export async function POST(req: Request) {
  const b = await req.json();
  const group_id = b?.group_id;
  const title = b?.title;
  const description = b?.description ?? null;
  const due_raw = b?.due_at ?? null;

  if (!group_id || !title) return new Response('bad request', { status: 400 });

  // ensure group exists
  await sql/* sql */`insert into public.groups(id) values(${group_id}) on conflict (id) do nothing`;

  // parse due_at: รองรับ 'YYYY-MM-DD' (ตีเป็นเวลาไทย 00:00) หรือ ISO
  const toISO = (v: any) => {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(`${v}T00:00:00+07:00`).toISOString();
    }
    return new Date(v).toISOString();
  };
  const due_at = toISO(due_raw);

  // gen code 4 หลัก (unique ต่อ group) + retry เมื่อชน
  const gen4 = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  let code = gen4();
  let created: any | null = null;

  for (let i = 0; i < 25; i++) {
    try {
      const rows = await sql/* sql */`
        insert into public.tasks (group_id, code, title, description, due_at)
        values (${group_id}, ${code}, ${title}, ${description}, ${due_at})
        returning id, code, title, description, due_at, status, progress, group_id, created_at, updated_at`;
      created = rows[0];
      break;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('tasks_group_code_uq') || msg.includes('duplicate key value')) {
        code = gen4(); // ชน → สุ่มใหม่
        continue;
      }
      throw e; // error อื่น ๆ
    }
  }

  if (!created) return new Response('failed to allocate 4-digit code', { status: 500 });
  return Response.json(created);
}
