// app/liff/dashboard/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import Script from "next/script";

type Status = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";

type Task = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: Status;
  progress: number;
  priority: Priority;
  tags: string[] | null;
  due_at: string | null;
  group_id: string;
  created_at: string;
  updated_at: string;
};

// แชร์ key กับหน้าอื่น ๆ
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];
const readFirst = (keys: string[]): string => { try { for (const k of keys) { const v = localStorage.getItem(k); if (v) return v; } } catch {} return ""; };
const writeAll = (keys: string[], value: string) => { try { keys.forEach(k => localStorage.setItem(k, value)); } catch {} };

const STATUS_LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};
const STATUS_ORDER: Status[] = ["todo","in_progress","blocked","done","cancelled"];
const PR_ORDER: Priority[] = ["urgent","high","medium","low"];

function thDate(iso?: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { year: "2-digit", month: "2-digit", day: "2-digit" });
  } catch { return "-"; }
}
function startOfDay(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export default function LiffDashboardPage() {
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Task[]>([]);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });

  // init: URL -> localStorage -> LIFF
  useEffect(() => {
    (async () => {
      const url = new URL(location.href);
      const qsGid = url.searchParams.get("group_id");
      const qsKey = url.searchParams.get("key");
      if (qsGid) { setGroupId(qsGid); writeAll(GID_KEYS, qsGid); }
      if (qsKey) { setAdminKey(qsKey); writeAll(KEY_KEYS, qsKey); }

      if (!qsGid) { const v = readFirst(GID_KEYS); if (v) setGroupId(v); }
      if (!qsKey) { const v = readFirst(KEY_KEYS); if (v) setAdminKey(v); }

      try {
        const liff: any = (window as any).liff;
        if (!readFirst(GID_KEYS) && process.env.NEXT_PUBLIC_LIFF_ID) {
          if (liff && !liff.isInitialized?.()) await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
          if (liff?.isLoggedIn && !liff.isLoggedIn()) { liff.login(); return; }
          const ctx = liff?.getContext?.();
          if (ctx?.type === "group" && ctx.groupId) { setGroupId(ctx.groupId); writeAll(GID_KEYS, ctx.groupId); }
        }
      } catch {}
    })();
  }, []);

  async function load() {
    if (!groupId || !adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}${q?`&q=${encodeURIComponent(q)}`:""}`);
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setItems(Array.isArray(j) ? j : (j.items ?? []));
    } catch (e) {
      console.error(e);
      alert("โหลดข้อมูลไม่สำเร็จ ตรวจสอบ groupId/adminKey");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [groupId, adminKey]);

  // filter ตามเดือนที่เลือก (optional)
  const monthFiltered = useMemo(() => {
    if (!month) return items;
    const [yy, mm] = month.split("-").map(Number);
    return items.filter(t => {
      if (!t.due_at) return true; // ไม่มี due ก็ยังแสดง
      const d = new Date(t.due_at);
      return d.getFullYear() === yy && d.getMonth() === (mm - 1);
    });
  }, [items, month]);

  // สรุป KPI
  const kpi = useMemo(() => {
    const arr = monthFiltered;
    const total = arr.length;
    const done = arr.filter(t => t.status === "done").length;
    const inProgress = arr.filter(t => t.status === "in_progress").length;
    const blocked = arr.filter(t => t.status === "blocked").length;

    const today = startOfDay();
    const overdue = arr.filter(t => t.due_at && new Date(t.due_at) < today && t.status !== "done" && t.status !== "cancelled").length;
    const upcoming7 = arr.filter(t => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      return d >= today && d < addDays(today, 7);
    }).length;

    const avgProgress = total ? Math.round(arr.reduce((s, t) => s + Number(t.progress || 0), 0) / total) : 0;

    // นับตามสถานะ/ความสำคัญ
    const byStatus: Record<Status, number> = { todo:0, in_progress:0, blocked:0, done:0, cancelled:0 };
    arr.forEach(t => { byStatus[t.status]++; });
    const byPriority: Record<Priority, number> = { urgent:0, high:0, medium:0, low:0 };
    arr.forEach(t => { byPriority[t.priority]++; });

    // งานที่เลยกำหนดมากที่สุด (top 10)
    const late = arr
      .filter(t => t.due_at && new Date(t.due_at) < today && t.status !== "done" && t.status !== "cancelled")
      .map(t => ({ ...t, lateDays: Math.ceil((+today - +startOfDay(new Date(t.due_at!))) / 86400000) }))
      .sort((a,b) => b.lateDays - a.lateDays)
      .slice(0, 10);

    // งานใกล้ครบกำหนด (3 วัน)
    const near3 = arr
      .filter(t => t.due_at && new Date(t.due_at) >= today && new Date(t.due_at) < addDays(today, 3) && t.status !== "done")
      .sort((a,b) => +new Date(a.due_at!) - +new Date(b.due_at!))
      .slice(0, 10);

    return { total, done, inProgress, blocked, avgProgress, overdue, upcoming7, byStatus, byPriority, late, near3 };
  }, [monthFiltered]);

  // กราฟแท่งง่าย ๆ (div)
  function Bar({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
      <div className="mb-2">
        <div className="flex justify-between text-xs text-slate-600">
          <span>{label}{sub ? ` — ${sub}` : ""}</span>
          <span>{value}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded">
          <div className="h-full rounded bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-screen-2xl px-4 h-14 flex items-center gap-4">
          <div className="font-semibold text-slate-800">mdes-task-bot — Dashboard</div>
          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm text-slate-600">
            <a className="hover:text-slate-900" href="/liff">Tasks</a>
            <a className="hover:text-slate-900" href="/liff/kanban">Kanban</a>
            <a className="text-slate-900 border-b-2 border-emerald-500" href="/liff/dashboard">Dashboard</a>
          </nav>
          <a
            href="/liff"
            className="md:hidden ml-auto inline-flex items-center justify-center rounded px-3 py-2 bg-emerald-600 text-white"
          >
            Tasks
          </a>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-screen-2xl px-4 py-6 md:py-8">
        {/* LIFF SDK (สำหรับอ่าน groupId อัตโนมัติเมื่อเปิดใน LINE) */}
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4 mb-5">
          <div className="md:col-span-2">
            <label className="text-sm text-slate-700">Group ID</label>
            <input className="mt-1 w-full border border-slate-200 rounded px-3 py-2"
                   value={groupId} onChange={e=>setGroupId(e.target.value)} placeholder="ใส่หรือเปิดจาก LIFF" />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-slate-700">Admin Key</label>
            <input className="mt-1 w-full border border-slate-200 rounded px-3 py-2"
                   value={adminKey} onChange={e=>setAdminKey(e.target.value)} placeholder="ADMIN_KEY" />
          </div>
          <div>
            <label className="text-sm text-slate-700">เดือน</label>
            <input type="month" className="mt-1 w-full border border-slate-200 rounded px-3 py-2"
                   value={month} onChange={e=>setMonth(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <label className="text-sm text-slate-700">ค้นหา</label>
            <input className="mt-1 w-full border border-slate-200 rounded px-3 py-2"
                   value={q} onChange={e=>setQ(e.target.value)} placeholder="คำค้น, tag, @ชื่อ ฯลฯ" />
          </div>
          <div className="flex items-end gap-2">
            <button className="px-3 py-2 rounded bg-slate-800 text-white" onClick={load} disabled={loading}>
              {loading ? "กำลังโหลด..." : "รีเฟรช"}
            </button>
            <a className="px-3 py-2 rounded bg-emerald-600 text-white" href={`/liff?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`}>ไปหน้า Tasks</a>
            <a className="px-3 py-2 rounded bg-emerald-700 text-white" href={`/liff/kanban?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`}>ไปหน้า Kanban</a>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-4 mb-6">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">งานทั้งหมด</div>
            <div className="text-2xl font-semibold">{kpi.total}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">เสร็จสิ้น</div>
            <div className="text-2xl font-semibold text-emerald-700">{kpi.done}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">กำลังทำ</div>
            <div className="text-2xl font-semibold">{kpi.inProgress}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">ติดบล็อก</div>
            <div className="text-2xl font-semibold text-rose-600">{kpi.blocked}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">เลยกำหนด</div>
            <div className="text-2xl font-semibold text-red-600">{kpi.overdue}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">เฉลี่ยความคืบหน้า</div>
            <div className="text-2xl font-semibold">{kpi.avgProgress}%</div>
          </div>
        </div>

        {/* Charts (bar) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">สถานะ (จำนวนงาน)</div>
            {STATUS_ORDER.map(s => (
              <Bar key={s} value={kpi.byStatus[s]} max={Math.max(...STATUS_ORDER.map(x => kpi.byStatus[x]), 1)} label={STATUS_LABEL[s]} />
            ))}
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">ความสำคัญ (จำนวนงาน)</div>
            {PR_ORDER.map((p) => (
              <Bar key={p} value={kpi.byPriority[p]} max={Math.max(...PR_ORDER.map(x => kpi.byPriority[x]), 1)} label={p.toUpperCase()} />
            ))}
          </div>
        </div>

        {/* Lists: ใกล้กำหนด & เลยกำหนด */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">ใกล้ครบกำหนด (3 วัน)</div>
            {kpi.near3.length === 0 ? (
              <div className="text-sm text-slate-500">ไม่มีรายการ</div>
            ) : (
              <ul className="space-y-2">
                {kpi.near3.map(t => (
                  <li key={t.id} className="flex items-start justify-between gap-3 border-b last:border-0 pb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{t.title}</div>
                      <div className="text-xs text-slate-600">code {t.code} • due {thDate(t.due_at)} • {t.priority}</div>
                    </div>
                    <div className="text-sm">{t.progress ?? 0}%</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">เลยกำหนดมากสุด</div>
            {kpi.late.length === 0 ? (
              <div className="text-sm text-slate-500">ไม่มีรายการ</div>
            ) : (
              <ul className="space-y-2">
                {kpi.late.map(t => (
                  <li key={t.id} className="flex items-start justify-between gap-3 border-b last:border-0 pb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">{t.title}</div>
                      <div className="text-xs text-slate-600">code {t.code} • due {thDate(t.due_at)} • {t.priority}</div>
                    </div>
                    <div className="text-sm text-red-600 whitespace-nowrap">+{(t as any).lateDays} วัน</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          * กรองตามเดือนด้วย <b>due date</b> (รายการที่ไม่มี due จะยังถูกนับรวม)
        </div>
      </main>
    </div>
  );
}
