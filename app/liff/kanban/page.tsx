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
        "relative h-8 w-16 rounded-full border overflow-hidden",
        "transition-colors duration-500 ease-out",
        "border-slate-300 dark:border-slate-600",
        bgClass,
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
      ].join(" ")}
    >
      <div className={["absolute inset-0 transition-opacity duration-500", isDark ? "opacity-0" : "opacity-100"].join(" ")}>
        <span className="cloud cloud-1" />
        <span className="cloud cloud-2" />
      </div>
      <div className={["absolute inset-0 bg-slate-900 transition-opacity duration-500", isDark ? "opacity-100" : "opacity-0"].join(" ")}>
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className={`star star-${(i % 8) + 1}`} />
        ))}
      </div>
      <div
        className={[
          "absolute top-1 left-1 h-6 w-6 rounded-full",
          "transition-transform duration-500 ease-out",
          isDark ? "translate-x-[32px]" : "translate-x-0",
          "bg-yellow-300 dark:bg-slate-100 shadow-md",
          "flex items-center justify-center",
        ].join(" ")}
      >
        <svg className={["h-5 w-5 transition-opacity duration-300", isDark ? "opacity-0" : "opacity-100"].join(" ")} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.2" className="fill-yellow-400" />
          <g className="stroke-yellow-400" strokeWidth="1.4" strokeLinecap="round">
            <path d="M12 2v2.6" /><path d="M12 19.4V22" />
            <path d="M2 12h2.6" /><path d="M19.4 12H22" />
            <path d="M4.6 4.6l1.8 1.8" /><path d="M17.6 17.6l1.8 1.8" />
            <path d="M19.4 4.6l-1.8 1.8" /><path d="M6.4 17.6l-1.8 1.8" />
          </g>
        </svg>
        <svg className={["absolute h-5 w-5 transition-opacity duration-300", isDark ? "opacity-100" : "opacity-0"].join(" ")} viewBox="0 0 24 24" fill="none">
          <path d="M16.5 12.5a7 7 0 1 1-5-9.5 6 6 0 1 0 7.7 7.7 7.1 7.1 0 0 1-2.7 1.8z" className="fill-slate-300" />
          <circle cx="10" cy="9" r="0.9" className="fill-slate-400" />
          <circle cx="12.2" cy="12.8" r="0.7" className="fill-slate-400" />
        </svg>
      </div>
      <style jsx>{`
        .cloud{position:absolute;top:12px;height:6px;width:22px;background:#fff;border-radius:999px;box-shadow:11px -5px 0 2px #fff,22px -2px 0 0 #fff;opacity:.85;animation:cloud-move 10s linear infinite}
        .cloud-1{left:-16px;animation-delay:0s}.cloud-2{left:-32px;top:6px;transform:scale(.8);animation-delay:2s}
        @keyframes cloud-move{0%{transform:translateX(0)}100%{transform:translateX(95px)}}
        .star{position:absolute;width:2px;height:2px;background:#fff;border-radius:999px;opacity:.6;animation:twinkle 1.6s ease-in-out infinite}
        .star-1{top:6px;left:12px;animation-delay:0s}.star-2{top:5px;left:32px;animation-delay:.2s}.star-3{top:16px;left:46px;animation-delay:.4s}.star-4{top:22px;left:18px;animation-delay:.6s}.star-5{top:10px;left:54px;animation-delay:.8s}.star-6{top:26px;left:38px;animation-delay:1s}.star-7{top:18px;left:6px;animation-delay:1.2s}.star-8{top:27px;left:58px;animation-delay:1.4s}
        @keyframes twinkle{0%,100%{opacity:.2;transform:scale(1)}50%{opacity:.9;transform:scale(1.35)}}
      `}</style>
    </button>
  );
}

/** ========= Theme helpers ========= */
const cls = (...v: Array<string | false | null | undefined>) => v.filter(Boolean).join(" ");
const btn = (variant: "primary" | "ghost" | "danger" = "primary") =>
  ({
    primary: "px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent transition",
    ghost: "px-3 py-2 rounded-md bg-white text-slate-800 border border-slate-200 hover:border-emerald-400 transition dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600",
    danger: "px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 border border-transparent transition",
  }[variant]);

