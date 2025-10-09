// app/liff/kanban/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";

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
      ].join(" ")}
    >
      {/* local decorative clouds / stars */}
      <div className="absolute inset-0">
        <style>{`
          .cloud { position:absolute; height: 12px; border-radius: 999px; opacity:.75; transition: transform .7s ease; }
          .cloud-1 { left: 4px; top: 4px; width: 28px; background: #fff; box-shadow: 8px 0 0 0 #fff, 16px 0 0 0 #fff; }
          .cloud-2 { left: -32px; top: 6px; transform: scale(.8); width: 28px; background: #fff; box-shadow: 8px 0 0 0 #fff, 16px 0 0 0 #fff; }
          .star { position: absolute; width: 2px; height:2px; border-radius: 50%; background: #cbd5e1; opacity:.2; animation: twinkle 2.4s infinite; }
          .star.s1 { left:12px; top:6px; }
          .star.s2 { left:22px; top:14px; animation-delay:.6s; }
          .star.s3 { left:34px; top:4px; animation-delay:1.2s; }
          @keyframes twinkle { 0%,100% { opacity: .2; transform: scale(1); } 50% { opacity: .9; transform: scale(1.2); } }
        `}</style>
        <div className={["cloud cloud-1", isDark && "translate-x-16 opacity-0"].filter(Boolean).join(" ")}></div>
        <div className={["cloud cloud-2", isDark && "translate-x-16 opacity-0"].filter(Boolean).join(" ")}></div>
        {isDark && (
          <>
            <div className="star s1" />
            <div className="star s2" />
            <div className="star s3" />
          </>
        )}
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
            <path d="M12 2.5v3" />
            <path d="M12 18.5v3" />
            <path d="M21.5 12h-3" />
            <path d="M5.5 12h-3" />
            <path d="M17.7 6.3l-2.1 2.1" />
            <path d="M8.4 15.6l-2.1 2.1" />
            <path d="M17.7 17.7l-2.1-2.1" />
            <path d="M8.4 8.4l-2.1-2.1" />
          </g>
        </svg>
        {/* Moon */}
        <svg className={["absolute h-5 w-5 transition-opacity duration-300", isDark ? "opacity-100" : "opacity-0"].join(" ")} viewBox="0 0 24 24" fill="none">
          <path d="M20.5 13.2a8.5 8.5 0 1 1-9.7-9.7 7 7 0 0 0 9.7 9.7Z" className="fill-slate-300" />
        </svg>
      </div>
    </button>
  );
}

/** ========= Small helpers (typography, button) ========= */
const cls = (...v: Array<string | false | null | undefined>) => v.filter(Boolean).join(" ");
const btn = (variant: "solid" | "ghost" | "outline" = "solid") =>
  ({
    solid: "px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60",
    ghost: "px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800",
    outline:
      "px-3 py-2 rounded-md border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/60",
  }[variant]);

/** ========= Local Storage keys ========= */
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];
const THEME_KEY = "taskbot_theme"; // shared with LIFF page

// --- Calendar ID persistence ---
const CAL_ID_KEY = "taskbot_cal_calendarId";
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
const readFirst = (keys: string[]): string => {
  try { for (const k of keys) { const v = localStorage.getItem(k); if (v) return v; } } catch {}
  return "";
};
const writeAll = (keys: string[], value: string) => { try { keys.forEach((k) => localStorage.setItem(k, value)); } catch {} };

/*
  ====== Types ======
*/
type Status = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";
export type Task = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: Status;
  progress: number; // 0-100
  priority: Priority;
  tags: string[] | null;
  due_at: string | null; // yyyy-mm-dd
  group_id: string;
  created_at: string;
  updated_at: string;
};

const STATUS_TEXT: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};
const STATUS_COLOR: Record<Status, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-200 dark:border-slate-700",
  in_progress: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-700/50",
  blocked: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-700/50",
  done: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/60",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700",
};

/** Date helpers */
const fmtDate = (v?: string | null) => {
  if (!v) return "";
  try {
    return new Date(v).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return v;
  }
};

