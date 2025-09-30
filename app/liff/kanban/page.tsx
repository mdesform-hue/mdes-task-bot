// app/liff/kanban/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type React from "react";

/** ========= Theme helpers (white/green clean) ========= */
const cls = (...v: Array<string | false | null | undefined>) =>
  v.filter(Boolean).join(" ");
const btn = (variant: "primary" | "ghost" | "danger" = "primary") =>
  ({
    primary:
      "px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 border border-transparent transition",
    ghost:
      "px-3 py-2 rounded-md bg-white text-slate-800 border border-slate-200 hover:border-emerald-400 transition",
    danger:
      "px-3 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 border border-transparent transition",
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
const STATUSES: Status[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
];
const LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_BG: Record<Status, string> = {
  todo: "bg-white",
  in_progress: "bg-white",
  blocked: "bg-white",
  done: "bg-white",
  cancelled: "bg-white",
};
const STATUS_RING: Record<Status, string> = {
  todo: "ring-emerald-200",
  in_progress: "ring-emerald-200",
  blocked: "ring-rose-200",
  done: "ring-emerald-300",
  cancelled: "ring-slate-200",
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
  urgent: "bg-red-50 text-red-700 border border-red-200",
  high: "bg-orange-50 text-orange-700 border border-orange-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  low: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

/** ========= Local Storage keys ========= */
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];
const readFirst = (keys: string[]): string => {
  try {
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v) return v;
    }
  } catch {}
  return "";
};
const writeAll = (keys: string[], value: string) => {
  try {
    keys.forEach((k) => localStorage.setItem(k, value));
  } catch {}
};

/** ========= Utils ========= */
function fmtDate(v?: string | null) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleDateString("th-TH", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}
function dueMeta(t: Task): { text: string; cls: string } {
  if (t.status === "done")
    return { text: "เสร็จสิ้น", cls: "text-emerald-600 font-semibold" };
  if (!t.due_at) return { text: "", cls: "text-slate-500" };
  const due = new Date(t.due_at);
  const today = new Date();
  const sToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  const sDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const MS = 86400000;
  const diff = Math.round((sDue - sToday) / MS);
  if (diff > 0)
    return { text: `เหลืออีก ${diff} วัน`, cls: "text-emerald-700 font-semibold" };
  if (diff === 0)
    return { text: "ครบกำหนดวันนี้", cls: "text-amber-600 font-semibold" };
  return { text: `เลยกำหนด ${Math.abs(diff)} วัน`, cls: "text-red-600 font-semibold" };
}

