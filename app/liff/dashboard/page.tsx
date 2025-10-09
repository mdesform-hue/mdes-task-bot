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

/** ========= Toggle Switch Animation (compact 64×32px) ========= */
function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const bgClass = isDark ? "bg-slate-900" : "bg-sky-300";
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle dark mode"
      className={[
        "relative h-8 w-16 rounded-full border overflow-hidden", // 32×64
        "transition-colors duration-500 ease-out",
        "border-slate-300 dark:border-slate-600",
        bgClass,
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
      ].join(" ")}
    >
      {/* Day */}
      <div className={["absolute inset-0 transition-opacity duration-500", isDark ? "opacity-0" : "opacity-100"].join(" ")}>
        <span className="cloud cloud-1" />
        <span className="cloud cloud-2" />
      </div>

      {/* Night */}
      <div className={["absolute inset-0 bg-slate-900 transition-opacity duration-500", isDark ? "opacity-100" : "opacity-0"].join(" ")}>
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className={`star star-${(i % 8) + 1}`} />
        ))}
      </div>

      {/* Knob */}
      <div
        className={[
          "absolute top-1 left-1 h-6 w-6 rounded-full", // 24px
          "transition-transform duration-500 ease-out",
          isDark ? "translate-x-[32px]" : "translate-x-0", // 64 - 24 - 8 = 32
          "bg-yellow-300 dark:bg-slate-100 shadow-md",
          "flex items-center justify-center",
        ].join(" ")}
      >
        {/* Sun */}
        <svg className={["h-5 w-5 transition-opacity duration-300", isDark ? "opacity-0" : "opacity-100"].join(" ")} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.2" className="fill-yellow-400" />
          <g className="stroke-yellow-400" strokeWidth="1.4" strokeLinecap="round">
            <path d="M12 2v2.6" /><path d="M12 19.4V22" />
            <path d="M2 12h2.6" /><path d="M19.4 12H22" />
            <path d="M4.6 4.6l1.8 1.8" /><path d="M17.6 17.6l1.8 1.8" />
            <path d="M19.4 4.6l-1.8 1.8" /><path d="M6.4 17.6l-1.8 1.8" />
          </g>
        </svg>
        {/* Moon */}
        <svg className={["absolute h-5 w-5 transition-opacity duration-300", isDark ? "opacity-100" : "opacity-0"].join(" ")} viewBox="0 0 24 24" fill="none">
          <path d="M16.5 12.5a7 7 0 1 1-5-9.5 6 6 0 1 0 7.7 7.7 7.1 7.1 0 0 1-2.7 1.8z" className="fill-slate-300" />
          <circle cx="10" cy="9" r="0.9" className="fill-slate-400" />
          <circle cx="12.2" cy="12.8" r="0.7" className="fill-slate-400" />
        </svg>
      </div>

      {/* local styles */}
      <style jsx>{`
        .cloud {
          position: absolute; top: 12px; height: 6px; width: 22px;
          background: #fff; border-radius: 999px;
          box-shadow: 11px -5px 0 2px #fff, 22px -2px 0 0 #fff;
          opacity: 0.85; animation: cloud-move 10s linear infinite;
        }
        .cloud-1 { left: -16px; animation-delay: 0s; }
        .cloud-2 { left: -32px; top: 6px; transform: scale(0.8); animation-delay: 2s; }
        @keyframes cloud-move { 0% { transform: translateX(0); } 100% { transform: translateX(95px); } }

        .star {
          position: absolute; width: 2px; height: 2px; background: white;
          border-radius: 999px; opacity: 0.6; animation: twinkle 1.6s ease-in-out infinite;
        }
        .star-1 { top: 6px; left: 12px; animation-delay: 0s; }
        .star-2 { top: 5px; left: 32px; animation-delay: .2s; }
        .star-3 { top: 16px; left: 46px; animation-delay: .4s; }
        .star-4 { top: 22px; left: 18px; animation-delay: .6s; }
        .star-5 { top: 10px; left: 54px; animation-delay: .8s; }
        .star-6 { top: 26px; left: 38px; animation-delay: 1.0s; }
        .star-7 { top: 18px; left: 6px;  animation-delay: 1.2s; }
        .star-8 { top: 27px; left: 58px; animation-delay: 1.4s; }
        @keyframes twinkle { 0%,100% { opacity: .2; transform: scale(1); } 50% { opacity: .9; transform: scale(1.35); } }
      `}</style>
    </button>
  );
}

/* ==== Types ==== */
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

/* ---- localStorage keys (เหมือนไฟล์อื่น ๆ) ---- */
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];
const THEME_KEY = "taskbot_theme";

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

/* ---- Tag chip (รองรับ dark) ---- */
function TagChip({ tag }: { tag: string }) {
  const t = (tag || "").toUpperCase();
  const base = "text-[10px] px-2 py-0.5 rounded border whitespace-nowrap";
  if (t === "CAL1") return <span className={`${base} bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/60`}>📌 {t}</span>;
  if (t === "CAL2") return <span className={`${base} bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/60`}>📌 {t}</span>;
  return <span className={`${base} bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700`}>📌 {t}</span>;
}

