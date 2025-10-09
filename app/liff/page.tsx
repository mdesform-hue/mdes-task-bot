// app/liff/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import Script from "next/script";

/** ================= Toggle แบบมีแอนิเมชัน (วางไว้ในไฟล์เดียว) ================= */
function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  const bgClass = isDark ? "bg-slate-900" : "bg-sky-300";

  return (
    <button
      onClick={onToggle}
      aria-label="Toggle dark mode"
      className={[
        "relative h-8 w-16 rounded-full border overflow-hidden", // h-8 (32px) w-16 (64px)
        "transition-colors duration-500 ease-out",
        "border-slate-300 dark:border-slate-600",
        bgClass,
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
      ].join(" ")}
    >
      {/* พื้นหลังกลางวัน */}
      <div className={["absolute inset-0 transition-opacity duration-500", isDark ? "opacity-0" : "opacity-100"].join(" ")}>
        <span className="cloud cloud-1" />
        <span className="cloud cloud-2" />
      </div>

      {/* พื้นหลังกลางคืน */}
      <div className={["absolute inset-0 bg-slate-900 transition-opacity duration-500", isDark ? "opacity-100" : "opacity-0"].join(" ")}>
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} className={`star star-${(i % 8) + 1}`} />
        ))}
      </div>

      {/* ปุ่มวงกลม (ดวงอาทิตย์/จันทร์) */}
      <div
        className={[
          "absolute top-1 left-1 h-6 w-6 rounded-full", // h-6 w-6 = 24px
          "transition-transform duration-500 ease-out",
          isDark ? "translate-x-[32px]" : "translate-x-0", // 64 - 24 - 8 = 32px
          "bg-yellow-300 dark:bg-slate-100 shadow-md",
          "flex items-center justify-center",
        ].join(" ")}
      >
        {/* Sun (ย่อเป็น 20px) */}
        <svg className={["h-5 w-5 transition-opacity duration-300", isDark ? "opacity-0" : "opacity-100"].join(" ")} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.2" className="fill-yellow-400" />
          <g className="stroke-yellow-400" strokeWidth="1.4" strokeLinecap="round">
            <path d="M12 2v2.6" /><path d="M12 19.4V22" />
            <path d="M2 12h2.6" /><path d="M19.4 12H22" />
            <path d="M4.6 4.6l1.8 1.8" /><path d="M17.6 17.6l1.8 1.8" />
            <path d="M19.4 4.6l-1.8 1.8" /><path d="M6.4 17.6l-1.8 1.8" />
          </g>
        </svg>

        {/* Moon (ย่อเป็น 20px) */}
        <svg className={["absolute h-5 w-5 transition-opacity duration-300", isDark ? "opacity-100" : "opacity-0"].join(" ")} viewBox="0 0 24 24" fill="none">
          <path d="M16.5 12.5a7 7 0 1 1-5-9.5 6 6 0 1 0 7.7 7.7 7.1 7.1 0 0 1-2.7 1.8z" className="fill-slate-300" />
          <circle cx="10" cy="9" r="0.9" className="fill-slate-400" />
          <circle cx="12.2" cy="12.8" r="0.7" className="fill-slate-400" />
        </svg>
      </div>

      {/* ปรับสเกลเมฆ/ดาวให้เข้ากับขนาดใหม่ */}
      <style jsx>{`
        .cloud {
          position: absolute;
          top: 12px;
          height: 6px;
          width: 22px;
          background: #fff;
          border-radius: 999px;
          box-shadow: 11px -5px 0 2px #fff, 22px -2px 0 0 #fff;
          opacity: 0.85;
          animation: cloud-move 10s linear infinite;
        }
        .cloud-1 { left: -16px; animation-delay: 0s; }
        .cloud-2 { left: -32px; top: 6px; transform: scale(0.8); animation-delay: 2s; }
        @keyframes cloud-move { 0% { transform: translateX(0); } 100% { transform: translateX(95px); } }

        .star {
          position: absolute;
          width: 2px; height: 2px;
          background: white; border-radius: 999px; opacity: 0.6;
          animation: twinkle 1.6s ease-in-out infinite;
        }
        .star-1 { top: 6px; left: 12px; animation-delay: 0s; }
        .star-2 { top: 5px; left: 32px; animation-delay: .2s; }
        .star-3 { top: 16px; left: 46px; animation-delay: .4s; }
        .star-4 { top: 22px; left: 18px; animation-delay: .6s; }
        .star-5 { top: 10px; left: 54px; animation-delay: .8s; }
        .star-6 { top: 26px; left: 38px; animation-delay: 1.0s; }
        .star-7 { top: 18px; left: 6px;  animation-delay: 1.2s; }
        .star-8 { top: 27px; left: 58px; animation-delay: 1.4s; }

        @keyframes twinkle { 0%,100% { opacity: .2; transform: scale(1); } 50% { opacity: .9; transform: scale(1.35); } }
      `}</style>
    </button>
  );
}


