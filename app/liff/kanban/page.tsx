// Suggested file: app/liff/kanban/page.tsx
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

// ===== Page =====
export default function KanbanPage() {
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Task[]>([]);

  // Try to hydrate defaults from localStorage (same keys you used on /liff)
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

  // ===== Render =====
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 min-h-screen">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4 mb-4">
        <div className="flex-1">
          <label className="text-sm mb-1 block text-slate-600 dark:text-slate-300">Group ID</label>
          <input
            className="border px-3 py-2 rounded w-full bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            placeholder="กรอก Group ID หรือเปิดผ่าน LIFF เพื่อดึงอัตโนมัติ"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm mb-1 block text-slate-600 dark:text-slate-300">Admin Key</label>
          <input
            className="border px-3 py-2 rounded w-full bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="ADMIN_KEY"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm mb-1 block text-slate-600 dark:text-slate-300">ค้นหา</label>
          <input
            className="border px-3 py-2 rounded w-full bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="คำค้น เช่น เอกสาร, @ชื่อ, tag"
          />
        </div>
        <button
          className="px-4 py-2 rounded bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-sm hover:shadow-md active:scale-[.98] disabled:opacity-50"
          onClick={load}
          disabled={loading || !groupId || !adminKey}
        >{loading ? "กำลังโหลด..." : "รีเฟรช"}</button>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 min-h-[60vh]">
        {STATUSES.map((s) => (
          <div key={s} className={cx(
            "relative border rounded-2xl p-3 md:p-4 flex flex-col shadow-sm bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm",
            draggingId ? STATUS_RING[s] : "",
            "transition-all"
          )}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, s)}>
            {/* gradient header tint */}
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
                  className={cx(
                    "rounded-2xl border bg-white dark:bg-slate-900 p-3 md:p-3 shadow-sm mb-2 cursor-move hover:shadow-md transition-all",
                    t.status === "done" ? "opacity-80" : "",
                    "ring-1 ring-black/5 dark:ring-white/10"
                  )}
                  title={`code=${t.code}`}
                >
                  {/* top accent */}
                  <div className="h-1.5 -mt-3 -mx-3 md:-mx-3 rounded-t-2xl bg-gradient-to-r from-white/0 via-white/60 to-white/0 dark:via-slate-700/60" />

                  {/* title + code */}
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-5 break-words line-clamp-2 text-slate-800 dark:text-slate-100">{t.title}</div>
                      {t.description && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{t.description}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 inline-block text-slate-600 dark:text-slate-300">code {t.code}</div>
                    </div>
                  </div>

                  {/* meta row */}
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-600 dark:text-slate-400 gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cx("rounded-full px-2 py-0.5 border", PR_CHIP[t.priority])}>{t.priority}</span>
                      <span>{t.progress ?? 0}%</span>
                    </div>
                    <div className="whitespace-nowrap text-right">
                      {t.due_at ? `กำหนด ${fmtDate(t.due_at)}` : ""}
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

                  {/* tags */}
                  {t.tags && t.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.tags.map((tag, i) => (
                        <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-2 py-0.5">#{tag}</span>
                      ))}
                    </div>
                  )}
                </article>
              ))}

              {columns[s].length === 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 italic">(ลากการ์ดมาวางที่นี่)</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
