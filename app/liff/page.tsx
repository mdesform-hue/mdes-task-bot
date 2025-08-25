"use client";
import { useEffect, useState } from "react";
import Script from "next/script";

type Task = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  progress: number;
  due_at: string | null;
  group_id: string;
  created_at: string;
  updated_at: string;
};

const STATUS = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
const LS_GID = "taskbot_gid";
const LS_KEY = "taskbot_key";

export default function LiffAdminPage() {
  const [ready, setReady] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Task[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<Task>>>({});
  const [creating, setCreating] = useState<Partial<Task>>({ title: "", due_at: null, description: "" });

  // โหมดแก้ไขค่า (เริ่มต้นล็อกไว้)
  const [editGid, setEditGid] = useState(false);
  const [editKey, setEditKey] = useState(false);

  // init: โหลดจาก localStorage ถ้ามี, ถ้าไม่มีก็รับจาก URL, ถ้ายังไม่มีอีก ลองอ่านจาก LIFF context
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const qsGid = url.searchParams.get("group_id");
      const qsKey = url.searchParams.get("key");

      const lsKey = localStorage.getItem(LS_KEY);
      const lsGid = localStorage.getItem(LS_GID);

      if (lsKey) setAdminKey(lsKey);
      else if (qsKey) { setAdminKey(qsKey); localStorage.setItem(LS_KEY, qsKey); }

      if (lsGid) setGroupId(lsGid);
      else if (qsGid) { setGroupId(qsGid); localStorage.setItem(LS_GID, qsGid); }
      else {
        try {
          const liff: any = (window as any).liff;
          if (process.env.NEXT_PUBLIC_LIFF_ID) {
            if (liff && !liff.isInitialized?.()) await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
            if (liff?.isLoggedIn && !liff.isLoggedIn()) { liff.login(); return; }
            const ctx = liff?.getContext?.();
            if (ctx?.type === "group" && ctx.groupId) {
              setGroupId(ctx.groupId);
              localStorage.setItem(LS_GID, ctx.groupId);
            }
          }
        } catch { /* เปิดนอก LINE ไม่มี liff ก็ข้าม */ }
      }
      setReady(true);
    })();
  }, []);

  // โหลดรายการ
  const load = async () => {
    if (!groupId || !adminKey) return;
    const r = await fetch(`/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(adminKey)}`);
    const j = await r.json();
    setItems(j.items ?? []);
  };
  useEffect(() => { if (ready && groupId && adminKey) load(); /* eslint-disable-next-line */ }, [ready, groupId, adminKey]);

  // helper
  const change = (id: string, patch: Partial<Task>) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }));
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0,10) : "";

  // actions
  const saveRow = async (id: string) => {
    if (!draft[id]) return;
    const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft[id])
    });
    if (r.ok) { await load(); setDraft(d => { const { [id]:_, ...rest } = d; return rest; }); } else alert(await r.text());
  };

  const delRow = async (id: string) => {
    if (!confirm("ลบงานนี้?")) return;
    const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, { method: "DELETE" });
    if (r.ok) load();
  };

  const createRow = async () => {
    if (!creating.title) return alert("กรอกชื่อเรื่องก่อน");
    const body = { group_id: groupId, ...creating };
    const r = await fetch(`/api/admin/tasks?key=${encodeURIComponent(adminKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    if (r.ok) { setCreating({ title: "", due_at: null, description: "" }); load(); } else alert(await r.text());
  };

  // เปลี่ยน/บันทึกค่า Group ID & Admin Key แบบ override โดยผู้ใช้
  const saveGid = () => { localStorage.setItem(LS_GID, groupId); setEditGid(false); load(); };
  const saveKey = () => { localStorage.setItem(LS_KEY, adminKey); setEditKey(false); load(); };

  const copyLink = () => {
    const u = new URL(location.href);
    u.searchParams.set("key", adminKey || "");
    if (groupId) u.searchParams.set("group_id", groupId);
    navigator.clipboard.writeText(u.toString());
    alert("คัดลอกลิงก์แล้ว");
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />
      <h1 className="text-xl font-semibold mb-4">LIFF Admin — Tasks</h1>

      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div className="flex flex-col">
          <label className="text-sm">Group ID</label>
          <div className="flex gap-2">
            <input
              className="border px-2 py-1 w-[360px] disabled:bg-gray-100"
              value={groupId}
              disabled={!editGid}
              onChange={e=>setGroupId(e.target.value)}
            />
            {!editGid
              ? <button className="px-3 py-2 rounded border" onClick={()=>setEditGid(true)}>เปลี่ยน</button>
              : <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={saveGid}>บันทึก</button>}
          </div>
        </div>

        <div className="flex flex-col">
          <label className="text-sm">Admin Key</label>
          <div className="flex gap-2">
            <input
              className="border px-2 py-1 w-[260px] disabled:bg-gray-100"
              value={adminKey}
              disabled={!editKey}
              onChange={e=>setAdminKey(e.target.value)}
            />
            {!editKey
              ? <button className="px-3 py-2 rounded border" onClick={()=>setEditKey(true)}>เปลี่ยน</button>
              : <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={saveKey}>บันทึก</button>}
          </div>
        </div>

        <div className="flex flex-col">
          <label className="text-sm">ค้นหา</label>
          <div className="flex gap-2">
            <input className="border px-2 py-1 w-[200px]" value={q} onChange={e=>setQ(e.target.value)} />
            <button className="bg-black text-white px-3 py-2 rounded" onClick={load}>Reload</button>
            <button className="bg-gray-700 text-white px-3 py-2 rounded" onClick={copyLink}>Copy link</button>
          </div>
        </div>
      </div>

      {/* create row */}
      <div className="mb-3 grid grid-cols-12 gap-2 items-center">
        <input className="col-span-4 border px-2 py-1" placeholder="ชื่องานใหม่"
               value={creating.title ?? ""} onChange={e=>setCreating(c=>({...c, title:e.target.value}))}/>
        <input className="col-span-3 border px-2 py-1" placeholder="รายละเอียด"
               value={creating.description ?? ""} onChange={e=>setCreating(c=>({...c, description:e.target.value}))}/>
        <input className="col-span-2 border px-2 py-1" type="date"
               value={creating.due_at ? fmtDate(creating.due_at) : ""}
               onChange={e=>setCreating(c=>({...c, due_at: e.target.value || null}))}/>
        <button className="col-span-2 bg-green-600 text-white px-3 py-2 rounded" onClick={createRow}>+ Add</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">CODE</th>
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">Desc</th>
              <th className="p-2">Due</th>
              <th className="p-2">Status</th>
              <th className="p-2">Progress</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(t => {
              const d = draft[t.id] || {};
              return (
                <tr key={t.id} className="border-t">
                  <td className="p-2 font-mono">{t.code}</td>
                  <td className="p-2">
                    <input className="border px-2 py-1 w-full" defaultValue={t.title}
                           onChange={e=>change(t.id,{ title:e.target.value })}/>
                  </td>
                  <td className="p-2">
                    <input className="border px-2 py-1 w-full" defaultValue={t.description ?? ""}
                           onChange={e=>change(t.id,{ description:e.target.value })}/>
                  </td>
                  <td className="p-2 text-center">
                    <input className="border px-2 py-1" type="date" defaultValue={fmtDate(t.due_at)}
                           onChange={e=>change(t.id,{ due_at: e.target.value || null })}/>
                  </td>
                  <td className="p-2 text-center">
                    <select className="border px-2 py-1" defaultValue={t.status}
                            onChange={e=>change(t.id,{ status: e.target.value as Task["status"] })}>
                      {STATUS.map(s=> <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-2 text-center">
                    <input className="border px-2 py-1 w-16 text-center" type="number" min={0} max={100}
                           defaultValue={t.progress}
                           onChange={e=>change(t.id,{ progress: Number(e.target.value) })}/>
                  </td>
                  <td className="p-2 text-center">
                    <button className="px-3 py-1 bg-blue-600 text-white rounded mr-2" onClick={()=>saveRow(t.id)}>Save</button>
                    <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={()=>delRow(t.id)}>Del</button>
                  </td>
                </tr>
              );
            })}
            {!items.length && (
              <tr><td className="p-6 text-center text-gray-500" colSpan={7}>No tasks</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