export default function LiffDashboardPage() {
  // ===== Theme state =====
  const [isDark, setIsDark] = useState(false);
  const applyTheme = (dark: boolean) => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark"); else root.classList.remove("dark");
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch {}
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") {
        setIsDark(saved === "dark"); applyTheme(saved === "dark");
      } else {
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
        setIsDark(prefersDark); applyTheme(prefersDark);
      }
    } catch { setIsDark(false); applyTheme(false); }
  }, []);
  const toggleTheme = () => setIsDark((d) => (applyTheme(!d), !d));

  // ===== Data state =====
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Task[]>([]);
  const [q, setQ] = useState("");

  // เดือนที่เลือกสำหรับกราฟ/KPI
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // init groupId/key
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

  // Filter สำหรับเดือนที่เลือก
  const monthFiltered = useMemo(() => {
    if (!month) return items;
    const [yy, mm] = month.split("-").map(Number);
    return items.filter(t => {
      if (!t.due_at) return false;
      const d = new Date(t.due_at);
      return d.getFullYear() === yy && d.getMonth() === (mm - 1);
    });
  }, [items, month]);

  // KPI
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

    const byStatus: Record<Status, number> = { todo:0, in_progress:0, blocked:0, done:0, cancelled:0 };
    arr.forEach(t => { byStatus[t.status]++; });
    const byPriority: Record<Priority, number> = { urgent:0, high:0, medium:0, low:0 };
    arr.forEach(t => { byPriority[t.priority]++; });

    return { totalAll, totalMonth, done, inProgress, blocked, overdue, avgProgress, near3, byStatus, byPriority };
  }, [items, monthFiltered]);

  // Burn-down / up
  const burnData = useMemo(() => {
    if (!month) return [];
    const [yy, mm] = month.split("-").map(Number);
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const scope = monthFiltered;

    let cumDone = 0;
    const data: { day: string; remaining: number; done: number }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(yy, mm - 1, d);
      const doneToday = scope.filter(t => t.due_at && new Date(t.due_at) <= dayDate && t.status === "done").length;
      cumDone = doneToday;

      const remaining = scope.filter(t => {
        if (!t.due_at) return false;
        const due = new Date(t.due_at);
        return (t.status !== "done" && t.status !== "cancelled") && due >= dayDate;
      }).length;

      data.push({ day: String(d), remaining, done: cumDone });
    }
    return data;
  }, [month, monthFiltered]);

  // Chart palette per theme
  const axisColor = isDark ? "#cbd5e1" : "#334155";
  const gridColor = isDark ? "#334155" : "#e2e8f0";

  // ลิสต์งานในเดือนนี้
  const monthList = useMemo(() => {
    const [yy, mm] = month.split("-").map(Number);
    return items
      .filter(t => t.due_at && new Date(t.due_at).getFullYear() === yy && new Date(t.due_at).getMonth() === (mm - 1))
      .sort((a, b) => +new Date(a.due_at!) - +new Date(b.due_at!));
  }, [items, month]);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <div className="mx-auto max-w-screen-2xl px-4 h-14 flex items-center gap-4">
          <div className="font-semibold text-slate-800 dark:text-slate-100">mdes-task-bot — Dashboard</div>

          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm text-slate-600 dark:text-slate-300">
            <a className="hover:text-slate-900 dark:hover:text-white" href="/liff">Tasks</a>
            <a className="hover:text-slate-900 dark:hover:text-white" href="/liff/kanban">Kanban</a>
            <a className="text-slate-900 dark:text-white border-b-2 border-emerald-500" href="/liff/dashboard">Dashboard</a>
          </nav>

          {/* Toggle */}
          <div className="ml-2"><ThemeToggle isDark={isDark} onToggle={toggleTheme} /></div>

          <a href="/liff" className="md:hidden ml-2 inline-flex items-center justify-center rounded px-3 py-2 bg-emerald-600 text-white">
            Tasks
          </a>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-screen-2xl px-4 py-6 md:py-8">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4 mb-5">
          <div className="md:col-span-2">
            <label className="text-sm text-slate-700 dark:text-slate-300">Group ID</label>
            <input
              className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={groupId} onChange={e=>setGroupId(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm text-slate-700 dark:text-slate-300">Admin Key</label>
            <input
              className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={adminKey} onChange={e=>setAdminKey(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">เดือน (ใช้กับกราฟ/KPI)</label>
            <input
              type="month"
              className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={month} onChange={e=>setMonth(e.target.value)}
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-sm text-slate-700 dark:text-slate-300">ค้นหา</label>
            <input
              className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={q} onChange={e=>setQ(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              className="px-3 py-2 rounded bg-slate-800 dark:bg-slate-700 text-white"
              onClick={load} disabled={loading}
            >
              {loading ? "กำลังโหลด..." : "รีเฟรช"}
            </button>
            <a
              className="px-3 py-2 rounded bg-emerald-600 text-white"
              href={`/liff?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`}
            >
              Tasks
            </a>
            <a
              className="px-3 py-2 rounded bg-emerald-700 text-white"
              href={`/liff/kanban?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`}
            >
              Kanban
            </a>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 md:gap-4 mb-6">
          {[
            { label: "งานทั้งหมด (ทุกช่วงเวลา)", value: kpi.totalAll },
            { label: "งานเดือนนี้ (มี Due)", value: kpi.totalMonth },
            { label: "เสร็จสิ้น (เดือนนี้)", value: kpi.done, cls: "text-emerald-600 dark:text-emerald-300" },
            { label: "กำลังทำ (เดือนนี้)", value: kpi.inProgress },
            { label: "ติดบล็อก (เดือนนี้)", value: kpi.blocked, cls: "text-rose-600 dark:text-rose-300" },
            { label: "เลยกำหนด (เดือนนี้)", value: kpi.overdue, cls: "text-red-600 dark:text-red-300" },
            { label: "เฉลี่ยความคืบหน้า (เดือนนี้)", value: `${kpi.avgProgress}%` },
          ].map((c, i) => (
            <div key={i} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
              <div className="text-sm text-slate-600 dark:text-slate-300">{c.label}</div>
              <div className={`text-2xl font-semibold ${c.cls || ""}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* ===== Charts ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Pie: สถานะ */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <div className="mb-3 font-semibold text-slate-800 dark:text-slate-100">สัดส่วนตามสถานะ (เดือนนี้)</div>
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
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <div className="mb-3 font-semibold text-slate-800 dark:text-slate-100">จำนวนงานตามความสำคัญ (เดือนนี้)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={PR_ORDER.map(p => ({ key: p, name: PRIORITY_LABEL[p], count: kpi.byPriority[p] }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="name" tick={{ fill: axisColor }} stroke={axisColor} />
                  <YAxis allowDecimals={false} tick={{ fill: axisColor }} stroke={axisColor} />
                  <Tooltip />
                  <Bar dataKey="count">
                    {PR_ORDER.map((p, i) => <Cell key={i} fill={PRIORITY_COLOR[p]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Burn-down / Burn-up */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <div className="mb-3 font-semibold text-slate-800 dark:text-slate-100">Burn-down / Burn-up (เดือนที่เลือก)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={burnData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="day" tick={{ fill: axisColor }} stroke={axisColor} />
                  <YAxis allowDecimals={false} tick={{ fill: axisColor }} stroke={axisColor} />
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
          {/* ใกล้ครบกำหนด */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <div className="mb-3 font-semibold text-slate-800 dark:text-slate-100">ใกล้ครบกำหนด (3 วันข้างหน้า)</div>
            {kpi.near3.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">ไม่มีรายการ</div>
            ) : (
              <ul className="space-y-2">
                {kpi.near3.map(t => {
                  const tags = (t.tags ?? []).slice(0, 4);
                  const isMedium = t.priority === "medium";
                  return (
                    <li key={t.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <div className="font-medium text-slate-800 dark:text-slate-100 truncate" title={t.title}>{t.title}</div>
                          <div className="flex items-center gap-1 shrink-0">{tags.map(tag => <TagChip key={tag} tag={tag} />)}</div>
                        </div>
                        <div className="mt-1 text-[12px] flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded px-2 py-[2px] bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/60">
                            กำหนด {thDate(t.due_at)}
                          </span>
                          <span className={
                            "inline-flex items-center rounded px-2 py-[2px] border " +
                            (isMedium
                              ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800/60"
                              : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700")
                          }>
                            {t.priority}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">progress {t.progress ?? 0}%</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* งานในเดือนนี้ */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <div className="mb-3 font-semibold text-slate-800 dark:text-slate-100">งานในเดือนนี้</div>
            {monthList.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">ไม่มีรายการ</div>
            ) : (
              <ul className="space-y-2">
                {monthList.map(t => {
                  const tags = (t.tags ?? []).slice(0, 4);
                  const isMedium = t.priority === "medium";
                  return (
                    <li key={t.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <div className="font-medium text-slate-800 dark:text-slate-100 truncate" title={t.title}>{t.title}</div>
                          <div className="flex items-center gap-1 shrink-0">{tags.map(tag => <TagChip key={tag} tag={tag} />)}</div>
                        </div>
                        <div className="mt-1 text-[12px] flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded px-2 py-[2px] bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/60">
                            กำหนด {thDate(t.due_at)}
                          </span>
                          <span className={
                            "inline-flex items-center rounded px-2 py-[2px] border " +
                            (isMedium
                              ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800/60"
                              : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700")
                          }>
                            {t.priority}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">status {t.status}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          * กราฟ/KPI อิง <b>เดือนที่เลือก</b> โดยใช้ <b>due date</b>. ส่วน “ใกล้ครบกำหนด 3 วันข้างหน้า” ไม่จำกัดเดือน
        </div>
      </main>
    </div>
  );
}