/** ===== tag chip styles (CAL1/CAL2 เด่นเป็นพิเศษ) ===== */
function tagClass(tag: string) {
  const t = tag.toUpperCase();
  if (t === "CAL1")
    return "bg-sky-50 text-sky-700 border border-sky-200";
  if (t === "CAL2")
    return "bg-violet-50 text-violet-700 border border-violet-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

/** ========= Page ========= */
export default function KanbanPage() {
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
  const [calEmail, setCalEmail] = useState("");
  const [calTitle, setCalTitle] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [calDate, setCalDate] = useState(""); // yyyy-mm-dd
  const [calStart, setCalStart] = useState("09:00");
  const [calEnd, setCalEnd] = useState("10:00");

  /** ===== init: URL -> localStorage -> LIFF context ===== */
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const qsGid = url.searchParams.get("group_id");
      const qsKey = url.searchParams.get("key");
      if (qsGid) {
        setGroupId(qsGid);
        writeAll(GID_KEYS, qsGid);
      }
      if (qsKey) {
        setAdminKey(qsKey);
        writeAll(KEY_KEYS, qsKey);
      }

      if (!qsGid) {
        const v = readFirst(GID_KEYS);
        if (v) setGroupId(v);
      }
      if (!qsKey) {
        const v = readFirst(KEY_KEYS);
        if (v) setAdminKey(v);
      }

      // LIFF (ถ้าเปิดใน LINE)
      try {
        const liff: any = (window as any).liff;
        if (!readFirst(GID_KEYS) && liff && process.env.NEXT_PUBLIC_LIFF_ID) {
          if (!liff.isInitialized?.())
            await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
          if (liff?.isLoggedIn && !liff.isLoggedIn()) {
            liff.login();
            return;
          }
          const ctx = liff?.getContext?.();
          if (ctx?.type === "group" && ctx.groupId) {
            setGroupId(ctx.groupId);
            writeAll(GID_KEYS, ctx.groupId);
          }
        }
      } catch {}
    })();
  }, []);

  /** ===== load data ===== */
  async function load() {
    if (!groupId || !adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/tasks?group_id=${encodeURIComponent(
          groupId
        )}&key=${encodeURIComponent(adminKey)}${
          q ? `&q=${encodeURIComponent(q)}` : ""
        }`
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
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, adminKey]);

  /** ===== columns (filter + sort) ===== */
  const columns = useMemo(() => {
    const map: Record<Status, Task[]> = {
      todo: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: [],
    };
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

    const prioWeight: Record<Task["priority"], number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
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

  /** ===== drag & drop ===== */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  async function onDrop(e: React.DragEvent, next: Status) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const id = raw || draggingId;
    if (!id) return;

    // หา task ปัจจุบันเพื่อดู progress เดิม
    const current = data.find((t) => t.id === id);
    if (!current) return;

    // ถ้าเป้าเป็น done ให้ตั้ง progress = 100, ถ้าไม่ใช่ ให้คง progress เดิม
    const newProgress = next === "done" ? 100 : current.progress ?? 0;

    try {
      // Optimistic UI
      setData((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: next, progress: newProgress } : t
        )
      );

      // PATCH รวม status + progress (กรณี done)
      const body: Partial<Pick<Task, "status" | "progress">> =
        next === "done"
          ? { status: next, progress: 100 }
          : { status: next };

      const r = await fetch(
        `/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!r.ok) throw new Error(await r.text());
    } catch (e) {
      console.error(e);
      alert("อัปเดตสถานะไม่สำเร็จ");
      load();
    } finally {
      setDraggingId(null);
    }
  }

  /** ===== open/close editor ===== */
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
  function closeEditor() {
    setEditTask(null);
  }
  async function saveProgress() {
    if (!editTask) return;
    const id = editTask.id;
    const newValue = Math.max(0, Math.min(100, Number(progressDraft)));
    try {
      setData((prev) =>
        prev.map((t) => (t.id === id ? { ...t, progress: newValue } : t))
      );
      const r = await fetch(
        `/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progress: newValue }),
        }
      );
      if (!r.ok) throw new Error(await r.text());
      closeEditor();
    } catch (e) {
      console.error(e);
      alert("บันทึกเปอร์เซ็นต์ไม่สำเร็จ");
      load();
    }
  }

  /** ===== Mark Done (Close Progress) ===== */
  async function markDone() {
    if (!editTask) return;
    const id = editTask.id;
    try {
      // optimistic UI: done + 100%
      setData((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "done", progress: 100 } : t))
      );
      const r = await fetch(
        `/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done", progress: 100 }),
        }
      );
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
    if (!calDate) {
      alert("กรุณาเลือกวันที่สำหรับลงตาราง");
      return;
    }
    const body = {
      title: calTitle || t.title,
      description: calDesc || t.description || "",
      location: calLocation || "",
      date: calDate, // "YYYY-MM-DD"
      start: calStart, // "HH:mm"
      end: calEnd, // "HH:mm"
      attendeeEmail: (calEmail || undefined) as string | undefined,
    };
    try {
      const r = await fetch("/api/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      alert(
        "ลงตารางสำเร็จ! " + (j.eventId ? `eventId=${j.eventId}` : "")
      );
    } catch (e: any) {
      console.error("ADD_CAL_ERR", e?.message || e);
      alert("ลงตารางไม่สำเร็จ — ตรวจสิทธิ์แชร์ปฏิทิน, CALENDAR_ID, และ ENV อีกครั้ง");
    }
  }

  /** ========= Render ========= */
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-screen-xl px-4 h-14 flex items-center gap-4">
          <div className="font-semibold text-slate-800">mdes-task-bot — Kanban</div>
          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm text-slate-600">
            <a className="hover:text-slate-900" href="/liff">
              Tasks
            </a>
            <a
              className="text-slate-900 border-b-2 border-emerald-500"
              href="/liff/kanban"
            >
              Kanban
            </a>
            <a className="hover:text-slate-900" href="/liff/dashboard">
              Dashboard
            </a>
          </nav>
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
            <label className="text-sm mb-1 block text-slate-700">Group ID</label>
            <input
              className="border border-slate-200 px-3 py-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="กรอก Group ID หรือเปิดผ่าน LIFF เพื่อดึงอัตโนมัติ"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700">Admin Key</label>
            <input
              className="border border-slate-200 px-3 py-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ADMIN_KEY"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700">ค้นหา</label>
            <input
              className="border border-slate-200 px-3 py-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="คำค้น เช่น เอกสาร, @ชื่อ, tag"
            />
          </div>
          <button
            className={btn("ghost")}
            onClick={load}
            disabled={loading || !groupId || !adminKey}
          >
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
                "relative border border-slate-200 rounded-2xl p-3 md:p-4 flex flex-col shadow-sm",
                STATUS_BG[s],
                draggingId && STATUS_RING[s],
                "transition-all"
              )}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, s)}
            >
              <div
                className={cls(
                  "absolute inset-x-0 top-0 h-8 rounded-t-2xl pointer-events-none bg-gradient-to-b",
                  CARD_BAR[s]
                )}
              />
              <div className="flex items-center justify-between mb-3 relative z-[1]">
                <h2 className="font-semibold capitalize text-slate-800">
                  {LABEL[s]}
                </h2>
                <span className="text-xs bg-slate-100 rounded-full px-2 py-0.5">
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
                      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm mb-2 cursor-pointer hover:shadow-md transition-all ring-1 ring-black/5 min-w-0"
                      title={t.title}
                    >
                      {/* header: title + tags (ขวาบน) */}
                      <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 line-clamp-1">
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="text-xs text-slate-600 mt-1 line-clamp-1">
                              {t.description}
                            </div>
                          )}
                        </div>

                        {/* tag chips */}
                        <div className="shrink-0 flex items-center gap-1">
                          {shown.map((tag, i) => (
                            <span
                              key={i}
                              className={cls(
                                "text-[10px] rounded px-2 py-0.5",
                                tagClass(tag)
                              )}
                              title={tag}
                            >
                              #{tag}
                            </span>
                          ))}
                          {rest > 0 && (
                            <span
                              className="text-[10px] bg-slate-100 text-slate-600 rounded px-2 py-0.5"
                              title={tags.join(", ")}
                            >
                              +{rest}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* meta */}
                      <div className="flex flex-wrap items-center justify-between mt-2 text-xs gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cls("rounded-full px-2 py-0.5", PR_CHIP[t.priority])}
                          >
                            {t.priority}
                          </span>
                          <span>{t.progress ?? 0}%</span>
                        </div>
                        <div className="w-full sm:w-auto sm:ml-auto order-last sm:order-none max-w-full sm:max-w-[16rem] text-right">
                          {t.due_at && (
                            <div className="truncate text-slate-600">
                              กำหนด {fmtDate(t.due_at)}
                            </div>
                          )}
                          {meta.text && (
                            <div className={cls("truncate", meta.cls)}>{meta.text}</div>
                          )}
                        </div>
                      </div>

                      {/* progress bar */}
                      <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={cls("h-full rounded-full bg-gradient-to-r", PROGRESS_BAR[t.status])}
                          style={{
                            width: `${Math.min(100, Math.max(0, Number(t.progress ?? 0)))}%`,
                          }}
                        />
                      </div>
                    </article>
                  );
                })}
                {columns[s].length === 0 && (
                  <div className="text-xs text-slate-500 italic">
                    (ลากการ์ดมาวางที่นี่)
                  </div>
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
          <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">จัดการงาน</div>
                <div className="font-semibold text-slate-800 line-clamp-2">
                  {editTask.title}
                </div>
                {/* โชว์ code ในโมดัลได้ ไม่รบกวนการ์ด */}
                <div className="text-xs text-slate-500 mt-1">code {editTask.code}</div>
              </div>
              <button
                onClick={closeEditor}
                className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">ปรับความคืบหน้า</div>
              <input
                type="range"
                min={0}
                max={100}
                value={progressDraft}
                onChange={(e) => setProgressDraft(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-slate-700">{progressDraft}%</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={progressDraft}
                  onChange={(e) =>
                    setProgressDraft(Math.max(0, Math.min(100, Number(e.target.value))))
                  }
                  className="w-20 border border-slate-200 rounded px-2 py-1 bg-white"
                />
              </div>
            </div>

            {/* Add to Calendar */}
            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="text-sm font-medium mb-2">
                ลงตาราง (Google Calendar)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">อีเมลปฏิทิน (เชิญเข้าร่วม)</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white"
                    placeholder="name@example.com"
                    value={calEmail}
                    onChange={(e) => setCalEmail(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">ชื่อเหตุการณ์</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white"
                    value={calTitle}
                    onChange={(e) => setCalTitle(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">รายละเอียด</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white"
                    value={calDesc}
                    onChange={(e) => setCalDesc(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">วันที่</label>
                  <input
                    type="date"
                    className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white"
                    value={calDate}
                    onChange={(e) => setCalDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600">เริ่ม</label>
                    <input
                      type="time"
                      className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white"
                      value={calStart}
                      onChange={(e) => setCalStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">สิ้นสุด</label>
                    <input
                      type="time"
                      className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white"
                      value={calEnd}
                      onChange={(e) => setCalEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">สถานที่ (ถ้ามี)</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded px-3 py-2 bg-white"
                    placeholder="ห้องประชุม / ลิงก์ประชุม ฯลฯ"
                    value={calLocation}
                    onChange={(e) => setCalLocation(e.target.value)}
                  />
                </div>
              </div>
              
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button onClick={closeEditor} className={btn("ghost")}>
                ปิด
              </button>
              <button onClick={saveProgress} className={btn("primary")}>
                บันทึกความคืบหน้า
              </button>
              <button onClick={markDone} className={btn("danger")}>
                ปิดงาน (100% & Done)
              </button>
            </div>
              
              <div className="mt-3 flex justify-end">
                <button onClick={addToCalendarServer} className={btn("primary")}>
                  เพิ่มใน Google Calendar
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                * ระบบจะเปิดหน้า Google Calendar พร้อมกรอกข้อมูลให้ และเชิญอีเมลที่ระบุเป็นผู้เข้าร่วม
                หากต้องการให้บันทึกลง “ปฏิทินของอีเมลนั้นโดยอัตโนมัติ” ต้องทำ OAuth ฝั่งเซิร์ฟเวอร์เพิ่มเติม
              </div>
            </div>

            {/* Footer actions */}
          </div>
        </div>
      )}

      <footer className="mt-8 border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-4 text-slate-500 text-sm">
          © 2025 mdes-task-bot. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
