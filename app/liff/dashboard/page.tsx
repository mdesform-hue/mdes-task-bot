// app/liff/dashboard/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from "recharts";

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

/* ---- localStorage keys (เหมือนไฟล์เดิม) ---- */
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];
const readFirst = (keys: string[]): string => { try { for (const k of keys) { const v = localStorage.getItem(k); if (v) return v; } } catch {} return ""; };
const writeAll = (keys: string[], value: string) => { try { keys.forEach(k => localStorage.setItem(k, value)); } catch {} };

/* ---- labels & helpers ---- */
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
    return new Date(iso).toLocaleDateString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "2-digit", month: "2-digit", day: "2-digit",
    });
  } catch { return "-"; }
}
function startOfDay(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isSameMonth(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

/* ---- colors ---- */
const STATUS_COLOR: Record<Status, string> = {
  todo: "#3b82f6",
  in_progress: "#f59e0b",
  blocked: "#ef4444",
  done: "#22c55e",
  cancelled: "#9ca3af",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "ด่วนมาก",
  high: "สูง",
  medium: "ปานกลาง",
  low: "ต่ำ",
};
const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: "#ef4444",
  high:   "#f97316",
  medium: "#eab308",
  low:    "#22c55e",
};

/* ---- Tag chip (โชว์ CAL1 / CAL2 ฯลฯ) ---- */
function TagChip({ tag }: { tag: string }) {
  const t = (tag || "").toUpperCase();
  const base = "text-[10px] px-2 py-0.5 rounded border whitespace-nowrap";
  if (t === "CAL1") return <span className={`${base} bg-sky-50 text-sky-700 border-sky-200`}>📌 {t}</span>;
  if (t === "CAL2") return <span className={`${base} bg-violet-50 text-violet-700 border-violet-200`}>📌 {t}</span>;
  return <span className={`${base} bg-slate-100 text-slate-700 border-slate-200`}>📌 {t}</span>;
}

export default function LiffDashboardPage() {
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Task[]>([]);
  const [q, setQ] = useState("");

  /* เดือนที่เลือกสำหรับกราฟ/KPI รายเดือน (ค่าเริ่มต้น = เดือนปัจจุบัน) */
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  /* ---- init groupId/key (เหมือนไฟล์เดิม) ---- */
  useEffect(() => {
    (async () => {
      const url = new URL(location.href);
      const qsGid = url.searchParams.get("group_id");
      const qsKey = url.searchParams.get("key");
      if (qsGid) { setGroupId(qsGid); writeAll(GID_KEYS, qsGid); }
      if (qsKey) { setAdminKey(qsKey); writeAll(KEY_KEYS, qsKey); }
      if (!qsGid) { const v = readFirst(GID_KEYS); if (v) setGroupId(v); }
      if (!qsKey) { const v = readFirst(KEY_KEYS); if (v) setAdminKey(v); }

      // LIFF context fallback
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
      const r = await fetch(
        `/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}${q ? `&q=${encodeURIComponent(q)}` : ""}`
      );
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

  /* -------- filter งานที่มี due ใน "เดือนที่เลือก" (ใช้กับกราฟ/KPI รายเดือน) -------- */
  const monthFiltered = useMemo(() => {
    if (!month) return items;
    const [yy, mm] = month.split("-").map(Number);
    return items.filter(t => {
      if (!t.due_at) return false; // สำหรับกราฟรายวันของเดือน เราพิจารณาเฉพาะที่มี due
      const d = new Date(t.due_at);
      return d.getFullYear() === yy && d.getMonth() === (mm - 1);
    });
  }, [items, month]);

  /* -------- KPI เบื้องต้น -------- */
  const kpi = useMemo(() => {
    const arr = monthFiltered;
    const totalAll = items.length;
    const totalMonth = arr.length;

    const done = arr.filter(t => t.status === "done").length;
    const inProgress = arr.filter(t => t.status === "in_progress").length;
    const blocked = arr.filter(t => t.status === "blocked").length;

    const today = startOfDay();
    const overdue = arr.filter(t => t.due_at && new Date(t.due_at) < today && t.status !== "done" && t.status !== "cancelled").length;
    const avgProgress = totalMonth ? Math.round(arr.reduce((s, t) => s + Number(t.progress || 0), 0) / totalMonth) : 0;

    /* งานครบกำหนดใน 3 วันข้างหน้า — ไม่จำกัดเดือน */
    const near3 = items
      .filter(t =>
        t.due_at &&
        new Date(t.due_at) >= today &&
        new Date(t.due_at) < addDays(today, 3) &&
        t.status !== "done" &&
        t.status !== "cancelled"
      )
      .sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!))
      .slice(0, 20);

    /* การนับตามสถานะ/ความสำคัญ (ใช้เดือนที่เลือก) */
    const byStatus: Record<Status, number> = { todo:0, in_progress:0, blocked:0, done:0, cancelled:0 };
    arr.forEach(t => { byStatus[t.status]++; });
    const byPriority: Record<Priority, number> = { urgent:0, high:0, medium:0, low:0 };
    arr.forEach(t => { byPriority[t.priority]++; });

    return { totalAll, totalMonth, done, inProgress, blocked, overdue, avgProgress, near3, byStatus, byPriority };
  }, [items, monthFiltered]);

  /* -------- ข้อมูลกราฟ Burn-down / Burn-up (คำนวณจากงานที่ due อยู่ในเดือนที่เลือก) -------- */
  const burnData = useMemo(() => {
    if (!month) return [];
    const [yy, mm] = month.split("-").map(Number);
    const daysInMonth = new Date(yy, mm, 0).getDate(); // mm = 1..12

    // ใช้เฉพาะงานที่มี due ภายในเดือนนี้
    const scope = monthFiltered;

    // สร้างข้อมูลรายวัน
    let cumDone = 0;
    const data: { day: string; remaining: number; done: number }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(yy, mm - 1, d);
      // งานที่เสร็จภายในวันนั้น (due <= dayDate และ status = done)
      const doneToday = scope.filter(t => t.due_at && new Date(t.due_at) <= dayDate && t.status === "done").length;
      cumDone = doneToday; // ใช้ค่าที่สะสมตาม due day (สะสมโดยนับทุกครั้ง)

      // งานที่ "ยังเหลือ" ในวันนั้น: มี due ภายหลังวันนั้นหรือยังไม่ done/cancelled
      const remaining = scope.filter(t => {
        if (!t.due_at) return false;
        const due = new Date(t.due_at);
        // เกณฑ์: นับเป็น remaining ถ้ายังไม่เสร็จ (หรือถูกยกเลิก) และงานยังอยู่ใน scope เดือนนี้
        return (t.status !== "done" && t.status !== "cancelled") && due >= dayDate;
      }).length;

      data.push({ day: String(d), remaining, done: cumDone });
    }
    return data;
  }, [month, monthFiltered]);

  /* -------- Pie / Bar / Trend (อิงเดือนที่เลือก) -------- */
  const statusPieData = useMemo(
    () => STATUS_ORDER.map((s) => ({ key: s, name: STATUS_LABEL[s], value: kpi.byStatus[s] })),
    [kpi.byStatus]
  );
  const priorityBarData = useMemo(
    () => PR_ORDER.map((p) => ({ key: p, name: PRIORITY_LABEL[p], count: kpi.byPriority[p] })),
    [kpi.byPriority]
  );

  /* -------- ลิสต์งานในเดือนนี้ (แค่ highlight due date ให้เด่น) -------- */
  const monthList = useMemo(() => {
    const [yy, mm] = month.split("-").map(Number);
    return items
      .filter(t => t.due_at && new Date(t.due_at).getFullYear() === yy && new Date(t.due_at).getMonth() === (mm - 1))
      .sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!));
  }, [items, month]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-screen-2xl px-4 h-14 flex items-center gap-4">
          <div className="font-semibold text-slate-800">mdes-task-bot — Dashboard</div>
          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm text-slate-600">
            <a className="hover:text-slate-900" href="/liff">Tasks</a>
            <a className="hover:text-slate-900" href="/liff/kanban">Kanban</a>
            <a className="text-slate-900 border-b-2 border-emerald-500" href="/liff/dashboard">Dashboard</a>
          </nav>
          <a href="/liff" className="md:hidden ml-auto inline-flex items-center justify-center rounded px-3 py-2 bg-emerald-600 text-white">Tasks</a>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-screen-2xl px-4 py-6 md:py-8">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4 mb-5">
          <div className="md:col-span-2">
            <label className="text-sm text-slate-700">Group ID</label>
            <input className="mt-1 w-full border border-slate-200 rounded px-3 py-2" value={groupId} onChange={e=>setGroupId(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-slate-700">Admin Key</label>
            <input className="mt-1 w-full border border-slate-200 rounded px-3 py-2" value={adminKey} onChange={e=>setAdminKey(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-slate-700">เดือน (ใช้กับกราฟ/KPI)</label>
            <input type="month" className="mt-1 w-full border border-slate-200 rounded px-3 py-2" value={month} onChange={e=>setMonth(e.target.value)} />
          </div>

          <div className="md:col-span-3">
            <label className="text-sm text-slate-700">ค้นหา</label>
            <input className="mt-1 w-full border border-slate-200 rounded px-3 py-2" value={q} onChange={e=>setQ(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <button className="px-3 py-2 rounded bg-slate-800 text-white" onClick={load} disabled={loading}>{loading ? "กำลังโหลด..." : "รีเฟรช"}</button>
            <a className="px-3 py-2 rounded bg-emerald-600 text-white" href={`/liff?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`}>Tasks</a>
            <a className="px-3 py-2 rounded bg-emerald-700 text-white" href={`/liff/kanban?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`}>Kanban</a>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 md:gap-4 mb-6">
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">งานทั้งหมด (ทุกช่วงเวลา)</div>
            <div className="text-2xl font-semibold">{kpi.totalAll}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">งานเดือนนี้ (มี Due)</div>
            <div className="text-2xl font-semibold">{kpi.totalMonth}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">เสร็จสิ้น (เดือนนี้)</div>
            <div className="text-2xl font-semibold text-emerald-700">{kpi.done}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">กำลังทำ (เดือนนี้)</div>
            <div className="text-2xl font-semibold">{kpi.inProgress}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">ติดบล็อก (เดือนนี้)</div>
            <div className="text-2xl font-semibold text-rose-600">{kpi.blocked}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">เลยกำหนด (เดือนนี้)</div>
            <div className="text-2xl font-semibold text-red-600">{kpi.overdue}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="text-sm text-slate-600">เฉลี่ยความคืบหน้า (เดือนนี้)</div>
            <div className="text-2xl font-semibold">{kpi.avgProgress}%</div>
          </div>
        </div>

        {/* ===== Charts ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Pie: สถานะ */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">สัดส่วนตามสถานะ (เดือนนี้)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie dataKey="value" nameKey="name" outerRadius={90} data={STATUS_ORDER.map(s => ({
                    key: s, name: STATUS_LABEL[s], value: kpi.byStatus[s]
                  }))} label>
                    {STATUS_ORDER.map((s, i) => <Cell key={i} fill={STATUS_COLOR[s]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar: ความสำคัญ */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">จำนวนงานตามความสำคัญ (เดือนนี้)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PR_ORDER.map(p => ({ key: p, name: PRIORITY_LABEL[p], count: kpi.byPriority[p] }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count">
                    {PR_ORDER.map((p, i) => <Cell key={i} fill={PRIORITY_COLOR[p]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Burn-down / Burn-up */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">Burn-down / Burn-up (เดือนที่เลือก)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={burnData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="remaining" name="งานที่เหลือ" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="done" name="เสร็จสะสม" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ===== Lists ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ใกล้ครบกำหนด (3 วันข้างหน้า — ไม่จำกัดเดือน) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">ใกล้ครบกำหนด (3 วันข้างหน้า)</div>
            {kpi.near3.length === 0 ? (
              <div className="text-sm text-slate-500">ไม่มีรายการ</div>
            ) : (
              <ul className="space-y-2">
                {kpi.near3.map(t => {
                  const tags = (t.tags ?? []).slice(0, 4);
                  const isMedium = t.priority === "medium";
                  return (
                    <li key={t.id} className="p-3 rounded-lg border flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <div className="font-medium text-slate-800 truncate" title={t.title}>{t.title}</div>
                          <div className="flex items-center gap-1 shrink-0">{tags.map(tag => <TagChip key={tag} tag={tag} />)}</div>
                        </div>
                        <div className="mt-1 text-[12px] flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded px-2 py-[2px] bg-amber-50 text-amber-700 border border-amber-200">
                            กำหนด {thDate(t.due_at)}
                          </span>
                          <span className={
                            "inline-flex items-center rounded px-2 py-[2px] border " +
                            (isMedium ? "bg-yellow-50 text-yellow-700 border-yellow-200" : "bg-slate-100 text-slate-700 border-slate-200")
                          }>
                            {t.priority}
                          </span>
                          <span className="text-slate-500">progress {t.progress ?? 0}%</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* งานในเดือนนี้ (แค่ highlight วันที่ due ให้เด่น) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="mb-3 font-semibold text-slate-800">งานในเดือนนี้</div>
            {monthList.length === 0 ? (
              <div className="text-sm text-slate-500">ไม่มีรายการ</div>
            ) : (
              <ul className="space-y-2">
                {monthList.map(t => {
                  const tags = (t.tags ?? []).slice(0, 4);
                  const isMedium = t.priority === "medium";
                  return (
                    <li key={t.id} className="p-3 rounded-lg border flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <div className="font-medium text-slate-800 truncate" title={t.title}>{t.title}</div>
                          <div className="flex items-center gap-1 shrink-0">{tags.map(tag => <TagChip key={tag} tag={tag} />)}</div>
                        </div>
                        <div className="mt-1 text-[12px] flex flex-wrap items-center gap-2">
                          {/* highlight due date เฉพาะว่ามันอยู่ในเดือนนี้ (ทั้งหมดในลิสต์นี้อยู่แล้ว) */}
                          <span className="inline-flex items-center rounded px-2 py-[2px] bg-sky-50 text-sky-700 border border-sky-200">
                            กำหนด {thDate(t.due_at)}
                          </span>
                          <span className={
                            "inline-flex items-center rounded px-2 py-[2px] border " +
                            (isMedium ? "bg-yellow-50 text-yellow-700 border-yellow-200" : "bg-slate-100 text-slate-700 border-slate-200")
                          }>
                            {t.priority}
                          </span>
                          <span className="text-slate-500">status {t.status}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          * กราฟ/KPI อิง <b>เดือนที่เลือก</b> โดยใช้ <b>due date</b>. ส่วน “ใกล้ครบกำหนด 3 วันข้างหน้า” ไม่จำกัดเดือน
        </div>
      </main>
    </div>
  );
}
