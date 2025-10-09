// app/liff/kanban/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";

/* =========================
   Types
========================= */
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

type Column = {
  key: Status;
  title: string;
  hint?: string;
};

/* =========================
   Constants
========================= */
const COLUMNS: Column[] = [
  { key: "todo",         title: "To Do" },
  { key: "in_progress",  title: "In Progress" },
  { key: "blocked",      title: "Blocked",   hint: "(รอการดำเนินการ)" },
  { key: "done",         title: "Done" },
  { key: "cancelled",    title: "Cancelled" },
];

const STATUS: Status[] = ["todo","in_progress","blocked","done","cancelled"];
const PRIORITIES: Priority[] = ["low","medium","high","urgent"];

const WEEKDAY_TH = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];  // groupId
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];   // adminKey

// ===== remember only Calendar ID =====
const LS_CAL_ID = "taskbot_cal_calendarId";
const safeGet = (k: string) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

/* =========================
   Helpers
========================= */
const readFirst = (keys: string[]): string => {
  try { for (const k of keys) { const v = localStorage.getItem(k); if (v) return v; } } catch {}
  return "";
};
const writeAll = (keys: string[], value: string) => { try { keys.forEach(k => localStorage.setItem(k, value)); } catch {} };

const tagsToStr = (tags: string[] | null | undefined) => (tags ?? []).join(", ");
const parseTags = (s: string) => (s ?? "").split(",").map(x=>x.trim()).filter(Boolean);

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : "";