/** ========= Types ========= */
type Status = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
type Task = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: Status;
  progress: number;
  priority: "low" | "medium" | "high" | "urgent";
  tags: string[] | null;
  due_at: string | null;
  group_id: string;
  created_at: string;
  updated_at: string;
};

/** ========= Constants / Labels ========= */
const STATUSES: Status[] = ["todo", "in_progress", "blocked", "done", "cancelled"];
const LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_BG: Record<Status, string> = {
  todo: "bg-white dark:bg-slate-900",
  in_progress: "bg-white dark:bg-slate-900",
  blocked: "bg-white dark:bg-slate-900",
  done: "bg-white dark:bg-slate-900",
  cancelled: "bg-white dark:bg-slate-900",
};
const STATUS_RING: Record<Status, string> = {
  todo: "ring-emerald-200 dark:ring-emerald-900/40",
  in_progress: "ring-emerald-200 dark:ring-emerald-900/40",
  blocked: "ring-rose-200 dark:ring-rose-900/40",
  done: "ring-emerald-300 dark:ring-emerald-800/40",
  cancelled: "ring-slate-200 dark:ring-slate-800/40",
};

const CARD_BAR: Record<Status, string> = {
  todo: "from-emerald-400/15 to-transparent",
  in_progress: "from-emerald-500/20 to-transparent",
  blocked: "from-rose-400/20 to-transparent",
  done: "from-emerald-400/25 to-transparent",
  cancelled: "from-slate-400/15 to-transparent",
};

const PROGRESS_BAR: Record<Status, string> = {
  done: "from-emerald-400 to-emerald-500",
  blocked: "from-rose-400 to-rose-500",
  todo: "from-emerald-300 to-emerald-400",
  in_progress: "from-emerald-400 to-teal-500",
  cancelled: "from-slate-300 to-slate-400",
};

const PR_CHIP: Record<Task["priority"], string> = {
  urgent: "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/60",
  high: "bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800/60",
  medium: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/60",
  low: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/60",
};

/** ========= Local Storage keys ========= */
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];
const THEME_KEY = "taskbot_theme";

/** ========= Utils ========= */
const readFirst = (keys: string[]): string => { try { for (const k of keys) { const v = localStorage.getItem(k); if (v) return v; } } catch {} return ""; };
const writeAll = (keys: string[], value: string) => { try { keys.forEach((k) => localStorage.setItem(k, value)); } catch {} };

function fmtDate(v?: string | null) {
  if (!v) return "";
  try { return new Date(v).toLocaleDateString("th-TH", { year: "2-digit", month: "2-digit", day: "2-digit" }); } catch { return ""; }
}
function dueMeta(t: Task): { text: string; cls: string } {
  if (t.status === "done") return { text: "เสร็จสิ้น", cls: "text-emerald-600 font-semibold dark:text-emerald-300" };
  if (!t.due_at) return { text: "", cls: "text-slate-500 dark:text-slate-400" };
  const due = new Date(t.due_at);
  const today = new Date();
  const sToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const sDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const MS = 86400000;
  const diff = Math.round((sDue - sToday) / MS);
  if (diff > 0) return { text: `เหลืออีก ${diff} วัน`, cls: "text-emerald-700 font-semibold dark:text-emerald-300" };
  if (diff === 0) return { text: "ครบกำหนดวันนี้", cls: "text-amber-600 font-semibold dark:text-amber-300" };
  return { text: `เลยกำหนด ${Math.abs(diff)} วัน`, cls: "text-red-600 font-semibold dark:text-red-300" };
}

function tagClass(tag: string) {
  const t = tag.toUpperCase();
  if (t === "CAL1") return "bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800/60";
  if (t === "CAL2") return "bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/60";
  return "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700";
}