/** ================= Types / Consts ================= */
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

const STATUS = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const WEEKDAY_TH = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]; // เริ่ม จันทร์
const THEME_KEY = "taskbot_theme"; // 'dark' | 'light'

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

const tagsToStr = (tags: string[] | null | undefined) => (tags ?? []).join(", ");
const parseTags = (s: string) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const fmtDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso))
    : "";

// Toast แบบง่าย
type Toast = { type: "ok" | "err"; text: string } | null;

// สี badge
const TAG_COLORS: Record<string, string> = {
  CAL1: "bg-emerald-600 text-white border-emerald-700",
  CAL2: "bg-violet-600 text-white border-violet-700",
};
const TAG_LABELS: Record<string, string> = { CAL1: "กพส", CAL2: "กบม." };
function toCanonTag(label: string): string {
  const raw = (label || "").trim();
  const lower = raw.toLowerCase();
  if (["cal1", "กพส", "ก.พ.ส", "kps"].includes(lower)) return "CAL1";
  if (["cal2", "กบม.", "กบม", "kbm"].includes(lower)) return "CAL2";
  return raw;
}
const TagBadge: React.FC<{ label: string }> = ({ label }) => {
  const key = toCanonTag(label);
  const cls =
    TAG_COLORS[key] ||
    "bg-gray-200 text-gray-700 border-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600";
  const showLabel = TAG_LABELS[key] || label;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-sm ${cls}`}>
      {showLabel}
    </span>
  );
};
const TagChip: React.FC<{ label: string }> = ({ label }) => {
  const key = toCanonTag(label);
  const cls =
    TAG_COLORS[key] ||
    "bg-gray-200 text-gray-700 border-gray-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600";
  const showLabel = TAG_LABELS[key] || label;
  return (
    <span className={`inline-flex items-center px-2 py-[3px] rounded-full text-[11px] font-semibold border shadow-sm ${cls}`}>
      {showLabel}
    </span>
  );
};

/** ================= Main Page ================= */
export default function LiffAdminPage() {
  // ===== Theme state & init =====
  const [isDark, setIsDark] = useState(false);
  const applyTheme = (dark: boolean) => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {}
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") {
        setIsDark(saved === "dark");
        applyTheme(saved === "dark");
      } else {
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
        setIsDark(prefersDark);
        applyTheme(prefersDark);
      }
    } catch {
      setIsDark(false);
      applyTheme(false);
    }
  }, []);
  const toggleTheme = () => setIsDark((d) => (applyTheme(!d), !d));

  // ===== Core states =====
  const [cal1Id, setCal1Id] = useState("");
  const [cal1Tag, setCal1Tag] = useState("CAL1");
  const [cal2Id, setCal2Id] = useState("");
  const [cal2Tag, setCal2Tag] = useState("CAL2");
  const [cfgLoading, setCfgLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [ready, setReady] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Task[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<Task>>>({});
  const [creating, setCreating] = useState<Partial<Task>>({
    title: "",
    due_at: null,
    description: "",
    priority: "medium",
    tags: [],
  });
  const [editGid, setEditGid] = useState(false);
  const [editKey, setEditKey] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string, on?: boolean) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (on ?? !s.has(id)) s.add(id);
      else s.delete(id);
      return s;
    });
  const clearSel = () => setSelected(new Set());
  const selectAllVisible = () => setSelected(new Set(items.map((i) => i.id)));
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const markSaving = (id: string, on: boolean) =>
    setSavingIds((prev) => {
      const s = new Set(prev);
      on ? s.add(id) : s.delete(id);
      return s;
    });
  const [toast, setToast] = useState<Toast>(null);
  const showToast = (t: Toast) => {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 1800);
  };

  // ========= init: URL → localStorage → LIFF context =========
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
        const lsGid = readFirst(GID_KEYS);
        if (lsGid) setGroupId(lsGid);
      }
      if (!qsKey) {
        const lsKey = readFirst(KEY_KEYS);
        if (lsKey) setAdminKey(lsKey);
      }
      try {
        const liff: any = (window as any).liff;
        if (process.env.NEXT_PUBLIC_LIFF_ID) {
          if (liff && !liff.isInitialized?.()) await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
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
      } catch (e) {
        console.error("LIFF init error", e);
      }
      setReady(true);
    })();
  }, []);

  const load = async () => {
    if (!groupId || !adminKey) return;
    const r = await fetch(
      `/api/admin/tasks?group_id=${encodeURIComponent(groupId)}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(adminKey)}`
    );
    if (!r.ok) {
      showToast({ type: "err", text: await r.text() });
      setItems([]);
      clearSel();
      return;
    }
    const j = await r.json();
    setItems(Array.isArray(j) ? j : j.items ?? []);
    clearSel();
  };
  useEffect(() => {
    if (ready && groupId && adminKey) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, groupId, adminKey]);

  const change = (id: string, patch: Partial<Task>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  function applyDraftToItem(item: Task, patch: Partial<Task> = {}) {
    const d = draft[item.id] || {};
    return { ...item, ...d, ...patch };
  }

  // ------- Calendar Config -------
  useEffect(() => {
    (async () => {
      if (!ready || !groupId || !adminKey) return;
      try {
        setCfgLoading(true);
        const r = await fetch(
          `/api/admin/calendar-config?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`
        );
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();
        setCal1Id(j.cal1_id ?? "");
        setCal1Tag(j.cal1_tag ?? "CAL1");
        setCal2Id(j.cal2_id ?? "");
        setCal2Tag(j.cal2_tag ?? "CAL2");
      } catch (e) {
        console.error(e);
      } finally {
        setCfgLoading(false);
      }
    })();
  }, [ready, groupId, adminKey]);

  async function saveCalendarConfig() {
    if (!groupId || !adminKey) return alert("กรอก Group ID / Admin Key ก่อน");
    try {
      setCfgLoading(true);
      const r = await fetch(
        `/api/admin/calendar-config?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cal1_id: cal1Id || null,
            cal1_tag: cal1Tag || "CAL1",
            cal2_id: cal2Id || null,
            cal2_tag: cal2Tag || "CAL2",
          }),
        }
      );
      if (!r.ok) throw new Error(await r.text());
      alert("บันทึก Calendar IDs เรียบร้อย");
    } catch (e: any) {
      alert(`บันทึกไม่สำเร็จ: ${e.message || e}`);
    } finally {
      setCfgLoading(false);
    }
  }

  async function syncNow() {
    if (!groupId || !adminKey) return alert("กรอก Group ID / Admin Key ก่อน");
    try {
      setCfgLoading(true);
      const r1 = await fetch(
        `/api/admin/calendar-sync?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}`,
        { method: "POST" }
      );
      const t1 = await r1.text();
      if (!r1.ok) throw new Error(t1 || "calendar-sync failed");

      const r2 = await fetch(
        `/api/admin/calendar-import?group_id=${encodeURIComponent(groupId)}&key=${encodeURIComponent(adminKey)}&colorId=4`,
        { method: "POST" }
      );
      const t2 = await r2.text();
      if (!r2.ok) throw new Error(t2 || "calendar-import failed");

      alert(`Sync OK\n\n${t1}\n\nImport OK\n${t2}`);
      await load();
    } catch (e: any) {
      alert(`ซิงค์ไม่สำเร็จ: ${e.message || e}`);
    } finally {
      setCfgLoading(false);
    }
  }

  const saveRow = async (id: string, extra?: Partial<Task>) => {
    const body = { ...(draft[id] || {}), ...(extra || {}) };
    if (!Object.keys(body).length) return;
    setItems((prev) => prev.map((x) => (x.id === id ? ({ ...x, ...body } as Task) : x)));
    markSaving(id, true);
    try {
      const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setDraft((d) => {
          const { [id]: _, ...rest } = d;
          return rest;
        });
        await load();
        showToast({ type: "ok", text: "บันทึกแล้ว" });
      } else showToast({ type: "err", text: await r.text() });
    } catch {
      showToast({ type: "err", text: "เครือข่ายผิดพลาด" });
    } finally {
      markSaving(id, false);
    }
  };

  const delRow = async (id: string) => {
    if (!confirm("ลบงานนี้?")) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    try {
      const r = await fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, { method: "DELETE" });
      if (!r.ok) {
        showToast({ type: "err", text: await r.text() });
        load();
      } else showToast({ type: "ok", text: "ลบแล้ว" });
    } catch {
      showToast({ type: "err", text: "เครือข่ายผิดพลาด" });
      load();
    }
  };

  const createRow = async () => {
    if (!(creating.title ?? "").trim()) return showToast({ type: "err", text: "กรอกชื่องานก่อน" });
    const body = { group_id: groupId, ...creating };
    try {
      const r = await fetch(`/api/admin/tasks?key=${encodeURIComponent(adminKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setCreating({ title: "", due_at: null, description: "", priority: "medium", tags: [] });
        await load();
        showToast({ type: "ok", text: "สร้างงานแล้ว" });
      } else showToast({ type: "err", text: await r.text() });
    } catch {
      showToast({ type: "err", text: "เครือข่ายผิดพลาด" });
    }
  };

  // bulk
  const [bulkStatus, setBulkStatus] = useState<Task["status"]>("in_progress");
  const [bulkDue, setBulkDue] = useState<string>("");
  const bulkApplyStatus = async () => {
    if (!selected.size) return;
    setItems((prev) => prev.map((x) => (selected.has(x.id) ? ({ ...x, status: bulkStatus } as Task) : x)));
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: bulkStatus }),
        })
      )
    );
    await load();
  };
  const bulkApplyDue = async () => {
    if (!selected.size || !bulkDue) return;
    setItems((prev) => prev.map((x) => (selected.has(x.id) ? ({ ...x, due_at: bulkDue } as Task) : x)));
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ due_at: bulkDue }),
        })
      )
    );
    await load();
  };
  const bulkDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`ลบ ${selected.size} งาน?`)) return;
    const ids = new Set(selected);
    setItems((prev) => prev.filter((x) => !ids.has(x.id)));
    await Promise.all(
      Array.from(selected).map((id) => fetch(`/api/admin/tasks/${id}?key=${encodeURIComponent(adminKey)}`, { method: "DELETE" }))
    );
    await load();
  };

  const saveGid = () => {
    writeAll(GID_KEYS, groupId);
    setEditGid(false);
    load();
  };
  const saveKey = () => {
    writeAll(KEY_KEYS, adminKey);
    setEditKey(false);
    load();
  };
  const copyLink = () => {
    const u = new URL(location.href);
    u.searchParams.set("key", adminKey || "");
    if (groupId) u.searchParams.set("group_id", groupId);
    navigator.clipboard.writeText(u.toString());
    showToast({ type: "ok", text: "คัดลอกลิงก์แล้ว" });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y, m, gridStart.getDate()]);

  const keyFromDate = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const keyFromISO = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(iso)
    );

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

  const clsInput =
    "border px-3 py-3 md:py-2 rounded w-full disabled:bg-gray-100 dark:disabled:bg-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100";
  const clsBtnBorder = "px-3 py-2 rounded border dark:border-slate-600 dark:text-slate-100";
  const clsCard = "rounded-2xl border shadow-sm p-3 bg-white dark:bg-slate-800 dark:border-slate-700";

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-3 right-3 z-[60] px-3 py-2 rounded shadow text-sm ${
            toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200 dark:border-slate-700">
        <div className="w-full px-4 md:px-8 h-14 flex items-center gap-4">
          <div className="font-semibold">mdes-task-bot — LIFF Admin</div>

          <nav className="ml-auto hidden md:flex items-center gap-5 text-sm">
            <a className="text-slate-900 dark:text-slate-100 border-b-2 border-emerald-500" href="/liff">
              Tasks
            </a>
            <a className="hover:text-slate-900 dark:hover:text-white" href="/liff/kanban">
              Kanban
            </a>
            <a className="hover:text-slate-900 dark:hover:text-white" href="/liff/dashboard">
              Dashboard
            </a>
          </nav>

          {/* Toggle ใหม่แบบแอนิเมชัน */}
          <div className="ml-2">
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          </div>

          <a href="/liff/kanban" className="md:hidden ml-2 inline-flex items-center justify-center rounded px-3 py-2 bg-green-600 text-white">
            Kanban
          </a>
        </div>
      </header>

      <main className="w-full px-4 md:px-8 py-6 md:py-8">
        <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" />

        <div className="mb-5 md:mb-7">
          <h1 className="text-xl md:text-2xl font-semibold">Tasks</h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm">จัดการงานของกลุ่ม</p>
        </div>

        {/* Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="flex flex-col">
            <label className="text-sm mb-1 text-slate-700 dark:text-slate-300">Group ID</label>
            <div className="flex gap-2">
              <input className={clsInput} value={groupId} disabled={!editGid} onChange={(e) => setGroupId(e.target.value)} />
              {!editGid ? (
                <button className={clsBtnBorder} onClick={() => setEditGid(true)}>
                  เปลี่ยน
                </button>
              ) : (
                <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={saveGid}>
                  บันทึก
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-sm mb-1 text-slate-700 dark:text-slate-300">Admin Key</label>
            <div className="flex gap-2">
              <input className={clsInput} value={adminKey} disabled={!editKey} onChange={(e) => setAdminKey(e.target.value)} />
              {!editKey ? (
                <button className={clsBtnBorder} onClick={() => setEditKey(true)}>
                  เปลี่ยน
                </button>
              ) : (
                <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={saveKey}>
                  บันทึก
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-sm mb-1 text-slate-700 dark:text-slate-300">ค้นหา</label>
            <div className="flex gap-2">
              <input className={clsInput} value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="bg-black text-white px-3 py-2 rounded dark:bg-slate-700" onClick={load}>
                รีเฟรช
              </button>
              <button
                className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded"
                onClick={() => {
                  const url = new URL("/liff/kanban", location.origin);
                  if (groupId) url.searchParams.set("group_id", groupId);
                  if (adminKey) url.searchParams.set("key", adminKey);
                  window.open(url.toString(), "_self");
                }}
              >
                เปิด Kanban
              </button>
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded"
                onClick={() => {
                  const url = new URL("/liff/dashboard", location.origin);
                  if (groupId) url.searchParams.set("group_id", groupId);
                  if (adminKey) url.searchParams.set("key", adminKey);
                  window.open(url.toString(), "_self");
                }}
              >
                เปิด Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="sticky top-14 z-40 mb-4 rounded-lg border bg-amber-50 text-slate-800 px-3 py-2 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">เลือกแล้ว {selected.size} งาน</span>

              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 dark:text-slate-300">สถานะ</label>
                <select
                  className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value as Task["status"])}
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm" onClick={bulkApplyStatus}>
                  อัปเดตสถานะ
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600 dark:text-slate-300">กำหนดส่ง</label>
                <input
                  type="date"
                  className="border rounded px-2 py-1 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                  value={bulkDue}
                  onChange={(e) => setBulkDue(e.target.value)}
                />
                <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm" onClick={bulkApplyDue}>
                  ตั้งกำหนดส่ง
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button className="px-3 py-1.5 rounded bg-red-600 text-white text-sm" onClick={bulkDelete}>
                  ลบที่เลือก
                </button>
                <button className={clsBtnBorder} onClick={clearSel}>
                  ยกเลิกเลือก
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create row */}
        <div className="mb-4 md:mb-6 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
          <input
            className={`md:col-span-3 ${clsInput}`}
            placeholder="ชื่องานใหม่"
            value={creating.title ?? ""}
            onChange={(e) => setCreating((c) => ({ ...c, title: e.target.value }))}
          />
          <input
            className={`md:col-span-3 ${clsInput}`}
            placeholder="รายละเอียด"
            value={creating.description ?? ""}
            onChange={(e) => setCreating((c) => ({ ...c, description: e.target.value }))}
          />
          <select
            className={`md:col-span-2 ${clsInput}`}
            value={(creating.priority as Task["priority"]) ?? "medium"}
            onChange={(e) => setCreating((c) => ({ ...c, priority: e.target.value as Task["priority"] }))}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            className={`md:col-span-2 ${clsInput}`}
            placeholder="tags (comma)"
            value={Array.isArray(creating.tags) ? creating.tags.join(", ") : ((creating.tags as any) || "")}
            onChange={(e) => setCreating((c) => ({ ...c, tags: parseTags(e.target.value) }))}
          />
          <input
            className={`md:col-span-2 ${clsInput}`}
            type="date"
            value={creating.due_at ? fmtDate(creating.due_at) : ""}
            onChange={(e) => setCreating((c) => ({ ...c, due_at: e.target.value || null }))}
          />
          <button className="md:col-span-12 bg-green-600 text-white px-4 py-3 md:py-2 rounded" onClick={createRow}>
            + Add
          </button>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {items.map((t) => {
            const d = draft[t.id] || {};
            const cur = { ...t, ...d };
            const isSaving = savingIds.has(t.id);

            return (
              <div key={t.id} className={clsCard}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={(e) => toggleSel(t.id, e.target.checked)} />
                    <span className="text-xs font-mono bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">{t.code}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">{(cur.tags ?? []).map((tag) => <TagBadge key={tag} label={tag} />)}</div>
                </div>

                <label className="text-xs text-gray-600 dark:text-slate-300">Title</label>
                <input
                  className={`border rounded w-full px-3 py-2 mb-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100`}
                  value={cur.title}
                  onChange={(e) => change(t.id, { title: e.target.value })}
                />

                <label className="text-xs text-gray-600 dark:text-slate-300">Desc</label>
                <textarea
                  className="border rounded w-full px-3 py-2 mb-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                  rows={2}
                  value={cur.description ?? ""}
                  onChange={(e) => change(t.id, { description: e.target.value })}
                />

                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-xs text-gray-600 dark:text-slate-300">Due</label>
                    <input
                      className="border rounded w-full px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                      type="date"
                      value={fmtDate(cur.due_at)}
                      onChange={(e) => change(t.id, { due_at: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-slate-300">Status</label>
                    <select
                      className="border rounded w-full px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                      value={cur.status}
                      onChange={(e) => change(t.id, { status: e.target.value as Task["status"] })}
                    >
                      {STATUS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-xs text-gray-600 dark:text-slate-300">Priority</label>
                    <select
                      className="border rounded w-full px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                      value={cur.priority}
                      onChange={(e) => change(t.id, { priority: e.target.value as Task["priority"] })}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-slate-300">Progress: {cur.progress}%</label>
                    <input
                      className="w-full"
                      type="range"
                      min={0}
                      max={100}
                      value={cur.progress ?? 0}
                      onChange={(e) => change(t.id, { progress: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <label className="text-xs text-gray-600 dark:text-slate-300">Tags (comma)</label>
                <input
                  className="border rounded w-full px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                  value={tagsToStr(cur.tags)}
                  onChange={(e) => change(t.id, { tags: parseTags(e.target.value) })}
                />

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    className="px-3 py-2 bg-blue-600 text-white rounded mr-2 disabled:opacity-60"
                    disabled={isSaving}
                    onClick={() => {
                      setItems((prev) => prev.map((x) => (x.id === t.id ? applyDraftToItem(x) : x)));
                      saveRow(t.id);
                    }}
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    className="px-3 py-2 bg-green-700 text-white rounded mr-2 disabled:opacity-60"
                    disabled={isSaving}
                    onClick={() => {
                      change(t.id, { status: "done", progress: 100 });
                      setItems((prev) => prev.map((x) => (x.id === t.id ? applyDraftToItem(x, { status: "done", progress: 100 }) : x)));
                      saveRow(t.id, { status: "done", progress: 100 });
                    }}
                  >
                    {isSaving ? "Saving…" : "Done"}
                  </button>
                  <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={() => delRow(t.id)}>
                    Del
                  </button>
                </div>
              </div>
            );
          })}
          {!items.length && <div className="text-center text-gray-500 dark:text-slate-400 py-8">No tasks</div>}
        </div>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full border text-base leading-snug dark:border-slate-700">
            <thead className="bg-gray-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium">
              <tr>
                <th className="px-3 py-2.5 text-center w-10">
                  <input type="checkbox" onChange={(e) => (e.target.checked ? selectAllVisible() : clearSel())} />
                </th>
                <th className="px-3 py-2.5 text-left">CODE</th>
                <th className="px-3 py-2.5 text-left">Title</th>
                <th className="px-3 py-2.5 text-left">Desc</th>
                <th className="px-3 py-2.5">Due</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Priority</th>
                <th className="px-3 py-2.5">Tags</th>
                <th className="px-3 py-2.5">Progress</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {items.map((t) => {
                const d = draft[t.id] || {};
                const cur = { ...t, ...d };
                const isSaving = savingIds.has(t.id);
                return (
                  <tr key={t.id} className="border-t dark:border-slate-700">
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={selected.has(t.id)} onChange={(e) => toggleSel(t.id, e.target.checked)} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-800 dark:text-slate-100">{t.code}</td>
                    <td className="px-3 py-2.5">
                      <input
                        className="border px-2 py-2 w-full rounded text-base dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        value={cur.title}
                        onChange={(e) => change(t.id, { title: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        className="border px-2 py-2 w-full rounded text-base dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        value={cur.description ?? ""}
                        onChange={(e) => change(t.id, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        className="border px-2 py-2 rounded text-base dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        type="date"
                        value={fmtDate(cur.due_at)}
                        onChange={(e) => change(t.id, { due_at: e.target.value || null })}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select
                        className="border px-2 py-2 rounded text-base dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        value={cur.status}
                        onChange={(e) => change(t.id, { status: e.target.value as Task["status"] })}
                      >
                        {STATUS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <select
                        className="border px-2 py-2 rounded text-base dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        value={cur.priority}
                        onChange={(e) => change(t.id, { priority: e.target.value as Task["priority"] })}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1 mb-1">{(cur.tags ?? []).map((tag) => <TagBadge key={tag} label={tag} />)}</div>
                      <input
                        className="border px-2 py-2 w-full rounded text-base dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        value={tagsToStr(cur.tags)}
                        onChange={(e) => change(t.id, { tags: parseTags(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        className="border px-2 py-2 w-24 text-center rounded text-base dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                        type="number"
                        min={0}
                        max={100}
                        value={cur.progress ?? 0}
                        onChange={(e) => change(t.id, { progress: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        className="px-3 py-2 bg-blue-600 text-white rounded mr-2 disabled:opacity-60"
                        disabled={isSaving}
                        onClick={() => {
                          setItems((prev) => prev.map((x) => (x.id === t.id ? applyDraftToItem(x) : x)));
                          saveRow(t.id);
                        }}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="px-3 py-2 bg-green-700 text-white rounded mr-2 disabled:opacity-60"
                        disabled={isSaving}
                        onClick={() => {
                          change(t.id, { status: "done", progress: 100 });
                          setItems((prev) =>
                            prev.map((x) => (x.id === t.id ? applyDraftToItem(x, { status: "done", progress: 100 }) : x))
                          );
                          saveRow(t.id, { status: "done", progress: 100 });
                        }}
                      >
                        {isSaving ? "Saving…" : "Done"}
                      </button>
                      <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={() => delRow(t.id)}>
                        Del
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr>
                  <td className="p-6 text-center text-gray-500 dark:text-slate-400" colSpan={10}>
                    No tasks
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Calendar Settings */}
        <div className="mt-6 p-4 border rounded-lg bg-slate-50 dark:bg-slate-800 dark:border-slate-700">
          <div className="font-medium mb-3">Calendar Settings (ต่อกลุ่ม)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Calendar #1 ID</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                value={cal1Id}
                onChange={(e) => setCal1Id(e.target.value)}
                placeholder="calendarId 1"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Tag เวลา import</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                value={cal1Tag}
                onChange={(e) => setCal1Tag(e.target.value)}
                placeholder="เช่น CAL1"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Calendar #2 ID</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                value={cal2Id}
                onChange={(e) => setCal2Id(e.target.value)}
                placeholder="calendarId 2 (ถ้ามี)"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 dark:text-slate-300">Tag เวลา import</label>
              <input
                className="mt-1 w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                value={cal2Tag}
                onChange={(e) => setCal2Tag(e.target.value)}
                placeholder="เช่น CAL2"
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50" onClick={saveCalendarConfig} disabled={cfgLoading}>
              บันทึก Calendar IDs
            </button>
            <button className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50" onClick={syncNow} disabled={cfgLoading}>
              ซิงค์จาก Google Calendar ตอนนี้
            </button>
          </div>

          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            * ระบบจะจำ calendarId ต่อ “group_id” ไว้ใน DB และใช้งาน Service Account ที่ตั้งค่าไว้ใน ENV ของคุณ
          </div>
        </div>

        {/* Calendar (Monthly) */}
        <div className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button className={clsBtnBorder} onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
                ← เดือนก่อน
              </button>
              <div className="text-lg font-semibold">{monthLabel}</div>
              <button className={clsBtnBorder} onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
                เดือนถัดไป →
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                className="border rounded px-2 py-2 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                value={`${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`}
                onChange={(e) => {
                  const [yy, mm] = e.target.value.split("-").map(Number);
                  if (yy && mm) setMonthCursor(new Date(yy, mm - 1, 1));
                }}
              />
              <button className={clsBtnBorder} onClick={() => setMonthCursor(new Date())}>
                วันนี้
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-gray-600 dark:text-slate-300 mb-1">
            {WEEKDAY_TH.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {daysGrid.map((d) => {
              const k = keyFromDate(d);
              const inMonth = d.getMonth() === monthCursor.getMonth();
              const isToday = k === todayKey;
              const dayTasks = mapByDate.get(k) ?? [];

              return (
                <div
                  key={k}
                  className={[
                    "min-h-[92px] md:min-h-[110px] border rounded p-1 md:p-2 flex flex-col",
                    inMonth ? "bg-white dark:bg-slate-900" : "bg-gray-50 text-gray-400 dark:bg-slate-800 dark:text-slate-500",
                    isToday ? "ring-2 ring-blue-500" : "",
                    "border-slate-200 dark:border-slate-700",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={"text-xs " + (isToday ? "font-bold text-blue-600" : "")}>{d.getDate()}</span>
                    {dayTasks.length > 0 && <span className="text-[10px] text-gray-500 dark:text-slate-400">{dayTasks.length} งาน</span>}
                  </div>
                  <div className="space-y-1 overflow-y-auto">
                    {dayTasks.slice(0, 4).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTask(t)}
                        className="w-full text-left text-[13px] md:text-sm px-2 py-1.5 rounded border hover:shadow
                                   bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700
                                   border-slate-300 dark:border-slate-600 flex items-center gap-2 font-medium"
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="truncate flex-1">{t.title}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          {(t.tags ?? []).slice(0, 2).map((tag) => (
                            <TagChip key={tag} label={tag} />
                          ))}
                        </span>
                      </button>
                    ))}
                    {dayTasks.length > 4 && <div className="text-[11px] text-gray-500 dark:text-slate-400">+{dayTasks.length - 4} more…</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-xs text-gray-500 dark:text-slate-400">แสดงงานตาม <b>due date</b> (เวลาไทย). งานที่ไม่มี due date จะไม่แสดงในปฏิทิน</div>
        </div>

        {/* Task Detail Modal */}
        {selectedTask && (
          <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-4" onClick={() => setSelectedTask(null)}>
            <div
              className="w/full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 p-4 md:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-base md:text-lg font-semibold">{selectedTask.title}</h3>
                <button
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100"
                  onClick={() => setSelectedTask(null)}
                >
                  ปิด
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">{(selectedTask.tags ?? []).map((tag) => <TagBadge key={tag} label={tag} />)}</div>

              <dl className="space-y-2 text-sm">
                <div className="flex">
                  <dt className="w-24 shrink-0 text-slate-500 dark:text-slate-300">กำหนดส่ง</dt>
                  <dd>{fmtDate(selectedTask.due_at)}</dd>
                </div>
                <div className="flex">
                  <dt className="w-24 shrink-0 text-slate-500 dark:text-slate-300">สถานะ</dt>
                  <dd>{selectedTask.status}</dd>
                </div>
                <div className="flex">
                  <dt className="w-24 shrink-0 text-slate-500 dark:text-slate-300">ความสำคัญ</dt>
                  <dd>{selectedTask.priority}</dd>
                </div>
              </dl>

              {selectedTask.description && (
                <div className="text-sm whitespace-pre-wrap border-t border-slate-200 dark:border-slate-700 pt-3">{selectedTask.description}</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
