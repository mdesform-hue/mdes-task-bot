// app/liff/kanban/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import type React from "react";

// ===== Types =====
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

// ===== Helpers =====
const STATUSES: Status[] = ["todo", "in_progress", "blocked", "done", "cancelled"];
const LABEL: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_GRADIENT: Record<Status, string> = {
  todo: "from-sky-400/20 via-sky-400/10 to-transparent",
  in_progress: "from-indigo-400/20 via-indigo-400/10 to-transparent",
  blocked: "from-rose-400/20 via-rose-400/10 to-transparent",
  done: "from-emerald-400/20 via-emerald-400/10 to-transparent",
  cancelled: "from-zinc-400/20 via-zinc-400/10 to-transparent",
};

const STATUS_RING: Record<Status, string> = {
  todo: "ring-sky-300/50",
  in_progress: "ring-indigo-300/50",
  blocked: "ring-rose-300/50",
  done: "ring-emerald-300/50",
  cancelled: "ring-zinc-300/50",
};

function fmtDate(v?: string | null) {
  if (!v) return "";
  try {
    const d = new Date(v);
    return d.toLocaleDateString("th-TH", { year: "2-digit", month: "2-digit", day: "2-digit" });
  } catch {
    return "";
  }
}

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// Priority color chips
const PR_CHIP: Record<Task["priority"], string> = {
  urgent: "bg-gradient-to-r from-red-500/15 to-red-400/10 text-red-700 dark:text-red-300 border border-red-300/40",
  high: "bg-gradient-to-r from-orange-500/15 to-orange-400/10 text-orange-700 dark:text-orange-300 border border-orange-300/40",
  medium: "bg-gradient-to-r from-amber-500/15 to-amber-400/10 text-amber-700 dark:text-amber-300 border border-amber-300/40",
  low: "bg-gradient-to-r from-emerald-500/15 to-emerald-400/10 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40",
};

/** คำนวณข้อความ “ระยะเวลา” + สี ตาม due date และสถานะ */
function dueMeta(t: Task): { text: string; cls: string } {
  if (t.status === "done") {
    return { text: "เสร็จสิ้น", cls: "text-emerald-600 font-semibold" };
  }
  if (!t.due_at) return { text: "", cls: "text-gray-500" };

  const due = new Date(t.due_at);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();

  const MS = 24 * 60 * 60 * 1000;
  const diff = Math.round((startOfDue - startOfToday) / MS); // >0 = ยังเหลือ, 0 = วันนี้, <0 = เลยแล้ว

  if (diff > 0) return { text: `เหลืออีก ${diff} วัน`, cls: "text-green-600 font-semibold" };
  if (diff === 0) return { text: "ครบกำหนดวันนี้", cls: "text-amber-600 font-semibold" };
  return { text: `เลยกำหนด ${Math.abs(diff)} วัน`, cls: "text-red-600 font-semibold" };
}

/** 🆕 สร้าง Google Calendar Template URL
 *  - ไม่สามารถ “บังคับ” ให้ลงปฏิทินของอีเมลที่ระบุได้ถ้าไม่ทำ OAuth
 *  - ใช้วิธีเปิดหน้าสร้างอีเวนต์พร้อมเชิญอีเมลนั้นด้วยพารามิเตอร์ add=
 */