/* =========================
   Component
========================= */
export default function KanbanPage() {
  // route/keys
  const [ready, setReady] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");

  // data
  const [items, setItems] = useState<Task[]>([]);
  const [q, setQ] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Record<string, Partial<Task>>>({});

  // selection (multi)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string, on?: boolean) =>
    setSelected(prev => { const s = new Set(prev); (on ?? !s.has(id)) ? s.add(id) : s.delete(id); return s; });
  const clearSel = () => setSelected(new Set());
  const selectAllInStatus = (status: Status) =>
    setSelected(new Set(items.filter(i => i.status === status).map(i => i.id)));

  // editor modal
  const [editTask, setEditTask] = useState<Task | null>(null);

  // ===== Calendar form (จำแค่ Calendar ID) =====
  const [calCalendarId, setCalCalendarId] = useState("");

  // preload only calendar id from LS once
  useEffect(() => { setCalCalendarId(safeGet(LS_CAL_ID)); }, []);

  // ===== init keys (URL -> localStorage -> LIFF) =====
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const qsGid = url.searchParams.get("group_id");
      const qsKey = url.searchParams.get("key");

      if (qsGid) { setGroupId(qsGid); writeAll(GID_KEYS, qsGid); }
      if (qsKey) { setAdminKey(qsKey); writeAll(KEY_KEYS, qsKey); }

      if (!qsGid) { const lsGid = readFirst(GID_KEYS); if (lsGid) setGroupId(lsGid); }
      if (!qsKey) { const lsKey = readFirst(KEY_KEYS); if (lsKey) setAdminKey(lsKey); }

      try {
        const liff: any = (window as any).liff;
        if (process.env.NEXT_PUBLIC_LIFF_ID) {
          if (liff && !liff.isInitialized?.()) await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
          if (liff?.isLoggedIn && !liff.isLoggedIn()) { liff.login(); return; }
          const ctx = liff?.getContext?.();
          if (!groupId && ctx?.type === "group" && ctx.groupId) {
            setGroupId(ctx.groupId); writeAll(GID_KEYS, ctx.groupId);
          }
        }
      } catch {}

      setReady(true);
    })();
  }, []);

  // load tasks
  const load = async () => {
    if (!groupId || !adminKey) return;
    const r = await fetch(`/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(adminKey)}`);
    const j = r.ok ? await r.json() : [];
    setItems(Array.isArray(j) ? j : (j.items ?? []));
    clearSel();
  };
  useEffect(() => { if (ready && groupId && adminKey) load(); /* eslint-disable-next-line */ }, [ready, groupId, adminKey]);

  // helpers
  const markSaving = (id: string, on: boolean) =>
    setSavingIds(prev => { const s = new Set(prev); on ? s.add(id) : s.delete(id); return s; });

  const change = (id: string, patch: Partial<Task>) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }));

  const applyDraftToItem = (item: Task, patch: Partial<Task> = {}) => {
    const d = draft[item.id] || {};
    return { ...item, ...d, ...patch };
  };

  // save one row
  const saveRow = async (id: string, extra?: Partial<Task>) => {
    const body = { ...(draft[id] || {}), ...(extra || {}) };
    if (!Object.keys(body).length) return;

    // optimistic
    setItems(prev => prev.map(x => x.id === id ? ({ ...x, ...body }) as Task : x));
    markSaving(id, true);

    try {
      const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      setDraft(d => { const { [id]:_, ...rest } = d; return rest; });
      await load();
    } catch (e) {
      // rollback by reload
      await load();
      alert("บันทึกไม่สำเร็จ");
    } finally {
      markSaving(id, false);
    }
  };

  // delete selected
  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`ลบ ${selected.size} งาน?`)) return;
    const ids = Array.from(selected);
    // optimistic
    setItems(prev => prev.filter(x => !selected.has(x.id)));
    await Promise.all(ids.map(id =>
      fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, { method: "DELETE" })
    ));
    clearSel();
    await load();
  };

  // drag & drop (ใช้ pointer events อย่างง่าย)
  const onDropTo = async (status: Status, task: Task) => {
    const extra: Partial<Task> = { status };
    if (status === "done") extra.progress = 100; // ✅ auto 100% when Done
    await saveRow(task.id, extra);
  };

  // group by column
  const byCol = useMemo(() => {
    const map: Record<Status, Task[]> = {
      todo: [], in_progress: [], blocked: [], done: [], cancelled: []
    };
    for (const t of items) map[t.status].push(t);
    return map;
  }, [items]);

  // open editor (modal)
  const openEditor = (t: Task) => {
    setEditTask(t);
  };

  // add to google calendar (uses only calendarId)
  const addToCalendar = async () => {
    if (!editTask) return;
    if (!calCalendarId.trim()) {
      alert("กรอก Calendar ID ก่อน");
      return;
    }
    // จดจำ calendar id
    safeSet(LS_CAL_ID, calCalendarId);

    const baseDate = editTask.due_at
      ? new Date(editTask.due_at)
      : new Date();

    // default: 09:00 - 10:00 (เวลาไทย)
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(baseDate); // yyyy-mm-dd

    const startISO = new Date(`${dateStr}T09:00:00+07:00`).toISOString();
    const endISO   = new Date(`${dateStr}T10:00:00+07:00`).toISOString();

    try {
      const r = await fetch("/api/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId: calCalendarId,
          title: editTask.title || "New event",
          description: editTask.description || undefined,
          location: undefined,
          startISO,
          endISO,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "failed");
      alert("เพิ่มใน Google Calendar สำเร็จ");
      setEditTask(null);
    } catch (e: any) {
      alert(`ลงตารางไม่สำเร็จ — ${e?.message || e}`);
    }
  };

  // top bar buttons
  const openDashboard = () => {
    const u = new URL("/liff/dashboard", location.origin);
    if (groupId) u.searchParams.set("group_id", groupId);
    if (adminKey) u.searchParams.set("key", adminKey);
    window.open(u.toString(), "_self");
  };

  /* ============== UI ============== */
  return (
    <div className="min-h-screen bg-slate-50">
      <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />

      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b">
        <div className="h-14 px-4 md:px-8 flex items-center gap-3">
          <div className="font-semibold">mdes-task-bot — Kanban</div>
          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm">
            <a className="hover:underline" href="/liff">Tasks</a>
            <a className="font-semibold border-b-2 border-emerald-500" href="/liff/kanban">Kanban</a>
            <a className="hover:underline" onClick={openDashboard}>Dashboard</a>
          </nav>
          <button className="md:hidden ml-auto bg-emerald-600 text-white px-3 py-2 rounded" onClick={openDashboard}>
            Dashboard
          </button>
        </div>
      </header>

      <main className="px-4 md:px-8 py-5">
        {/* controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input className="border px-3 py-2 rounded w-60"
                 placeholder="ค้นหา"
                 value={q}
                 onChange={e=>setQ(e.target.value)} />
          <button className="px-3 py-2 rounded bg-black text-white" onClick={load}>รีเฟรช</button>

          {/* bulk delete visible when selected */}
          {selected.size > 0 && (
            <button className="ml-2 px-3 py-2 rounded bg-rose-600 text-white" onClick={bulkDelete}>
              ลบ {selected.size} งานที่เลือก
            </button>
          )}
        </div>

        {/* board */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {COLUMNS.map(col => {
            const tasks = byCol[col.key] || [];
            return (
              <div key={col.key} className="bg-white rounded-2xl border shadow-sm p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{col.title}</div>
                  <div className="text-xs text-slate-500">{tasks.length}</div>
                </div>
                {col.hint && <div className="text-xs text-slate-500 mb-2">{col.hint}</div>}

                {/* select all + dropzone */}
                <div className="flex items-center justify-between mb-2">
                  <button className="text-xs text-slate-600 underline"
                          onClick={() => selectAllInStatus(col.key)}>
                    เลือกทั้งหมด
                  </button>
                  <span className="text-[10px] text-slate-400">ลากการ์ดมาวางเพื่อย้ายสถานะ</span>
                </div>

                <div
                  className="min-h-[200px] space-y-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const payload = e.dataTransfer.getData("text/plain");
                    if (!payload) return;
                    try {
                      const t: Task = JSON.parse(payload);
                      onDropTo(col.key, t);
                    } catch {}
                  }}
                >
                  {tasks.map(t => {
                    const d = draft[t.id] || {};
                    const cur = { ...t, ...d };
                    const isSaving = savingIds.has(t.id);
                    const late = cur.due_at ? (new Date(cur.due_at).getTime() < Date.now() && cur.status !== "done") : false;

                    return (
                      <div
                        key={t.id}
                        className="group rounded-xl border p-3 bg-white hover:bg-slate-50"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify(t))}
                      >
                        {/* header */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-sm font-medium line-clamp-2">{cur.title || "(ไม่มีชื่อ)"}</div>
                          {/* Save button */}
                          <button
                            className="text-xs px-2 py-1 rounded bg-blue-600 text-white opacity-0 group-hover:opacity-100 transition"
                            onClick={() => saveRow(t.id)}
                            disabled={isSaving}
                          >
                            {isSaving ? "Saving…" : "Save"}
                          </button>
                        </div>

                        {/* meta */}
                        <div className="flex items-center gap-2 text-[11px] mb-2">
                          <span className="font-mono text-slate-500">{/* show tags instead of code */}
                            {(cur.tags ?? []).slice(0,2).map(tag => (
                              <span key={tag} className="mr-1 inline-flex items-center rounded px-1.5 py-0.5 bg-slate-100 text-slate-700">
                                #{tag}
                              </span>
                            ))}
                          </span>
                          {cur.priority && (
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 ${
                              cur.priority==="urgent" ? "bg-rose-100 text-rose-700" :
                              cur.priority==="high"   ? "bg-orange-100 text-orange-700" :
                              cur.priority==="medium" ? "bg-amber-100 text-amber-700" :
                                                        "bg-slate-100 text-slate-600"
                            }`}>{cur.priority}</span>
                          )}
                          {cur.due_at && (
                            <span className={`ml-auto inline-flex items-center rounded px-1.5 py-0.5 ${
                              late ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {fmtDate(cur.due_at)}
                            </span>
                          )}
                        </div>

                        {/* controls */}
                        <div className="space-y-2">
                          <textarea
                            className="w-full border rounded px-2 py-1 text-sm"
                            rows={2}
                            placeholder="รายละเอียด"
                            value={cur.description ?? ""}
                            onChange={e=>change(t.id,{ description:e.target.value })}
                          />

                          <div className="flex items-center gap-2">
                            <select
                              className="border rounded px-2 py-1 text-sm"
                              value={cur.status}
                              onChange={e=>change(t.id,{ status: e.target.value as Status })}
                            >
                              {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>

                            <input
                              type="number" min={0} max={100}
                              className="w-20 border rounded px-2 py-1 text-sm text-center"
                              value={cur.progress ?? 0}
                              onChange={e=>change(t.id,{ progress: Number(e.target.value) })}
                            />

                            <button
                              className="ml-auto text-xs px-2 py-1 rounded border"
                              onClick={()=>openEditor(t)}
                            >
                              เพิ่มใน Google Calendar
                            </button>

                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              onChange={e=>toggleSel(t.id, e.target.checked)}
                              title="เลือกงานนี้"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Editor Modal: Add to Google Calendar */}
        {editTask && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">ลงตาราง (Google Calendar)</div>
                <button className="text-slate-500 hover:text-black" onClick={()=>setEditTask(null)}>✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-sm text-slate-600">Calendar ID (เช่น primary หรือ your@domain.com)</label>
                  <input
                    className="mt-1 w-full border rounded px-3 py-2"
                    placeholder="เช่น primary หรือ your@domain.com"
                    value={calCalendarId}
                    onChange={(e) => {
                      setCalCalendarId(e.target.value);
                      safeSet(LS_CAL_ID, e.target.value); // ✅ จำเฉพาะ Calendar ID
                    }}
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    * ระบบจะใช้ Service Account สร้าง Event ในปฏิทินนี้ (ต้องแชร์สิทธิ์ให้ Service Account: “Make changes to events”)
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-600">ชื่อเหตุการณ์</label>
                  <input className="mt-1 w-full border rounded px-3 py-2"
                    value={editTask.title || ""}
                    onChange={e => setEditTask(et => et ? { ...et, title: e.target.value } : et)}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600">วันกำหนดส่ง (อ้างอิง)</label>
                  <input className="mt-1 w-full border rounded px-3 py-2" type="date"
                    value={fmtDate(editTask.due_at)}
                    onChange={e => setEditTask(et => et ? { ...et, due_at: e.target.value || null } : et)}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-sm text-slate-600">รายละเอียด</label>
                  <textarea className="mt-1 w-full border rounded px-3 py-2" rows={3}
                    value={editTask.description ?? ""}
                    onChange={e => setEditTask(et => et ? { ...et, description: e.target.value } : et)}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button className="px-3 py-2 rounded border" onClick={()=>setEditTask(null)}>ปิด</button>
                <button className="px-3 py-2 rounded bg-emerald-600 text-white" onClick={addToCalendar}>
                  เพิ่มใน Google Calendar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
