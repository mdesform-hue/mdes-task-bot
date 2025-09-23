// app/liff/page.tsx
"use client";
import { useEffect, useState, useMemo } from "react";
import Script from "next/script";

type Task = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  progress: number;
  priority: "low" | "medium" | "high" | "urgent";
  tags: string[] | null;
  due_at: string | null;
  group_id: string;
  created_at: string;
  updated_at: string;
};

const STATUS = ["todo","in_progress","blocked","done","cancelled"] as const;
const PRIORITIES = ["low","medium","high","urgent"] as const;
const WEEKDAY_TH = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]; // เริ่ม จันทร์

// keys กลาง + สำรอง (ให้สองหน้าคุยกันรู้เรื่อง)
const GID_KEYS = ["taskbot_gid", "liff_group_id", "LS_GID"];  // groupId
const KEY_KEYS = ["taskbot_key", "admin_key", "ADMIN_KEY"];   // adminKey

const readFirst = (keys: string[]): string => {
  try { for (const k of keys) { const v = localStorage.getItem(k); if (v) return v; } } catch {}
  return "";
};
const writeAll = (keys: string[], value: string) => { try { keys.forEach(k => localStorage.setItem(k, value)); } catch {} };

// helpers
const tagsToStr = (tags: string[] | null | undefined) => (tags ?? []).join(", ");
const parseTags = (s: string) => s.split(",").map(x=>x.trim()).filter(Boolean);
const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : "";

