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

// 🆕 helper สำหรับเช็ควันครบกำหนด
const dueClass = (due_at: string | null) => {
  if (!due_at) return "text-gray-500";
  const d = new Date(due_at).getTime();
  const now = Date.now();
  return d < now ? "text-red-600 font-semibold" : "text-green-600 font-semibold";
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

// ===== Page =====
export default function KanbanPage() {
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Task[]>([]);

  // Progress editor state
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [progressDraft, setProgressDraft] = useState<number>(0);

  // Try to hydrate defaults from localStorage
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
      const r = await fetch(`/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`);
      if (!r.ok) throw new Error(await r.text());
      const rows: Task[] = await r.json();
      setData(rows);
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

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function onDrop(e: React.DragEvent, next: Status) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    const id = raw || draggingId;
    if (!id) return;
    try {
      // Optimistic UI
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

  // ===== Progress Editor (Modal) =====
  function openEditor(t: Task) {
    setEditTask(t);
    setProgressDraft(Math.max(0, Math.min(100, Number(t.progress ?? 0))));
  }
  function closeEditor() {
    setEditTask(null);
  }
  async function saveProgress() {
    if (!editTask) return;
    const id = editTask.id;
    const newValue = Math.max(0, Math.min(100, Number(progressDraft)));
    try {
      // optimistic
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

      <div className="p-4 md:p-6 max-w-[1400px] mx-auto flex-1">
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
                <span className="text-xs bg-slate-200/70 dark:bg-slate-700/70 rounded-full px-2 py-0.5">{columns[s].length}</span>
              </div>
              <div className="flex-1 rounded-xl min-h-[200px] p-2">
                {columns[s].map((t) => (
                  <article
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id)}
                    onClick={() => openEditor(t)}
                    className="rounded-2xl border bg-white dark:bg-slate-900 p-3 shadow-sm mb-2 cursor-pointer hover:shadow-md transition-all ring-1 ring-black/5 dark:ring-white/10"
                  >
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium line-clamp-2 text-slate-800 dark:text-slate-100">{t.title}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 inline-block">code {t.code}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs gap-2">
                      <div className="flex items-center gap-2">
                        <span className={cx("rounded-full px-2 py-0.5 border", PR_CHIP[t.priority])}>{t.priority}</span>
                        <span>{t.progress ?? 0}%</span>
                      </div>
                      {/* 🆕 due date สี */}
                      <div className={cx("whitespace-nowrap", dueClass(t.due_at))}>
                        {t.due_at ? `กำหนด ${fmtDate(t.due_at)}` : ""}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Progress Editor (เหมือนเดิม) */}
  
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeEditor} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl border bg-white/90 dark:bg-slate-900/90 p-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">ปรับความคืบหน้า</div>
                <div className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2">{editTask.title}</div>
                <div className="text-xs text-slate-500 mt-1">code {editTask.code}</div>
              </div>
              <button
                onClick={closeEditor}
                className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >✕</button>
            </div>

            <div className="mt-4">
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
                  onChange={(e) => setProgressDraft(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-20 border rounded px-2 py-1 bg-white/80 dark:bg-slate-800/80"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={closeEditor} className="px-3 py-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">ยกเลิก</button>
              <button onClick={saveProgress} className="px-3 py-2 rounded bg-gradient-to-r from-indigo-600 to-sky-500 text-white">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
