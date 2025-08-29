// Suggested file: app/liff/kanban/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";

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
    const id = e.dataTransfer.getData("text/plain") || draggingId;
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
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4 mb-4">
        <div className="flex-1">
          <label className="text-sm mb-1 block">Group ID</label>
          <input
            className="border px-3 py-2 rounded w-full"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            placeholder="กรอก Group ID หรือเปิดผ่าน LIFF เพื่อดึงอัตโนมัติ"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm mb-1 block">Admin Key</label>
          <input
            className="border px-3 py-2 rounded w-full"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="ADMIN_KEY"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm mb-1 block">ค้นหา</label>
          <input
            className="border px-3 py-2 rounded w-full"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="คำค้น เช่น เอกสาร, @ชื่อ, tag"
          />
        </div>
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          onClick={load}
          disabled={loading || !groupId || !adminKey}
        >{loading ? "กำลังโหลด..." : "รีเฟรช"}</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 min-h-[60vh]">
        {STATUSES.map((s) => (
          <div key={s} className="bg-gray-50 border rounded-2xl p-3 md:p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold capitalize">{LABEL[s]}</h2>
              <span className="text-xs bg-gray-200 rounded px-2 py-1">{columns[s].length}</span>
            </div>

            <div
              className={cx(
                "flex-1 rounded-xl min-h-[200px] p-2 transition-all",
                draggingId ? "ring-2 ring-blue-300" : ""
              )}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, s)}
            >
              {columns[s].map((t) => (
                <article
                  key={t.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, t.id)}
                  className={cx(
                    "rounded-xl border bg-white p-3 shadow-sm mb-2 cursor-move hover:shadow-md",
                    t.status === "done" ? "opacity-70" : ""
                  )}
                  title={`code=${t.code}`}
                >
 <div className="grid grid-cols-[1fr_auto] gap-3">
  <div className="min-w-0">
    <div className="text-sm font-medium leading-5 break-words line-clamp-2">
       {t.title}
    </div>
                      {t.description && (
                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {t.description}
                          </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] bg-gray-100 rounded px-2 py-1 inline-block">code {t.code}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 text-xs text-gray-600 gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cx(
                        "rounded px-2 py-0.5",
                        t.priority === "urgent" && "bg-red-100 text-red-700",
                        t.priority === "high" && "bg-orange-100 text-orange-700",
                        t.priority === "medium" && "bg-yellow-100 text-yellow-700",
                        t.priority === "low" && "bg-green-100 text-green-700",
                      )}>{t.priority}</span>
                      <span>{t.progress ?? 0}%</span>
                    </div>
                    <div className="whitespace-nowrap text-right">
                      {t.due_at ? `กำหนด ${fmtDate(t.due_at)}` : ""}
                      </div>
                  </div>

                  {t.tags && t.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.tags.map((tag, i) => (
                        <span key={i} className="text-[10px] bg-gray-100 rounded px-2 py-0.5">#{tag}</span>
                      ))}
                    </div>
                  )}
                </article>
              ))}

              {columns[s].length === 0 && (
                <div className="text-xs text-gray-500 italic">(ลากการ์ดมาวางที่นี่)</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