export default function LiffAdminPage() {
  const [ready, setReady] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Task[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<Task>>>({});
  const [creating, setCreating] = useState<Partial<Task>>({
    title: "", due_at: null, description: "", priority: "medium", tags: []
  });

  // lock fields
  const [editGid, setEditGid] = useState(false);
  const [editKey, setEditKey] = useState(false);

  // bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string, on?: boolean) =>
    setSelected(prev => {
      const s = new Set(prev);
      if (on ?? !s.has(id)) s.add(id); else s.delete(id);
      return s;
    });
  const clearSel = () => setSelected(new Set());
  const selectAllVisible = () => setSelected(new Set(items.map(i => i.id)));

  // calendar
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // ========= init: URL -> localStorage -> LIFF context =========
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const qsGid = url.searchParams.get("group_id");
      const qsKey = url.searchParams.get("key");

      // 1) จาก URL มาก่อน
      if (qsGid) { setGroupId(qsGid); writeAll(GID_KEYS, qsGid); }
      if (qsKey) { setAdminKey(qsKey); writeAll(KEY_KEYS, qsKey); }

      // 2) ถ้าไม่มีใน URL → ลอง localStorage
      if (!qsGid) {
        const lsGid = readFirst(GID_KEYS);
        if (lsGid) setGroupId(lsGid);
      }
      if (!qsKey) {
        const lsKey = readFirst(KEY_KEYS);
        if (lsKey) setAdminKey(lsKey);
      }

      // 3) ถ้ายังไม่มี groupId → ใช้ LIFF context (เฉพาะเปิดใน LINE)
      try {
        const liff: any = (window as any).liff;
        if (process.env.NEXT_PUBLIC_LIFF_ID) {
          if (liff && !liff.isInitialized?.()) await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
          if (liff?.isLoggedIn && !liff.isLoggedIn()) { liff.login(); return; }
          const ctx = liff?.getContext?.();
          if (ctx?.type === "group" && ctx.groupId) {
            setGroupId(ctx.groupId);
            writeAll(GID_KEYS, ctx.groupId);
          }
        }
      } catch (e) {
        console.error("LIFF init error", e);
      }

      setReady(true);
    })();
  }, []);

  const load = async () => {
    if (!groupId || !adminKey) return;
    const r = await fetch(`/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(adminKey)}`);
    if (!r.ok) {
      alert(await r.text());
      setItems([]);
      clearSel();
      return;
    }
    const j = await r.json();
    setItems(Array.isArray(j) ? j : (j.items ?? []));
    clearSel();
  };
  useEffect(() => { if (ready && groupId && adminKey) load(); /* eslint-disable-next-line */ }, [ready, groupId, adminKey]);

  const change = (id: string, patch: Partial<Task>) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }));

  // optimistic helper: รวมค่า draft เข้า item
  function applyDraftToItem(item: Task, patch: Partial<Task> = {}) {
    const d = draft[item.id] || {};
    return { ...item, ...d, ...patch };
  }

  const saveRow = async (id: string, extra?: Partial<Task>) => {
    const body = { ...(draft[id] || {}), ...(extra || {}) };
    if (!Object.keys(body).length) return;

    // optimistic UI
    setItems(prev => prev.map(x => x.id === id ? ({ ...x, ...body }) as Task : x));

    const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });

    if (r.ok) {
      setDraft(d => { const { [id]:_, ...rest } = d; return rest; });
      // ดึงค่าจริงกลับ (เผื่อ server แก้อะไรเพิ่ม)
      await load();
      alert("บันทึกแล้ว");
    } else {
      alert(await r.text());
    }
  };

  const delRow = async (id: string) => {
    if (!confirm("ลบงานนี้?")) return;
    // optimistic remove
    setItems(prev => prev.filter(x => x.id !== id));
    const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, { method: "DELETE" });
    if (!r.ok) {
      alert(await r.text());
      load();
    }
  };

  const createRow = async () => {
    if (!creating.title) return alert("กรอกชื่อเรื่องก่อน");
    const body = { group_id: groupId, ...creating };
    const r = await fetch(`/api/admin/tasks?key=${encodeURIComponent(adminKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    if (r.ok) {
      setCreating({ title: "", due_at: null, description: "", priority: "medium", tags: [] });
      await load();
      alert("สร้างงานแล้ว");
    } else {
      alert(await r.text());
    }
  };

  // bulk actions
  const [bulkStatus, setBulkStatus] = useState<Task["status"]>("in_progress");
  const [bulkDue, setBulkDue] = useState<string>("");
  const bulkApplyStatus = async () => {
    if (!selected.size) return;
    // optimistic
    setItems(prev => prev.map(x => selected.has(x.id) ? ({ ...x, status: bulkStatus }) as Task : x));
    await Promise.all(Array.from(selected).map(id =>
      fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: bulkStatus })
      })
    ));
    await load();
  };
  const bulkApplyDue = async () => {
    if (!selected.size || !bulkDue) return;
    // optimistic
    setItems(prev => prev.map(x => selected.has(x.id) ? ({ ...x, due_at: bulkDue }) as Task : x));
    await Promise.all(Array.from(selected).map(id =>
      fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ due_at: bulkDue })
      })
    ));
    await load();
  };
  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`ลบ ${selected.size} งาน?`)) return;
    // optimistic
    const ids = new Set(selected);
    setItems(prev => prev.filter(x => !ids.has(x.id)));
    await Promise.all(Array.from(selected).map(id =>
      fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, { method: "DELETE" })
    ));
    await load();
  };

  const saveGid = () => { writeAll(GID_KEYS, groupId); setEditGid(false); load(); };
  const saveKey = () => { writeAll(KEY_KEYS, adminKey); setEditKey(false); load(); };
  const copyLink = () => {
    const u = new URL(location.href);
    u.searchParams.set("key", adminKey || "");
    if (groupId) u.searchParams.set("group_id", groupId);
    navigator.clipboard.writeText(u.toString());
    alert("คัดลอกลิงก์แล้ว");
  };

  // ===== calendar helpers =====
  const y = monthCursor.getFullYear();
  const m = monthCursor.getMonth();
  const firstOfMonth = new Date(y, m, 1);
  const offsetMon = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(y, m, 1 - offsetMon);
  const daysGrid: Date[] = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 42; i++) arr.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    return arr;
  }, [gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate()]);
  const keyFromDate = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const keyFromISO = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const mapByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of items) {
      if (!t.due_at) continue;
      const k = keyFromISO(t.due_at);
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    }
    map.forEach((arr, k) => {
      arr.sort((a, b) => (a.status > b.status ? 1 : -1) || a.title.localeCompare(b.title));
      map.set(k, arr);
    });
    return map;
  }, [items]);
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(firstOfMonth);
  const todayKey = keyFromDate(new Date());

  return (
    <div className="min-h-screen bg-white">
      {/* Global header */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="w-full px-4 md:px-8 h-14 flex items-center gap-4">
          <div className="font-semibold text-slate-800">mdes-task-bot — LIFF Admin</div>
          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm text-slate-600">
            <a className="text-slate-900 border-b-2 border-emerald-500" href="/liff">Tasks</a>
            <a className="hover:text-slate-900" href="/liff/kanban">Kanban</a>
            <a className="hover:text-slate-900" href="/liff/dashboard">Dashboard</a>
          </nav>
          <a
            href="/liff/kanban"
            className="md:hidden ml-auto inline-flex items-center justify-center rounded px-3 py-2 bg-green-600 text-white"
          >
            Kanban
          </a>
        </div>
      </header>

      <main className="w-full px-4 md:px-8 py-6 md:py-8">
        {/* โหลด LIFF SDK ของ LINE */}
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />

        {/* Title */}
        <div className="mb-5 md:mb-7">
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Tasks</h1>
          <p className="text-slate-600 text-sm">จัดการงานของกลุ่ม</p>
        </div>

        {/* ===== Toolbar ===== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="flex flex-col">
            <label className="text-sm mb-1">Group ID</label>
            <div className="flex gap-2">
              <input className="border px-3 py-3 md:py-2 rounded w-full disabled:bg-gray-100" value={groupId} disabled={!editGid} onChange={e=>setGroupId(e.target.value)} />
              {!editGid
                ? <button className="px-3 py-3 md:py-2 rounded border" onClick={()=>setEditGid(true)}>เปลี่ยน</button>
                : <button className="px-3 py-3 md:py-2 rounded bg-blue-600 text-white" onClick={saveGid}>บันทึก</button>}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-sm mb-1">Admin Key</label>
            <div className="flex gap-2">
              <input className="border px-3 py-3 md:py-2 rounded w-full disabled:bg-gray-100" value={adminKey} disabled={!editKey} onChange={e=>setAdminKey(e.target.value)} />
              {!editKey
                ? <button className="px-3 py-3 md:py-2 rounded border" onClick={()=>setEditKey(true)}>เปลี่ยน</button>
                : <button className="px-3 py-3 md:py-2 rounded bg-blue-600 text-white" onClick={saveKey}>บันทึก</button>}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-sm mb-1">ค้นหา</label>
            <div className="flex gap-2">
              <input className="border px-3 py-3 md:py-2 rounded w-full" value={q} onChange={e=>setQ(e.target.value)} />
              <button className="bg-black text-white px-3 py-3 md:py-2 rounded" onClick={load}>รีเฟรช</button>
              <button
                className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-3 md:py-2 rounded"
                onClick={() => {
                  const url = new URL("/liff/kanban", location.origin);
                  if (groupId) url.searchParams.set("group_id", groupId);
                  if (adminKey) url.searchParams.set("key", adminKey);
                  window.open(url.toString(), "_self");
                }}
              >
                เปิด Kanban
              </button>
            </div>
          </div>
        </div>

        {/* ===== Bulk actions ===== */}
        {selected.size > 0 && (
          <div className="mb-4 p-3 border rounded-lg bg-yellow-50 flex flex-wrap items-center gap-3">
            <div className="text-sm">เลือกแล้ว: <b>{selected.size}</b> งาน</div>
            <button className="px-3 py-2 rounded border" onClick={selectAllVisible}>เลือกทั้งหมด</button>
            <button className="px-3 py-2 rounded border" onClick={clearSel}>ล้าง</button>

            <div className="flex items-center gap-2">
              <span className="text-sm">สถานะ:</span>
              <select className="border rounded px-2 py-2" value={bulkStatus} onChange={e=>setBulkStatus(e.target.value as Task["status"])}>
                {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={bulkApplyStatus}>Apply</button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm">กำหนด:</span>
              <input type="date" className="border rounded px-2 py-2" value={bulkDue} onChange={e=>setBulkDue(e.target.value)} />
              <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={bulkApplyDue}>Apply</button>
            </div>

            <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={bulkDelete}>ลบที่เลือก</button>
          </div>
        )}

        {/* ===== Create row ===== */}
        <div className="mb-4 md:mb-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
          <input className="md:col-span-3 border px-3 py-3 md:py-2 rounded" placeholder="ชื่องานใหม่"
                 value={creating.title ?? ""} onChange={e=>setCreating(c=>({...c, title:e.target.value}))}/>
          <input className="md:col-span-3 border px-3 py-3 md:py-2 rounded" placeholder="รายละเอียด"
                 value={creating.description ?? ""} onChange={e=>setCreating(c=>({...c, description:e.target.value}))}/>
          <select className="md:col-span-2 border px-3 py-3 md:py-2 rounded"
                  value={(creating.priority as Task["priority"]) ?? "medium"}
                  onChange={e=>setCreating(c=>({...c, priority: e.target.value as Task["priority"]}))}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className="md:col-span-2 border px-3 py-3 md:py-2 rounded" placeholder="tags (comma)"
                 value={Array.isArray(creating.tags)? creating.tags.join(", ") : (creating.tags as any || "")}
                 onChange={e=>setCreating(c=>({...c, tags: parseTags(e.target.value)}))}/>
          <input className="md:col-span-2 border px-3 py-3 md:py-2 rounded" type="date"
                 value={creating.due_at ? fmtDate(creating.due_at) : ""}
                 onChange={e=>setCreating(c=>({...c, due_at: e.target.value || null}))}/>
          <button className="md:col-span-12 bg-green-600 text-white px-4 py-3 md:py-2 rounded" onClick={createRow}>+ Add</button>
        </div>

        {/* ===== Mobile: Cards (controlled) ===== */}
        <div className="space-y-3 md:hidden">
          {items.map(t => {
            const d = draft[t.id] || {};
            const cur = { ...t, ...d };

            return (
              <div key={t.id} className="rounded-2xl border shadow-sm p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={e=>toggleSel(t.id, e.target.checked)} />
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{t.code}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-2 rounded bg-blue-600 text-white"
                      onClick={() => saveRow(t.id)}
                    >
                      Save
                    </button>
                    <button
                      className="px-3 py-2 rounded bg-green-700 text-white"
                      onClick={() => {
                        change(t.id, { status: "done", progress: 100 });
                        setItems(prev => prev.map(x => x.id === t.id ? applyDraftToItem(x, { status: "done", progress: 100 }) : x));
                        saveRow(t.id, { status: "done", progress: 100 });
                      }}
                    >
                      Done
                    </button>
                    <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={()=>delRow(t.id)}>Del</button>
                  </div>
                </div>

                <label className="text-xs text-gray-600">Title</label>
                <input className="border rounded w-full px-3 py-2 mb-2"
                       value={cur.title}
                       onChange={e=>change(t.id,{ title:e.target.value })}/>

                <label className="text-xs text-gray-600">Desc</label>
                <textarea className="border rounded w-full px-3 py-2 mb-2"
                          rows={2}
                          value={cur.description ?? ""}
                          onChange={e=>change(t.id,{ description:e.target.value })}/>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-xs text-gray-600">Due</label>
                    <input className="border rounded w-full px-3 py-2" type="date"
                           value={fmtDate(cur.due_at)}
                           onChange={e=>change(t.id,{ due_at: e.target.value || null })}/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Status</label>
                    <select className="border rounded w-full px-3 py-2"
                            value={cur.status}
                            onChange={e=>change(t.id,{ status: e.target.value as Task["status"] })}>
                      {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-xs text-gray-600">Priority</label>
                    <select className="border rounded w-full px-3 py-2"
                            value={cur.priority}
                            onChange={e=>change(t.id,{ priority: e.target.value as Task["priority"] })}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Progress: {cur.progress}%</label>
                    <input className="w-full" type="range" min={0} max={100}
                           value={cur.progress ?? 0}
                           onChange={e=>change(t.id,{ progress: Number(e.target.value) })}/>
                  </div>
                </div>

                <label className="text-xs text-gray-600">Tags (comma)</label>
                <input className="border rounded w-full px-3 py-2"
                       value={tagsToStr(cur.tags)}
                       onChange={e=>change(t.id,{ tags: parseTags(e.target.value) })}/>
              </div>
            );
          })}
          {!items.length && <div className="text-center text-gray-500 py-8">No tasks</div>}
        </div>

        {/* ===== Desktop: Table (controlled + optimistic) ===== */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full border text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-center w-8"><input type="checkbox" onChange={e=> e.target.checked ? selectAllVisible() : clearSel()} /></th>
                <th className="p-2 text-left">CODE</th>
                <th className="p-2 text-left">Title</th>
                <th className="p-2 text-left">Desc</th>
                <th className="p-2">Due</th>
                <th className="p-2">Status</th>
                <th className="p-2">Priority</th>
                <th className="p-2">Tags</th>
                <th className="p-2">Progress</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(t => {
                const d = draft[t.id] || {};
                const cur = { ...t, ...d };

                return (
                  <tr key={t.id} className="border-t">
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={e=>toggleSel(t.id, e.target.checked)} />
                    </td>
                    <td className="p-2 font-mono">{t.code}</td>

                    <td className="p-2">
                      <input className="border px-2 py-2 w-full rounded"
                             value={cur.title}
                             onChange={e=>change(t.id,{ title:e.target.value })}/>
                    </td>

                    <td className="p-2">
                      <input className="border px-2 py-2 w-full rounded"
                             value={cur.description ?? ""}
                             onChange={e=>change(t.id,{ description:e.target.value })}/>
                    </td>

                    <td className="p-2 text-center">
                      <input className="border px-2 py-2 rounded" type="date"
                             value={fmtDate(cur.due_at)}
                             onChange={e=>change(t.id,{ due_at: e.target.value || null })}/>
                    </td>

                    <td className="p-2 text-center">
                      <select className="border px-2 py-2 rounded"
                              value={cur.status}
                              onChange={e=>change(t.id,{ status: e.target.value as Task["status"] })}>
                        {STATUS.map(s=> <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>

                    <td className="p-2 text-center">
                      <select className="border px-2 py-2 rounded"
                              value={cur.priority}
                              onChange={e=>change(t.id,{ priority: e.target.value as Task["priority"] })}>
                        {PRIORITIES.map(p=> <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>

                    <td className="p-2">
                      <input className="border px-2 py-2 w-full rounded"
                             value={tagsToStr(cur.tags)}
                             onChange={e=>change(t.id,{ tags: parseTags(e.target.value) })}/>
                    </td>

                    <td className="p-2 text-center">
                      <input className="border px-2 py-2 w-20 text-center rounded" type="number" min={0} max={100}
                             value={cur.progress ?? 0}
                             onChange={e=>change(t.id,{ progress: Number(e.target.value) })}/>
                    </td>

                    <td className="p-2 text-center">
                      <button
                        className="px-3 py-2 bg-blue-600 text-white rounded mr-2"
                        onClick={() => {
                          // optimistic
                          setItems(prev => prev.map(x => x.id === t.id ? applyDraftToItem(x) : x));
                          saveRow(t.id);
                        }}
                      >
                        Save
                      </button>

                      <button
                        className="px-3 py-2 bg-green-700 text-white rounded mr-2"
                        onClick={() => {
                          change(t.id, { status: "done", progress: 100 });
                          setItems(prev => prev.map(x => x.id === t.id ? applyDraftToItem(x, { status: "done", progress: 100 }) : x));
                          saveRow(t.id, { status: "done", progress: 100 });
                        }}
                      >
                        Done
                      </button>

                      <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={()=>delRow(t.id)}>Del</button>
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr><td className="p-6 text-center text-gray-500" colSpan={10}>No tasks</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ===== Calendar (Monthly) ===== */}
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 rounded border" onClick={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>← เดือนก่อน</button>
              <div className="text-lg font-semibold">{monthLabel}</div>
              <button className="px-3 py-2 rounded border" onClick={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>เดือนถัดไป →</button>
            </div>
            <div className="flex items-center gap-2">
              <input type="month" className="border rounded px-2 py-2"
                value={`${monthCursor.getFullYear()}-${String(monthCursor.getMonth()+1).padStart(2,"0")}`}
                onChange={(e) => {
                  const [yy, mm] = e.target.value.split("-").map(Number);
                  if (yy && mm) setMonthCursor(new Date(yy, mm - 1, 1));
                }}
              />
              <button className="px-3 py-2 rounded border" onClick={() => setMonthCursor(new Date())}>วันนี้</button>
            </div>
          </div>

          {/* weekday header */}
          <div className="grid grid-cols-7 text-center text-xs text-gray-600 mb-1">
            {WEEKDAY_TH.map((d) => (<div key={d} className="py-2">{d}</div>))}
          </div>

          {/* 6-week grid */}
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {daysGrid.map((d) => {
              const k = keyFromDate(d);
              const inMonth = d.getMonth() === monthCursor.getMonth();
              const isToday = k === todayKey;
              const dayTasks = mapByDate.get(k) ?? [];

              return (
                <div key={k} className={[
                  "min-h-[92px] md:min-h-[110px] border rounded p-1 md:p-2 flex flex-col",
                  inMonth ? "bg-white" : "bg-gray-50 text-gray-400",
                  isToday ? "ring-2 ring-blue-500" : ""
                ].join(" ")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={"text-xs " + (isToday ? "font-bold text-blue-600" : "")}>{d.getDate()}</span>
                    {dayTasks.length > 0 && (<span className="text-[10px] text-gray-500">{dayTasks.length} งาน</span>)}
                  </div>
                  <div className="space-y-1 overflow-y-auto">
                    {dayTasks.slice(0, 4).map(t => (
                      <div key={t.id} className="text-[11px] md:text-xs px-1 py-0.5 rounded bg-blue-50 border border-blue-100">
                        <span className="font-mono">{t.code}</span> — {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 4 && (<div className="text-[11px] text-gray-500">+{dayTasks.length - 4} more…</div>)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            แสดงงานตาม <b>due date</b> (เวลาไทย). งานที่ไม่มี due date จะไม่แสดงในปฏิทิน
          </div>
        </div>
      </main>
    </div>
  );
}
