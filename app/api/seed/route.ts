export const runtime = 'nodejs';
import { sql } from '../../../../lib/db';

export async function GET() {
  const rows = await sql/* sql */`
    insert into public.tasks (group_id, title)
    values ('demo', 'งานตัวอย่างจาก /api/tasks/seed')
    returning *`;
  return Response.json(rows[0]);
}
