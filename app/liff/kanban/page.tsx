// app/liff/kanban/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type React from "react";

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
        "shadow-inner"
      ].join(" ")}
    >
      {/* Stars (dark) */}
      <div className="absolute inset-0 pointer-events-none">
        <svg width="100%" height="100%" viewBox="0 0 64 32" className={["transition-opacity duration-500", isDark ? "opacity-100" : "opacity-0"].join(" ")}> 
          <g fill="#fff">
            <circle cx="10" cy="7" r="0.8"/>
            <circle cx="16" cy="13" r="0.6"/>
            <circle cx="22" cy="5" r="0.5"/>
            <circle cx="30" cy="9" r="0.7"/>
            <circle cx="40" cy="6" r="0.5"/>
            <circle cx="48" cy="12" r="0.6"/>
            <circle cx="55" cy="8" r="0.5"/>
          </g>
        </svg>
      </div>

      {/* Clouds (light) */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={["cloud cloud-1", isDark ? "opacity-0" : "opacity-100"].join(" ")}></div>
        <div className={["cloud cloud-2", isDark ? "opacity-0" : "opacity-100"].join(" ")}></div>
      </div>

      {/* Knob (sun/moon) */}
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
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
            <line x1="4" y1="4" x2="6.5" y2="6.5" />
            <line x1="17.5" y1="17.5" x2="20" y2="20" />
            <line x1="4" y1="20" x2="6.5" y2="17.5" />
            <line x1="17.5" y1="6.5" x2="20" y2="4" />
          </g>
        </svg>
        {/* Moon */}
        <svg className={["h-5 w-5 transition-opacity duration-300", isDark ? "opacity-100" : "opacity-0"].join(" ")} viewBox="0 0 24 24" fill="none">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" className="fill-slate-300" />
        </svg>
      </div>

      {/* local styles for clouds/stars */}
      <style jsx>{`
        .cloud {
          position: absolute;
          top: 12px;
          width: 44px;
          height: 16px;
          background: #fff;
          border-radius: 999px;
          box-shadow: 12px 0 0 2px #fff, 24px 2px 0 0 #fff;
          filter: drop-shadow(0 1px 0 rgba(0,0,0,0.05));
          animation: cloud-move 9s linear infinite;
        }
        .cloud-1 { left: -48px; animation-delay: 0s; }
        .cloud-2 { left: -32px; top: 6px; transform: scale(0.8); animation-delay: 2s; }
        @keyframes cloud-move { 0% { transform: translateX(0); } 100% { transform: translateX(120px); } }
      `}</style>
    </button>
  );
}

/** ========= Icons ========= */
const Icon = {
  search: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
  ),
  calendar: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  ),
  save: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}><path d="M19 21H5a2 2 0 0 1-2-2V7l4-4h9l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
  ),
  moon: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79z"/></svg>
  ),
  sun: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
  ),
  check: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}><path d="M20 6L9 17l-5-5"/></svg>
  ),
  x: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>
  ),
};

/** ========= Types ========= */
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

/** ========= Local Storage keys ========= */
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];
const THEME_KEY = "taskbot_theme"; // shared with LIFF page
const CAL_ID_KEY = "taskbot_cal_calendarId"; // remember calendar id (global + per-group)
function readCalId(gid?: string) {
  try {
    if (gid) {
      const v = localStorage.getItem(`${CAL_ID_KEY}::${gid}`);
      if (v) return v;
    }
    return localStorage.getItem(CAL_ID_KEY) || "";
  } catch {
    return "";
  }
}
function writeCalId(val: string, gid?: string) {
  try {
    localStorage.setItem(CAL_ID_KEY, val);
    if (gid) localStorage.setItem(`${CAL_ID_KEY}::${gid}`, val);
  } catch {}
}

const readFirst = (keys: string[]) => {
  for (const k of keys) {
    try { const v = localStorage.getItem(k); if (v) return v; } catch {}
  }
  return "";
};
const writeAll = (keys: string[], v: string) => {
  for (const k of keys) {
    try { localStorage.setItem(k, v); } catch {}
  }
};

/** ========= UI helpers ========= */
function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function badgeByStatus(s: Status) {
  return {
    todo: "bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-800/60",
    in_progress: "bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800/60",
    blocked: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/60",
    done: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/60",
    cancelled: "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/60",
  }[s];
}