/** ========= Page ========= */
export default function KanbanPage() {
  // ===== Theme state (shared with other pages) =====
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
        const dark = saved === "dark";
        setIsDark(dark); applyTheme(dark);
      } else {
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
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
  // Load saved Calendar ID for this group (or global) when groupId becomes known
  useEffect(() => {
    const saved = readCalId(groupId || undefined);
    if (saved) setCalCalendarId(saved);
  }, [groupId]);

  const [calTitle, setCalTitle] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [calDate, setCalDate] = useState(""); // yyyy-mm-dd
  const [calStart, setCalStart] = useState("09:00");
  const [calEnd, setCalEnd] = useState("10:00");

  // Load LIFF context (groupId) once
  useEffect(() => {
    (async () => {
      try {
        // 1) from URL first (for testing in browser)
        const u = new URL(location.href);
        const gid = u.searchParams.get("group_id");
        const key = u.searchParams.get("key");
        if (gid) { setGroupId(gid); writeAll(GID_KEYS, gid); }
        if (key) { setAdminKey(key); writeAll(KEY_KEYS, key); }

        // 2) fallback from localStorage
        if (!gid) {
          const savedG = readFirst(GID_KEYS); if (savedG) setGroupId(savedG);
        }
        if (!key) {
          const savedK = readFirst(KEY_KEYS); if (savedK) setAdminKey(savedK);
        }

        // 3) if inside LIFF, fetch context
        // @ts-ignore
        if ((window as any).liff?.getContext) {
          // @ts-ignore
          const ctx = (window as any).liff.getContext?.();
          if (ctx?.type === "group" && ctx.groupId) { setGroupId(ctx.groupId); writeAll(GID_KEYS, ctx.groupId); }
        }
      } catch {}
    })();
  }, []);

  // Load data function (mocked demo — replace with your API)
  async function load() {
    if (!groupId || !adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/tasks/list?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`);
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as Task[];
      setData(j);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (groupId && adminKey) load(); }, [groupId, adminKey]);

  // Filtering
  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return data;
    return data.filter((t) => (
      t.title.toLowerCase().includes(s) ||
      (t.description || "").toLowerCase().includes(s) ||
      t.priority.includes(s as any) ||
      (t.tags || []).some((x) => x.toLowerCase().includes(s))
    ));
  }, [q, data]);

  // Group by status — recompute whenever filtered changes (avoid mutating stable arrays)
  const groups = useMemo(() => {
    const base: Record<Status, Task[]> = { todo: [], in_progress: [], blocked: [], done: [], cancelled: [] };
    for (const t of filtered) base[t.status].push(t);
    return base;
  }, [filtered]);

  // Editor open/close
  function openEditor(t: Task) {
    setEditTask(t);
    setProgressDraft(t.progress);
    // default calendar fields
    setCalTitle(t.title);
    setCalDesc(t.description || "");
  }
  function closeEditor() { setEditTask(null); }

  // Save progress (demo — call your API)
  async function saveProgress() {
    if (!editTask) return;
    try {
      const r = await fetch("/api/tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTask.id, progress: progressDraft, status: editTask.status }),
      });
      if (!r.ok) throw new Error(await r.text());
      // refresh UI
      setData((old) => old.map((x) => (x.id === editTask.id ? { ...x, progress: progressDraft } : x)));
      alert("บันทึกความคืบหน้าแล้ว");
    } catch (e: any) {
      alert("บันทึกไม่สำเร็จ: " + (e?.message || e));
    }
  }
  function markDone() {
    if (!editTask) return;
    setProgressDraft(100);
    setData((old) => old.map((x) => (x.id === editTask.id ? { ...x, status: "done", progress: 100 } : x)));
  }

  // Add to Calendar via server API
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
    };

    try {
      const r = await fetch("/api/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      // persist the Calendar ID that worked
      writeCalId(calCalendarId.trim(), groupId);
      alert("ลงตารางสำเร็จ! " + (j.eventId ? `eventId=${j.eventId}` : ""));
    } catch (e: any) {
      console.error("ADD_CAL_ERR", e?.message || e);
      alert("ลงตารางไม่สำเร็จ — ตรวจสิทธิ์แชร์ปฏิทิน, บทบาท Service Account และ ENV อีกครั้ง");
    }
  }

  /** ========= Render ========= */
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <div className="mx-auto max-w-screen-xl px-4 h-14 flex items-center gap-4">
          <div className="font-semibold text-slate-800 dark:text-slate-100">mdes-task-bot · Kanban</div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="mx-auto max-w-screen-xl w-full px-4 py-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="text-xs text-slate-600 dark:text-slate-300">Group ID</label>
            <input
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="กรอก Group ID หรือเปิดผ่าน LIFF ในกลุ่ม"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-600 dark:text-slate-300">Admin Key</label>
            <input
              className="mt-1 w-full border border-slate-200 dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ใส่คีย์ผู้ดูแลเพื่อแก้ไขข้อมูล"
            />
          </div>
          <div className="flex gap-2">
            <button className={btn("ghost")} onClick={load} disabled={loading || !groupId || !adminKey}>
              {loading ? "กำลังโหลด..." : "รีเฟรช"}
            </button>
            <button
              className={btn("outline")}
              onClick={() => {
                const url = new URL("/liff", location.origin);
                if (groupId) url.searchParams.set("group_id", groupId);
                if (adminKey) url.searchParams.set("key", adminKey);
                window.open(url.toString(), "_blank");
              }}
            >
              เปิด Dashboard
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3">
          <input
            className="w-full md:w-96 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            placeholder="ค้นหา ชื่องาน/รายละเอียด/แท็ก/ความสำคัญ"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Board */}
      <div className="mx-auto max-w-screen-xl w-full px-4 pb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["todo", "in_progress", "done"] as Status[]).map((s) => (
          <section key={s} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <header className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-sm font-semibold">{STATUS_TEXT[s]}</div>
              <span className={cls("text-xs px-2 py-1 rounded-full border", STATUS_COLOR[s])}>{groups[s].length} งาน</span>
            </header>
            <div className="p-3 space-y-3">
              {groups[s].map((t) => (
                <article key={t.id} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{t.title}</div>
                    <div className="text-xs text-slate-500">{fmtDate(t.due_at)}</div>
                  </div>
                  {!!t.tags?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.tags.map((x) => (
                        <span key={x} className="inline-flex items-center h-6 px-2 rounded-full text-xs border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {x}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-slate-500">{t.priority.toUpperCase()} · {t.progress}%</div>
                    <button className={cls(btn("ghost"))} onClick={() => openEditor(t)}>แก้ไข</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Editor Drawer */}
      {editTask && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex">
          <div className="ml-auto h-full w-full max-w-xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 p-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-slate-800 dark:text-slate-100">แก้ไขงาน</div>
              <button className={btn("ghost")} onClick={closeEditor}>ปิด</button>
            </div>

            {/* Task info */}
            <div className="mt-4 space-y-2">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{editTask.title}</div>
              {editTask.description && <div className="text-sm text-slate-600 dark:text-slate-300">{editTask.description}</div>}
            </div>

            {/* Progress */}
            <div className="mt-4">
              <label className="text-xs text-slate-600 dark:text-slate-300">ความคืบหน้า</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="range" min={0} max={100} value={progressDraft}
                  onChange={(e) => setProgressDraft(Number(e.target.value))}
                  className="flex-1"
                />
                <div className="text-slate-700 dark:text-slate-200">{progressDraft}%</div>
                <input
                  type="number" min={0} max={100} value={progressDraft}
                  onChange={(e) => setProgressDraft(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-20 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Add to Calendar */}
            <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="text-sm font-medium mb-2 text-slate-800 dark:text-slate-100">ลงตาราง (Google Calendar)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* ❌ เดิม: อีเมลปฏิทิน (เชิญเข้าร่วม)
                    ✅ ใหม่: Calendar ID */}
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-300">Calendar ID (เช่น primary หรือ someone@domain)</label>
                  <input
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    placeholder="เช่น primary หรือ your@domain.com"
                    value={calCalendarId}
                    onChange={(e) => { const v = e.target.value; setCalCalendarId(v); writeCalId(v, groupId); }}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-300">ชื่อเหตุการณ์</label>
                  <input
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    value={calTitle} onChange={(e) => setCalTitle(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-300">รายละเอียด</label>
                  <textarea
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    rows={3}
                    value={calDesc} onChange={(e) => setCalDesc(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-600 dark:text-slate-300">วันที่</label>
                  <input
                    type="date"
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    value={calDate} onChange={(e) => setCalDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300">เริ่ม</label>
                    <input
                      type="time"
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calStart} onChange={(e) => setCalStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300">ถึง</label>
                    <input
                      type="time"
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calEnd} onChange={(e) => setCalEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-300">สถานที่ (ถ้ามี)</label>
                  <input
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    placeholder="ห้องประชุม / ลิงก์ประชุม ฯลฯ" value={calLocation} onChange={(e) => setCalLocation(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 overflow-x-auto">
                <div className="min-w-max w-full inline-flex items-center justify-end gap-2 whitespace-nowrap">
                  <button className={btn("ghost")} onClick={saveProgress}>บันทึกความคืบหน้า</button>
                  <button className={btn("outline")} onClick={addToCalendarServer}>เพิ่มใน Google Calendar</button>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  * ระบบจะใช้ Service Account บันทึก Event ลง Calendar ID ที่ระบุ (เช่น primary / someone@domain)
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-4 flex items-center justify-between">
              <button onClick={markDone} className="px-3 py-2 rounded-md bg-emerald-600 text-white">ทำเสร็จ (100%)</button>
              <button onClick={closeEditor} className="px-3 py-2 rounded-md bg-white border">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