function googleCalendarUrl(opts: {
  title: string;
  details?: string;
  location?: string;
  start: Date;
  end: Date;
  inviteEmail?: string;
}) {
  const fmt = (d: Date) => {
    // YYYYMMDDTHHMMSSZ (UTC)
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = d.getUTCFullYear();
    const m = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${y}${m}${day}T${hh}${mm}${ss}Z`;
  };

  const base = "https://calendar.google.com/calendar/render";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title || "",
    details: opts.details || "",
    location: opts.location || "",
    dates: `${fmt(opts.start)}/${fmt(opts.end)}`,
  });
  if (opts.inviteEmail) params.set("add", opts.inviteEmail);
  return `${base}?${params.toString()}`;
}

// ===== Page =====
export default function KanbanPage() {
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Task[]>([]);

  // Progress editor & calendar state
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [progressDraft, setProgressDraft] = useState<number>(0);

  // 🆕 ฟอร์มลงตาราง
  const [calEmail, setCalEmail] = useState("");
  const [calTitle, setCalTitle] = useState("");
  const [calDesc, setCalDesc] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [calDate, setCalDate] = useState("");      // yyyy-mm-dd
  const [calStart, setCalStart] = useState("09:00");
  const [calEnd, setCalEnd] = useState("10:00");

  // ลองดึงค่า default จาก localStorage
  useEffect(() => {
    try {
      const gid = localStorage.getItem("liff_group_id") || localStorage.getItem("LS_GID") || "";
      const key = localStorage.getItem("admin_key") || localStorage.getItem("ADMIN_KEY") || "";
      if (gid) setGroupId(gid);
      if (key) setAdminKey(key);
    } catch {}
  }, []);

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

    // sort by due_at then priority
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

  async function load() {
    if (!groupId || !adminKey) return;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}${
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [groupId, adminKey]);

  // ===== Drag & Drop =====
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
    try {
      setData((prev) => prev.map((t) => (t.id === id ? { ...t, status: next } : t)));
      const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
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

  // ===== Progress Editor (Modal) + Calendar form =====
  function openEditor(t: Task) {
    setEditTask(t);
    setProgressDraft(Math.max(0, Math.min(100, Number(t.progress ?? 0))));
    // prefill calendar fields
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: newValue }),
      });
      if (!r.ok) throw new Error(await r.text());
      closeEditor();
    } catch (e) {
      console.error(e);
      alert("บันทึกเปอร์เซ็นต์ไม่สำเร็จ");
      load();
    }
  }

  // 🆕 เพิ่มใน Google Calendar
  function addToCalendar() {
    const t = editTask;
    if (!t) return;

    if (!calDate) {
      alert("กรุณาเลือกวันที่สำหรับลงตาราง");
      return;
    }
    const [sh, sm] = calStart.split(":").map(Number);
    const [eh, em] = calEnd.split(":").map(Number);
    const startLocal = new Date(`${calDate}T${calStart}:00`);
    const endLocal = new Date(`${calDate}T${calEnd}:00`);
    if (endLocal <= startLocal) {
      alert("เวลาเสร็จต้องหลังเวลาเริ่ม");
      return;
    }

    const url = googleCalendarUrl({
      title: calTitle || t.title,
      details: calDesc || t.description || "",
      location: calLocation || "",
      start: startLocal,
      end: endLocal,
      inviteEmail: calEmail || undefined, // จะเชิญอีเมลนี้เป็นผู้เข้าร่วม
    });

    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ===== Render =====
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      {/* background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-sky-400 via-purple-500 to-pink-500 dark:from-indigo-900 dark:via-violet-900 dark:to-fuchsia-900" />
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-10 -left-10 w-80 h-80 bg-white/10 rounded-3xl blur-3xl rotate-6" />
        <div className="absolute top-24 right-12 w-72 h-72 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 left-1/3 w-[28rem] h-56 bg-white/10 rounded-3xl blur-3xl -rotate-6" />
      </div>

      {/* ===== Content ===== */}
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto flex-1">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4 mb-4">
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700 dark:text-slate-300">Group ID</label>
            <input
              className="border px-3 py-2 rounded w-full bg-white/80 dark:bg-slate-800/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="กรอก Group ID หรือเปิดผ่าน LIFF เพื่อดึงอัตโนมัติ"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700 dark:text-slate-300">Admin Key</label>
            <input
              className="border px-3 py-2 rounded w-full bg-white/80 dark:bg-slate-800/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="ADMIN_KEY"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm mb-1 block text-slate-700 dark:text-slate-300">ค้นหา</label>
            <input
              className="border px-3 py-2 rounded w-full bg-white/80 dark:bg-slate-800/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="คำค้น เช่น เอกสาร, @ชื่อ, tag"
            />
          </div>
          <button
            className="px-4 py-2 rounded bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-sm hover:shadow-md active:scale-[.98] disabled:opacity-50"
            onClick={load}
            disabled={loading || !groupId || !adminKey}
          >
            {loading ? "กำลังโหลด..." : "รีเฟรช"}
          </button>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 min-h-[60vh]">
          {STATUSES.map((s) => (
            <div
              key={s}
              className={cx(
                "relative border rounded-2xl p-3 md:p-4 flex flex-col shadow-sm bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm",
                draggingId ? STATUS_RING[s] : "",
                "transition-all"
              )}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, s)}
            >
              <div className={cx("absolute inset-x-0 top-0 h-10 rounded-t-2xl pointer-events-none bg-gradient-to-b", STATUS_GRADIENT[s])}></div>
              <div className="flex items-center justify-between mb-3 relative z-[1]">
                <h2 className="font-semibold capitalize text-slate-800 dark:text-slate-100">{LABEL[s]}</h2>
                <span className="text-xs bg-slate-200/70 dark:bg-slate-700/70 rounded-full px-2 py-0.5">
                  {columns[s].length}
                </span>
              </div>
              <div className="flex-1 rounded-xl min-h-[200px] p-2">
                {columns[s].map((t) => {
                  const meta = dueMeta(t);
                  return (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, t.id)}
                      onClick={() => openEditor(t)}
                      className="rounded-2xl border bg-white dark:bg-slate-900 p-3 shadow-sm mb-2 cursor-pointer hover:shadow-md transition-all ring-1 ring-black/5 dark:ring-white/10 min-w-0"
                    >
                      <div className="grid grid-cols-[1fr_auto] gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium break-words hyphens-auto line-clamp-2 text-slate-800 dark:text-slate-100">
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
                              {t.description}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 inline-block max-w-[6.5rem] truncate">
                            code {t.code}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between mt-2 text-xs gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cx("rounded-full px-2 py-0.5 border", PR_CHIP[t.priority])}>{t.priority}</span>
                          <span>{t.progress ?? 0}%</span>
                        </div>

                        <div className="w-full sm:w-auto sm:ml-auto order-last sm:order-none max-w-full sm:max-w-[16rem] text-right">
                          {t.due_at && (
                            <div className="truncate text-slate-600 dark:text-slate-300">
                              กำหนด {fmtDate(t.due_at)}
                            </div>
                          )}
                          {meta.text && <div className={cx("truncate", meta.cls)}>{meta.text}</div>}
                        </div>
                      </div>

                      {/* progress bar */}
                      <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={cx(
                            "h-full rounded-full bg-gradient-to-r",
                            t.status === "done"
                              ? "from-emerald-400 to-emerald-500"
                              : t.status === "blocked"
                              ? "from-rose-400 to-rose-500"
                              : "from-indigo-400 to-sky-400"
                          )}
                          style={{ width: `${Math.min(100, Math.max(0, Number(t.progress ?? 0)))}%` }}
                        />
                      </div>

                      {t.tags && t.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-2 py-0.5"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
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
      </div>

      {/* ===== Modal: Progress Editor + Add to Calendar ===== */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeEditor} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl border bg-white/90 dark:bg-slate-900/90 p-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">จัดการงาน</div>
                <div className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">
                  {editTask.title}
                </div>
                <div className="text-xs text-slate-500 mt-1">code {editTask.code}</div>
              </div>
              <button
                onClick={closeEditor}
                className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                className="w-full accent-indigo-500"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-slate-600 dark:text-slate-300">{progressDraft}%</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={progressDraft}
                  onChange={(e) =>
                    setProgressDraft(Math.max(0, Math.min(100, Number(e.target.value))))
                  }
                  className="w-20 border rounded px-2 py-1 bg-white/80 dark:bg-slate-800/80"
                />
              </div>
            </div>

            {/* 🆕 Add to Calendar */}
            <div className="mt-6 border-t pt-4">
              <div className="text-sm font-medium mb-2">ลงตาราง (Google Calendar)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">อีเมลปฏิทิน (เชิญเข้าร่วม)</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2 bg-white/80 dark:bg-slate-800/80"
                    placeholder="name@example.com"
                    value={calEmail}
                    onChange={(e) => setCalEmail(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">ชื่อเหตุการณ์</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2 bg-white/80 dark:bg-slate-800/80"
                    value={calTitle}
                    onChange={(e) => setCalTitle(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">รายละเอียด</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full border rounded px-3 py-2 bg-white/80 dark:bg-slate-800/80"
                    value={calDesc}
                    onChange={(e) => setCalDesc(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-600">วันที่</label>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded px-3 py-2 bg-white/80 dark:bg-slate-800/80"
                    value={calDate}
                    onChange={(e) => setCalDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-600">เริ่ม</label>
                    <input
                      type="time"
                      className="mt-1 w-full border rounded px-3 py-2 bg-white/80 dark:bg-slate-800/80"
                      value={calStart}
                      onChange={(e) => setCalStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">สิ้นสุด</label>
                    <input
                      type="time"
                      className="mt-1 w-full border rounded px-3 py-2 bg-white/80 dark:bg-slate-800/80"
                      value={calEnd}
                      onChange={(e) => setCalEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-slate-600">สถานที่ (ถ้ามี)</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2 bg-white/80 dark:bg-slate-800/80"
                    placeholder="ห้องประชุม / ลิงก์ประชุม ฯลฯ"
                    value={calLocation}
                    onChange={(e) => setCalLocation(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  onClick={addToCalendar}
                  className="px-3 py-2 rounded bg-gradient-to-r from-emerald-600 to-teal-500 text-white"
                >
                  เพิ่มใน Google Calendar
                </button>
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                * ระบบจะเปิดหน้า Google Calendar พร้อมกรอกข้อมูลให้ และเชิญอีเมลที่ระบุเป็นผู้เข้าร่วม
                หากต้องการให้บันทึกลง “ปฏิทินของอีเมลนั้นโดยอัตโนมัติ” ต้องทำ OAuth ฝั่งเซิร์ฟเวอร์เพิ่มเติม
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeEditor}
                className="px-3 py-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                ปิด
              </button>
              <button
                onClick={saveProgress}
                className="px-3 py-2 rounded bg-gradient-to-r from-indigo-600 to-sky-500 text-white"
              >
                บันทึกความคืบหน้า
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