function dotByPriority(p: Priority) {
  return {
    low: "bg-slate-400",
    medium: "bg-yellow-400",
    high: "bg-orange-500",
    urgent: "bg-rose-600",
  }[p];
}

function buttonVariant(variant: "primary" | "ghost" | "danger") {
  return {
    primary: "px-3 py-2 rounded-md bg-emerald-600 text-white",
    ghost: "px-3 py-2 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700",
    danger: "px-3 py-2 rounded-md bg-rose-600 text-white",
  }[variant];
}

function miniButton(variant: "primary" | "ghost") {
  return {
    primary: "px-2 py-1 rounded border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:border-emerald-500 dark:bg-emerald-900/20",
    ghost: "px-2 py-1 rounded border border-transparent hover:border-slate-300 dark:hover:border-slate-600",
  }[variant];
}

/** ========= Page ========= */
export default function KanbanPage() {
  // ===== Theme state (shared with other pages) =====
  const [isDark, setIsDark] = useState(false);
  const applyTheme = (dark: boolean) => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark"); else root.classList.remove("dark");
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch {}
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) {
        const isDarkSaved = saved === "dark";
        setIsDark(isDarkSaved); applyTheme(isDarkSaved);
      } else {
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        setIsDark(prefersDark); applyTheme(prefersDark);
      }
    } catch { setIsDark(false); applyTheme(false); }
  }, []);
  const toggleTheme = () => setIsDark((d) => (applyTheme(!d), !d));

  // shared state
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Task[]>([]);

  // editor
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [progressDraft, setProgressDraft] = useState<number>(0);

  // calendar template fields
  const [calCalendarId, setCalCalendarId] = useState("");
  const [calTitle, setCalTitle] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [calDate, setCalDate] = useState("");
  const [calStart, setCalStart] = useState("09:00");
  const [calEnd, setCalEnd] = useState("10:00");

  // ===== initial load (read localStorage / LIFF groupId) =====
  useEffect(() => {
    (async () => {
      try {
        // prefill groupId and adminKey from localStorage
        const g = readFirst(GID_KEYS); if (g) setGroupId(g);
        const v = readFirst(KEY_KEYS); if (v) setAdminKey(v); }

      // LIFF (ถ้าเปิดใน LINE)
      try {
        const liff: any = (window as any).liff;
        if (!readFirst(GID_KEYS) && liff && process.env.NEXT_PUBLIC_LIFF_ID) {
          if (!liff.isInitialized?.()) await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
          if (liff?.isLoggedIn && !liff.isLoggedIn()) { liff.login(); return; }
          const ctx = liff?.getContext?.();
          if (ctx?.type === "group" && ctx.groupId) { setGroupId(ctx.groupId); writeAll(GID_KEYS, ctx.groupId); }
        }
      } catch {}
    })();
  }, []);

  // Load saved Calendar ID after groupId known
  useEffect(() => {
    const saved = readCalId(groupId || undefined);
    if (saved) setCalCalendarId(saved);
  }, [groupId]);

  /** ===== load data ===== */
  async function load() {
    if (!groupId || !adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&q=${encodeURIComponent(q)}`,
        { headers: { "x-admin-key": adminKey } }
      );
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setData(j.items || []);
    } catch (e) {
      console.error(e);
      alert("โหลดรายการงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [groupId, adminKey]);

  /** ===== actions ===== */
  function openEditor(t: Task) {
    setEditTask(t);
    setProgressDraft(t.progress ?? 0);

    // prefill calendar form
    setCalTitle(t.title);
    setCalDesc(t.description || "");
    setCalLocation("");

    // default date/time: today 09:00–10:00
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    setCalDate(`${y}-${m}-${d}`);
    setCalStart("09:00");
    setCalEnd("10:00");
  }

  function closeEditor() {
    setEditTask(null);
  }

  async function saveProgress() {
    const t = editTask; if (!t) return;
    try {
      const r = await fetch(`/api/admin/tasks/${t.id}`,
        { method: "PATCH", headers: {"Content-Type":"application/json", "x-admin-key": adminKey}, body: JSON.stringify({ progress: progressDraft }) });
      if (!r.ok) throw new Error(await r.text());
      alert("บันทึกความคืบหน้าแล้ว");
      closeEditor(); load();
    } catch (e) {
      console.error(e);
      alert("บันทึกไม่สำเร็จ");
    }
  }

  async function markDone() {
    const t = editTask; if (!t) return;
    try {
      const r = await fetch(`/api/admin/tasks/${t.id}`,
        { method: "PATCH", headers: {"Content-Type":"application/json", "x-admin-key": adminKey}, body: JSON.stringify({ status: "done", progress: 100 }) });
      if (!r.ok) throw new Error(await r.text());
      closeEditor();
    } catch (e) {
      console.error(e);
      alert("ปิดงานไม่สำเร็จ");
      load();
    }
  }


  /** ===== Add to Calendar (server) ===== */
  async function addToCalendarServer() {
    const t = editTask;
    if (!t) return;
    if (!calDate) { alert("กรุณาเลือกวันที่สำหรับลงตาราง"); return; }
    if (!calCalendarId.trim()) { alert("กรุณากรอก Calendar ID"); return; }

    const body = {
      calendarId: calCalendarId.trim(),          // <- ใช้ Calendar ID ที่กำหนด
      title: calTitle || t.title,
      description: calDesc || t.description || "",
      location: calLocation || "",
      date: calDate,
      start: calStart,
      end: calEnd,
      attendees: [],
      source: { id: t.id, code: t.code },
    };

    try {
      const r = await fetch("/api/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      try { writeCalId(calCalendarId.trim(), groupId); } catch {}
      alert("ลงตารางสำเร็จ! " + (j.eventId ? `eventId=${j.eventId}` : ""));
    } catch (e: any) {
      console.error("ADD_CAL_ERR", e?.message || e);
      alert("ลงตารางไม่สำเร็จ — ตรวจสิทธิ์แชร์ปฏิทิน, บทบาท Service Account และ ENV อีกครั้ง");
    }
  }

  /** ========= Render ========= */
 return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-3 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-2">
          <div className="flex items-center gap-2">
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
            <h1 className="text-lg sm:text-xl font-semibold">Kanban — MDES Task Bot</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={groupId}
              onChange={(e) => { setGroupId(e.target.value); writeAll(GID_KEYS, e.target.value); }}
              placeholder="Group ID"
              className="h-9 w-[160px] sm:w-[220px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm"
            />
            <input
              type="password"
              value={adminKey}
              onChange={(e) => { setAdminKey(e.target.value); writeAll(KEY_KEYS, e.target.value); }}
              placeholder="Admin Key"
              className="h-9 w-[160px] sm:w-[220px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm"
            />
            <button onClick={load} className={buttonVariant("primary")}>
              โหลดงาน
            </button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="px-3 sm:px-6 py-3 border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-6xl mx-auto flex items-center gap-2">
          <div className="relative flex-1 max-w-lg">
            <Icon.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
              placeholder="ค้นหาชื่องาน แท็ก หรือโค้ด"
              className="w-full h-10 rounded-md pl-9 pr-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <button onClick={load} className={buttonVariant("ghost")}>ค้นหา</button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 px-3 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto">
          {/* Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(["todo","in_progress","blocked","done","cancelled"] as Status[]).map((st) => (
              <section key={st} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <header className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <span className={cls("inline-flex items-center gap-2 text-xs font-medium px-2 py-1 rounded", badgeByStatus(st))}>
                    <span className={cls("h-2 w-2 rounded-full", st === "todo" ? "bg-slate-400" : st === "in_progress" ? "bg-sky-400" : st === "blocked" ? "bg-amber-400" : st === "done" ? "bg-emerald-500" : "bg-rose-500")} />
                    {st.replace("_"," ")}
                  </span>
                  <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{data.filter(d => d.status === st).length} งาน</span>
                </header>

                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.filter(d => d.status === st).map((t) => (
                    <article key={t.id} className="p-3">
                      <div className="flex items-start gap-2">
                        <div className={cls("mt-0.5 h-2 w-2 rounded-full", dotByPriority(t.priority))} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-500">#{t.code}</span>
                            <h3 className="text-sm font-medium truncate">{t.title}</h3>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">{t.description}</p>
                          <div className="mt-2 flex items-center gap-2">
                            {/* progress bar */}
                            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded">
                              <div style={{ width: `${t.progress}%` }} className="h-2 bg-emerald-500 rounded" />
                            </div>
                            <span className="text-xs w-8 text-right">{t.progress}%</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {(t.tags || []).map((tag, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200">{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button onClick={() => openEditor(t)} className={miniButton("ghost")}>แก้ไข</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {loading && (
            <div className="mt-6 text-center text-slate-500">กำลังโหลด...</div>
          )}
        </div>
      </main>

      {/* Editor Drawer (Modal) */}
      {editTask && (
        <div className="fixed inset-0 z-20">
          <div className="absolute inset-0 bg-black/40" onClick={closeEditor} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-slate-900 shadow-xl border-l border-slate-200 dark:border-slate-700 overflow-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-500">#{editTask.code}</span>
                <h2 className="text-base font-semibold">แก้ไขงาน / ลงตาราง</h2>
              </div>
              <button onClick={closeEditor} className={miniButton("ghost")}>
                ปิด
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Progress */}
              <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <h3 className="text-sm font-medium">ความคืบหน้า</h3>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={progressDraft}
                    onChange={(e) => setProgressDraft(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-10 text-right text-sm">{progressDraft}%</span>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <div className="min-w-max w-full inline-flex items-center justify-end gap-2 whitespace-nowrap">
                    <button onClick={saveProgress} className="px-3 py-2 rounded-md bg-emerald-600 text-white">บันทึกความคืบหน้า</button>
                    <button onClick={markDone} className="px-3 py-2 rounded-md bg-emerald-600 text-white">ปิดงานเป็น Done + 100%</button>
                  </div>
                </div>
              </section>

              {/* Calendar form */}
              <section className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Icon.calendar className="h-4 w-4" /> เพิ่มใน Google Calendar
                </h3>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300">Calendar ID (เช่น primary หรือ someone@domain)</label>
                    <input
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      placeholder="เช่น primary หรือ your@domain.com"
                      value={calCalendarId}
                      onChange={(e) => { const v = e.target.value; setCalCalendarId(v); writeCalId(v, groupId); }}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs text-slate-600 dark:text-slate-300">ชื่อเหตุการณ์</label>
                    <input
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calTitle}
                      onChange={(e) => setCalTitle(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-xs text-slate-600 dark:text-slate-300">รายละเอียด</label>
                    <textarea
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      rows={2}
                      value={calDesc}
                      onChange={(e) => setCalDesc(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300">สถานที่</label>
                    <input
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calLocation}
                      onChange={(e) => setCalLocation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300">วันที่</label>
                    <input
                      type="date"
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calDate}
                      onChange={(e) => setCalDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300">เริ่ม</label>
                    <input
                      type="time"
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calStart}
                      onChange={(e) => setCalStart(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300">สิ้นสุด</label>
                    <input
                      type="time"
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calEnd}
                      onChange={(e) => setCalEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-2 overflow-x-auto">
                  <div className="min-w-max w-full inline-flex items-center justify-end gap-2 whitespace-nowrap">
                    <button onClick={saveProgress} className="px-3 py-2 rounded-md bg-emerald-600 text-white">บันทึกความคืบหน้า</button>
                    <button onClick={addToCalendarServer} className="px-3 py-2 rounded-md bg-emerald-600 text-white">เพิ่มใน Google Calendar</button>
                  </div>
                </div>

              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                * ระบบจะใช้ Service Account บันทึก Event ลง Calendar ID ที่ระบุโดยตรง (ต้องแชร์สิทธิ์ให้ Service Account เขียนได้)
              </div>
            </section>

            {/* Footer actions */}
            <div className="mt-4 flex items-center justify-between">
              <button onClick={markDone} className="px-3 py-2 rounded-md bg-emerald-600 text-white">ปิดงานเป็น Done + 100%</button>
              <div className="text-xs text-slate-500">แก้ไขงาน: <span className="font-mono">#{editTask.code}</span></div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Footer */}
      <footer className="px-3 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span>MDES Task Bot — Kanban</span>
          <span>v0.3</span>
        </div>
      </footer>
    </div>
  );
}

/** ========= Tag color helpers (optional) ========= */
function tagClass(tag: string) {
  const t = tag.toUpperCase();
  if (t === "CAL1") return "bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/60";
  if (t === "CAL2") return "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/60";
  return "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700";
}