/** ========= Page ========= */
export default function KanbanPage() {
  // Theme
  const [isDark, setIsDark] = useState(false);
  const applyTheme = (dark: boolean) => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark"); else root.classList.remove("dark");
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch {}
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") { setIsDark(saved === "dark"); applyTheme(saved === "dark"); }
      else { const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false; setIsDark(prefersDark); applyTheme(prefersDark); }
    } catch { setIsDark(false); applyTheme(false); }
  }, []);
  const toggleTheme = () => setIsDark((d) => (applyTheme(!d), !d));

  // Data
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Task[]>([]);

  // editor
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [progressDraft, setProgressDraft] = useState<number>(0);

  // calendar form (โหมด B)
  const [calEmail, setCalEmail] = useState("");     // ← อีเมลปลายทาง (บังคับ)
  const [calTitle, setCalTitle] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [calDate, setCalDate] = useState("");
  const [calStart, setCalStart] = useState("09:00");
  const [calEnd, setCalEnd] = useState("10:00");

  // init: URL -> localStorage -> LIFF
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const qsGid = url.searchParams.get("group_id");
      const qsKey = url.searchParams.get("key");
      if (qsGid) { setGroupId(qsGid); writeAll(GID_KEYS, qsGid); }
      if (qsKey) { setAdminKey(qsKey); writeAll(KEY_KEYS, qsKey); }
      if (!qsGid) { const v = readFirst(GID_KEYS); if (v) setGroupId(v); }
      if (!qsKey) { const v = readFirst(KEY_KEYS); if (v) setAdminKey(v); }

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

  async function load() {
    if (!groupId || !adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}${q ? `&q=${encodeURIComponent(q)}` : ""}`
      );
      if (!r.ok) throw new Error(await r.text());
      const rows: Task[] | { items: Task[] } = await r.json();
      setData(Array.isArray(rows) ? rows : rows.items ?? []);
    } catch (e) {
      console.error(e);
      alert("โหลดงานไม่สำเร็จ ตรวจสอบ groupId หรือ adminKey");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId, adminKey]);

  const columns = useMemo(() => {
    const map: Record<Status, Task[]> = { todo: [], in_progress: [], blocked: [], done: [], cancelled: [] };
    const kw = q.trim().toLowerCase();
    const filtered = kw
      ? data.filter((t) =>
          [t.title, t.description, t.code, t.priority, ...(t.tags ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(kw)
        )
      : data;

    const prioWeight: Record<Task["priority"], number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    filtered
      .slice()
      .sort((a, b) => {
        const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
        const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
        if (da !== db) return da - db;
        return prioWeight[a.priority] - prioWeight[b.priority];
      })
      .forEach((t) => map[t.status].push(t));

    return map;
  }, [data, q]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
  async function onDrop(e: React.DragEvent, next: Status) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const id = raw || draggingId;
    if (!id) return;

    const current = data.find((t) => t.id === id);
    if (!current) return;

    const newProgress = next === "done" ? 100 : current.progress ?? 0;

    try {
      setData((prev) => prev.map((t) => (t.id === id ? { ...t, status: next, progress: newProgress } : t)));
      const body: Partial<Pick<Task, "status" | "progress">> = next === "done" ? { status: next, progress: 100 } : { status: next };
      const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
    } catch (e) {
      console.error(e);
      alert("อัปเดตสถานะไม่สำเร็จ");
      load();
    } finally {
      setDraggingId(null);
    }
  }

  function openEditor(t: Task) {
    setEditTask(t);
    setProgressDraft(Math.max(0, Math.min(100, Number(t.progress ?? 0))));
    setCalTitle(t.title || "");
    setCalDesc(t.description || "");
    setCalLocation("");
    if (t.due_at) {
      const d = new Date(t.due_at);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setCalDate(`${yyyy}-${mm}-${dd}`);
    } else {
      setCalDate("");
    }
  }
  function closeEditor() { setEditTask(null); }

  async function saveProgress() {
    if (!editTask) return;
    const id = editTask.id;
    const newValue = Math.max(0, Math.min(100, Number(progressDraft)));
    try {
      setData((prev) => prev.map((t) => (t.id === id ? { ...t, progress: newValue } : t)));
      const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ progress: newValue }),
      });
      if (!r.ok) throw new Error(await r.text());
      closeEditor();
    } catch (e) {
      console.error(e);
      alert("บันทึกเปอร์เซ็นต์ไม่สำเร็จ");
      load();
    }
  }

  async function markDone() {
    if (!editTask) return;
    const id = editTask.id;
    try {
      setData((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done", progress: 100 } : t)));
      const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done", progress: 100 }),
      });
      if (!r.ok) throw new Error(await r.text());
      closeEditor();
    } catch (e) {
      console.error(e);
      alert("ปิดงานไม่สำเร็จ");
      load();
    }
  }

  /** ===== โหมด B: ใช้อีเมลที่กรอกเป็นปลายทาง (calendarId) ===== */
  async function addToCalendarServer() {
    const t = editTask;
    if (!t) return;
    if (!calDate) { alert("กรุณาเลือกวันที่สำหรับลงตาราง"); return; }
    const email = calEmail.trim();
    if (!email) { alert("กรุณากรอกอีเมลปฏิทิน (ปลายทาง)"); return; }

    const body = {
      title: calTitle || t.title,
      description: calDesc || t.description || "",
      location: calLocation || "",
      date: calDate,
      start: calStart,
      end: calEnd,
      attendeeEmail: email, // ✅ server จะใช้เมลนี้เป็น calendarId ปลายทาง (ไม่ใช่ attendees)
    };

    try {
      const r = await fetch("/api/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      let j: any = {};
      try { j = JSON.parse(txt); } catch {}
      if (!r.ok) { alert(j?.error || txt || "ลงตารางไม่สำเร็จ"); return; }
      alert("ลงตารางสำเร็จ! " + (j.eventId ? `eventId=${j.eventId}` : ""));
    } catch (e: any) {
      alert("ลงตารางไม่สำเร็จ");
      console.error("ADD_CAL_ERR", e?.message || e);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <div className="mx-auto max-w-screen-xl px-4 h-14 flex items-center gap-4">
          <div className="font-semibold text-slate-800 dark:text-slate-100">mdes-task-bot — Kanban</div>
          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm text-slate-600 dark:text-slate-300">
            <a className="hover:text-slate-900 dark:hover:text-white" href="/liff">Tasks</a>
            <a className="text-slate-900 dark:text-white border-b-2 border-emerald-500" href="/liff/kanban">Kanban</a>
            <a className="hover:text-slate-900 dark:hover:text-white" href="/liff/dashboard">Dashboard</a>
          </nav>
          <div className="ml-2"><ThemeToggle isDark={isDark} onToggle={toggleTheme} /></div>
          <button
            className={btn("primary") + " md:hidden ml-auto"}
            onClick={() => {
              const url = new URL("/liff", location.origin);
              if (groupId) url.searchParams.set("group_id", groupId);
              if (adminKey) url.searchParams.set("key", adminKey);
              window.open(url.toString(), "_self");
            }}
          >
            LIFF TASK
          </button>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-[1400px] mx-auto flex-1">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4 mb-4">
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700 dark:text-slate-300">Group ID</label>
            <input
              className="border border-slate-200 dark:border-slate-600 px-3 py-2 rounded w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-700"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="กรอก Group ID หรือเปิดผ่าน LIFF เพื่อดึงอัตโนมัติ"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700 dark:text-slate-300">Admin Key</label>
            <input
              className="border border-slate-200 dark:border-slate-600 px-3 py-2 rounded w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-700"
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ADMIN_KEY"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700 dark:text-slate-300">ค้นหา</label>
            <input
              className="border border-slate-200 dark:border-slate-600 px-3 py-2 rounded w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-700"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="คำค้น เช่น เอกสาร, @ชื่อ, tag"
            />
          </div>
          <button className={btn("ghost")} onClick={load} disabled={loading || !groupId || !adminKey}>
            {loading ? "กำลังโหลด..." : "รีเฟรช"}
          </button>
          <button
            className={btn("primary")}
            onClick={() => {
              const url = new URL("/liff", location.origin);
              if (groupId) url.searchParams.set("group_id", groupId);
              if (adminKey) url.searchParams.set("key", adminKey);
              window.open(url.toString(), "_self");
            }}
          >
            LIFF TASK
          </button>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 min-h-[60vh]">
          {STATUSES.map((s) => (
            <div
              key={s}
              className={cls(
                "relative border border-slate-200 dark:border-slate-700 rounded-2xl p-3 md:p-4 flex flex-col shadow-sm",
                STATUS_BG[s],
                draggingId && STATUS_RING[s],
                "transition-all"
              )}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, s)}
            >
              <div className={cls("absolute inset-x-0 top-0 h-8 rounded-t-2xl pointer-events-none bg-gradient-to-b", CARD_BAR[s])} />
              <div className="flex items-center justify-between mb-3 relative z-[1]">
                <h2 className="font-semibold capitalize text-slate-800 dark:text-slate-100">{LABEL[s]}</h2>
                <span className="text-xs bg-slate-100 dark:bg-slate-700 dark:text-slate-100 rounded-full px-2 py-0.5">
                  {columns[s].length}
                </span>
              </div>

              <div className="flex-1 rounded-xl min-h-[200px] p-2">
                {columns[s].map((t) => {
                  const meta = dueMeta(t);
                  const tags = t.tags ?? [];
                  const shown = tags.slice(0, 2);
                  const rest = Math.max(0, tags.length - shown.length);
                  return (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, t.id)}
                      onClick={() => openEditor(t)}
                      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm mb-2 cursor-pointer hover:shadow-md transition-all ring-1 ring-black/5 min-w-0"
                      title={t.title}
                    >
                      <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{t.title}</div>
                          {t.description && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-1">{t.description}</div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {shown.map((tag, i) => (
                            <span key={i} className={cls("text-[10px] rounded px-2 py-0.5", tagClass(tag))} title={tag}>
                              #{tag}
                            </span>
                          ))}
                          {rest > 0 && (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 dark:text-slate-200 rounded px-2 py-0.5" title={tags.join(", ")}>
                              +{rest}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between mt-2 text-xs gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cls("rounded-full px-2 py-0.5", PR_CHIP[t.priority])}>{t.priority}</span>
                          <span className="text-slate-700 dark:text-slate-200">{t.progress ?? 0}%</span>
                        </div>
                        <div className="w-full sm:w-auto sm:ml-auto order-last sm:order-none max-w-full sm:max-w-[16rem] text-right">
                          {t.due_at && <div className="truncate text-slate-600 dark:text-slate-300">กำหนด {fmtDate(t.due_at)}</div>}
                          {meta.text && <div className={cls("truncate", meta.cls)}>{meta.text}</div>}
                        </div>
                      </div>

                      <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={cls("h-full rounded-full bg-gradient-to-r", PROGRESS_BAR[t.status])}
                          style={{ width: `${Math.min(100, Math.max(0, Number(t.progress ?? 0)))}%` }}
                        />
                      </div>
                    </article>
                  );
                })}
                {columns[s].length === 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 italic">(ลากการ์ดมาวางที่นี่)</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Modal: Progress Editor + Add to Calendar */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeEditor} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-400">จัดการงาน</div>
                <div className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">{editTask.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">code {editTask.code}</div>
              </div>
              <button onClick={closeEditor} className="rounded-full px-2 py-1 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Close">✕</button>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="text-sm font-medium mb-2 text-slate-800 dark:text-slate-100">ปรับความคืบหน้า</div>
              <input type="range" min={0} max={100} value={progressDraft} onChange={(e) => setProgressDraft(Number(e.target.value))} className="w-full accent-emerald-600" />
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-slate-700 dark:text-slate-200">{progressDraft}%</div>
                <input
                  type="number" min={0} max={100} value={progressDraft}
                  onChange={(e) => setProgressDraft(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-20 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Add to Calendar (โหมด B) */}
            <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="text-sm font-medium mb-2 text-slate-800 dark:text-slate-100">ลงตาราง (Google Calendar — โหมด B)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600 dark:text-slate-300">อีเมลปฏิทิน (ปลายทาง) — *บังคับ</label>
                  <input
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    placeholder="name@example.com"
                    value={calEmail}
                    onChange={(e) => setCalEmail(e.target.value)}
                  />
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    ระบบจะสร้างอีเวนต์ลงปฏิทินของอีเมลนี้โดยตรง (ต้องให้ SA มีสิทธิ์เขียน หรือใช้ Domain-wide Delegation)
                  </div>
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
                    rows={2}
                    className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                    <label className="text-xs text-slate-600 dark:text-slate-300">สิ้นสุด</label>
                    <input
                      type="time"
                      className="mt-1 w-full border border-slate-200 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      value={calEnd} onChange={(e) => setCalEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={saveProgress} className={btn("ghost")}>บันทึกความคืบหน้า</button>
                <button onClick={addToCalendarServer} className={btn("primary")}>เพิ่มใน Google Calendar</button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                * โหมด B: ไม่ส่งคำเชิญผู้เข้าร่วม (attendees) — ระบบเขียนลงปฏิทินของอีเมลที่กรอกโดยตรง
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button onClick={markDone} className={btn("primary")}>ทำเสร็จ (100%)</button>
              <button onClick={closeEditor} className={btn("ghost")}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-8 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="mx-auto max-w-screen-xl px-4 py-4 text-slate-500 dark:text-slate-400 text-sm">
          © 2025 mdes-task-bot. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
