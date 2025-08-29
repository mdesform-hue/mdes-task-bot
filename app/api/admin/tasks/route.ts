export const runtime = "nodejs";
import { sql } from "../../../../lib/db";

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
const gen4 = () => Math.floor(Math.random() * 10000).toString().padStart(4, "0");
const normPriority = (p: any) => {
  const s = String(p ?? "").toLowerCase();
  return (["low","medium","high","urgent"] as const).includes(s as any) ? s : "medium";
};
const normTags = (t: any): string[] | null => {
  if (t == null) return null;
  if (Array.isArray(t)) return t.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof t === "string") return t.split(",").map(s => s.trim()).filter(Boolean);
  return null;
};

export async function GET(req: Request) {
  if (!ok(req)) return new Response("forbidden", { status: 403 });
  const url = new URL(req.url);
  const gid = url.searchParams.get("group_id");
  const q   = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 200);

  if (!gid) return new Response("group_id required", { status: 400 });

  const rows = q
    ? await sql/* sql */`
        select *
        from public.tasks
        where group_id=${gid} and (title ilike ${'%' + q + '%'} or code ilike ${'%' + q + '%'})
        order by coalesce(due_at, now()+interval '10 years') asc
        limit ${limit}`
    : await sql/* sql */`
        select *
        from public.tasks
        where group_id=${gid}
        order by coalesce(due_at, now()+interval '10 years') asc
        limit ${limit}`;

  return Response.json(rows);
}

export async function POST(req: Request) {
  if (!ok(req)) return new Response("forbidden", { status: 403 });
  const b = await req.json();

  const group_id    = b?.group_id;
  const title       = b?.title;
  const description = b?.description ?? null;
  const due_at      = tzDate(b?.due_at);
  const priority    = normPriority(b?.priority);
  const tags        = normTags(b?.tags);

  if (!group_id || !title) return new Response("bad request", { status: 400 });

  await sql/* sql */`insert into public.groups(id) values(${group_id}) on conflict (id) do nothing`;

  let code = gen4();
  let row: any;
  for (let i = 0; i < 25; i++) {
    try {
      const r = await sql/* sql */`
        insert into public.tasks (group_id, code, title, description, due_at, priority, tags)
        values (${group_id}, ${code}, ${title}, ${description}, ${due_at}, ${priority}::task_priority, ${tags})
        returning *`;
      row = r[0];
      break;
    } catch (e: any) {
      if (String(e?.message ?? e).includes("duplicate key")) { code = gen4(); continue; }
      throw e;
    }
  }
  if (!row) return new Response("cannot allocate code", { status: 500 });
  return Response.json(row);
}
