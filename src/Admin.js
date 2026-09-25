import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  XCircle,
  TrendingUp,
  Wallet,
  History,
  CheckCircle2,
  X,
  Award,
  ArrowUpRight,
  ArrowRight,
  ArrowLeftRight,
  Plus,
  Minus,
  Clock,
  RefreshCw,
  AlertTriangle,
  LogOut,
  Banknote,
  CreditCard,
  Loader2,
  Megaphone,
  QrCode,
  ShieldCheck,
  ShieldOff,
  Users,
  Inbox,
  LayoutDashboard,
  Check,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
// Deliberately local to each entry point: neither app depends on the other.
const API_BASE_URL =
  process.env.REACT_APP_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyPM1-Dqf-Fx4o5UOYLtR2T9ArbveG2lPSvyV4I_wMSFz6UB0UU99k5EuTc5t4SsBZpLQ/exec";
function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private mode/quota: keep the live session. */
  }
}
function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage is optional. */
  }
}
function loadCache(key, fallback) {
  try {
    const value = JSON.parse(storageGet(key));
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}
function saveCache(key, value) {
  storageSet(key, JSON.stringify(value));
}
const inFlightGets = new Map();
async function request(params, body) {
  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(
      API_BASE_URL,
    )
  ) {
    return {
      ok: false,
      error: "ระบบยังไม่พร้อมให้บริการ กรุณาติดต่อผู้ดูแลระบบ",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const query = new URLSearchParams({ ...params, _ts: String(Date.now()) });
    const response = await fetch(
      body ? API_BASE_URL : `${API_BASE_URL}?${query}`,
      {
        method: body ? "POST" : "GET",
        signal: controller.signal,
        ...(body
          ? {
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify(body),
            }
          : { cache: "no-store" }),
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object") throw new Error("Invalid response");
    if (
      !body &&
      params?.sheet &&
      data.ok === true &&
      !Array.isArray(data.rows)
    ) {
      return { ok: false, error: "ข้อมูลจากระบบไม่ครบถ้วน กรุณาลองรีเฟรช" };
    }
    // The supplied GAS returns { deleted } / { reset } for these operations.
    const ok =
      data.ok === true ||
      (body?.type === "badge_delete" && typeof data.deleted === "boolean") ||
      (body?.type === "factory_reset" && data.reset === true);
    return {
      ...data,
      ok,
      error: ok ? undefined : data.error || "เซิร์ฟเวอร์ส่งข้อมูลไม่ถูกต้อง",
    };
  } catch (error) {
    return {
      ok: false,
      uncertain: !!body,
      error: body
        ? "ยังยืนยันผลรายการไม่ได้ กรุณารีเฟรชตรวจสอบก่อนทำรายการซ้ำ"
        : error.name === "AbortError"
          ? "เซิร์ฟเวอร์ตอบช้า กรุณาลองรีเฟรช"
          : "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ",
    };
  } finally {
    clearTimeout(timeout);
  }
}
function apiGet(params, fresh = false) {
  const key = JSON.stringify(params);
  if (!fresh && inFlightGets.has(key)) return inFlightGets.get(key);
  const task = request(params).finally(() => {
    if (inFlightGets.get(key) === task) inFlightGets.delete(key);
  });
  inFlightGets.set(key, task);
  return task;
}
const apiPost = (body) => request(null, body); // Never retry money writes automatically.
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
function normalizeUser(user) {
  if (!user || !user.account) return null;
  const { password, idCard, ...safe } = user;
  for (const key of [
    "balance",
    "piggy",
    "dailyRent",
    "creditLimit",
    "availableCredit",
    "qrVersion",
  ])
    safe[key] = number(safe[key]);
  for (const key of ["favoriteAccounts", "earnedBadges", "creditSchedules"])
    safe[key] = Array.isArray(safe[key]) ? safe[key] : [];
  for (const key of ["negative", "qrEnabled", "hasCreditCard", "accountPaused"])
    safe[key] =
      safe[key] === true || String(safe[key]).toLowerCase() === "true";
  return { ...safe, account: String(safe.account), loan: safe.loan || null };
}
function normalizeGame(row) {
  if (
    !row ||
    ["day", "hour", "minute"].some(
      (key) =>
        row[key] === "" ||
        row[key] == null ||
        !Number.isFinite(Number(row[key])),
    )
  )
    return null;
  const day = number(row.day),
    hour = number(row.hour),
    minute = number(row.minute);
  if (day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59)
    return null;
  return {
    ...row,
    clockReceivedAt: row.clockReceivedAt || Date.now(),
    day,
    hour,
    minute,
    gamePaused:
      row.gamePaused === true ||
      String(row.gamePaused).toLowerCase() === "true",
  };
}
const sortTransactions = (rows) =>
  [...rows].sort((a, b) =>
    String(b.loggedAt || "").localeCompare(String(a.loggedAt || "")),
  );
const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// A ref closes the gap before React renders disabled=true. All async buttons
// share this primitive, including icon-only actions and modal submissions.
function ActionButton({
  onClick,
  disabled,
  children,
  type = "button",
  ...props
}) {
  const locked = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const click = async (event) => {
    if (locked.current || disabled) return;
    locked.current = true;
    const button = event.currentTarget;
    try {
      const result = onClick?.(event);
      if (result && typeof result.then === "function") {
        button.disabled = true;
        setBusy(true);
        await result;
      }
    } catch {
      if (mounted.current) setError("ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      locked.current = false;
      if (mounted.current) {
        button.disabled = !!disabled;
        setBusy(false);
      }
    }
  };
  return (
    <>
      <button
        {...props}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={click}
      >
        {busy && (
          <Loader2
            size={16}
            className="inline-block animate-spin shrink-0 mr-1"
            aria-label="กำลังดำเนินการ"
          />
        )}
        {children}
      </button>
      {error && (
        <span role="alert" className="text-xs text-pink-600">
          {error}
        </span>
      )}
    </>
  );
}

// One immutable snapshot, synchronous ref writes and generation guards keep
// older GETs from replacing newer mutations. Only confirmed data is persisted.
function useSnapshot(cacheKey, initial) {
  const [data, render] = useState(() => initial());
  const ref = useRef(data);
  const generation = useRef(0);
  const writing = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const put = useCallback(
    (next, persist = false) => {
      ref.current = typeof next === "function" ? next(ref.current) : next;
      if (alive.current) render(ref.current);
      if (persist) saveCache(cacheKey, ref.current);
    },
    [cacheKey],
  );
  return { data, ref, put, generation, writing, alive };
}
const DESIGN = `
@import url('https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&family=Prompt:wght@400;500;600;700&display=swap');
.jp { --ink:#594034; --muted:#9b8274; --line:#ffe0bd; --paper:#fffaf0; --green:#f58b38; font-family:'Prompt',sans-serif; color:var(--ink); background:var(--paper); min-height:100dvh; -webkit-tap-highlight-color:transparent; }
.jp * { box-sizing:border-box; }

.jp button { touch-action:manipulation; transition:background .18s,transform .18s,opacity .18s; }
.jp button:active:not(:disabled) { transform:scale(.97); }
.jp button:disabled { cursor:not-allowed; opacity:.5; }
.jp button:focus-visible,.jp input:focus-visible,.jp textarea:focus-visible,.jp select:focus-visible { outline:3px solid #ffba82; outline-offset:3px; }

.jp-heading { font-family:'Mitr',sans-serif; letter-spacing:-.035em; }
.jp-card { background:white; border:2px solid var(--line); border-radius:28px; }
.jp-label { font-size:11px; font-weight:500; letter-spacing:0; color:var(--muted); }
.jp-input { display:block; width:100%; border:1px solid #ffddba; border-radius:14px; background:#fffdf7; padding:13px 15px; font-size:14px; color:var(--ink); outline:none; transition:border-color .2s; }
.jp-input:focus { border-color:#ff9142; background:white; }
.jp-input::placeholder { color:#a1aaa1; }
.jp-primary { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; border:0; border-radius:16px; padding:15px 18px; color:white; background:linear-gradient(135deg,#ffad60,#ff9142); box-shadow:0 5px 0 #e77927; font-size:14px; font-weight:600; }
.jp-secondary { display:flex; align-items:center; justify-content:center; gap:8px; border:2px solid var(--line); border-radius:14px; padding:11px 16px; background:white; font-size:13px; font-weight:500; }
.jp-icon { width:40px; height:40px; border-radius:14px; display:inline-flex; align-items:center; justify-content:center; background:white; border:2px solid var(--line); flex-shrink:0; }
.jp-number { font-variant-numeric:tabular-nums; letter-spacing:-.045em; }
.jp-enter { animation:jp-enter .25s ease-out; }
.jp-shimmer { background:linear-gradient(100deg,#e8ece5 20%,#f5f7f1 45%,#e8ece5 70%); background-size:250% 100%; animation:jp-shimmer 1.6s infinite; border-radius:12px; }
@keyframes jp-enter { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:translateY(0); } }
@keyframes jp-shimmer { to { background-position:-150% 0; } }
@media(prefers-reduced-motion:reduce) { .jp *, .jp *::before { animation:none!important; transition:none!important; } }
`;
const money = (value) =>
  number(value).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const fmtAccount = (account) =>
  String(account || "").replace(/^(\d{3})(\d+)$/, "$1 $2");
const fmtGameTime = (value) => {
  const time = normalizeGame(value);
  return time
    ? `วันที่ ${time.day} · ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")} น.${time.gamePaused ? " · หยุดชั่วคราว" : ""}`
    : "กำลังซิงค์เวลา...";
};
function Brand({ admin = false }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src="./jiwpay-logo-transparent.png"
        onError={(event) => {
          if (!event.currentTarget.dataset.fallback) {
            event.currentTarget.dataset.fallback = "true";
            event.currentTarget.src =
              "https://i.postimg.cc/T2Z6xTkR/Untitled48-20260902112016.png";
          }
        }}
        alt="โลโก้ JiwPay จิ๋วเปย์"
        className="w-14 h-14 object-contain shrink-0"
      />
      <div>
        <span className="jp-heading text-xl text-orange-500 block">JiwPay</span>
        <span className="text-xs text-stone-400">
          {admin ? "จิ๋วเปย์ · ผู้ดูแล" : "จิ๋วเปย์ กระเป๋าความสุข"}
        </span>
      </div>
    </div>
  );
}
function IconButton({ label, children, ...props }) {
  return (
    <ActionButton
      className="jp-icon"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </ActionButton>
  );
}
function Field({ label, children, ...props }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="block">
      <span className="jp-label block mb-2">{label}</span>
      {children || <input id={id} className="jp-input" {...props} />}
    </label>
  );
}
function Empty({ icon: Icon = History, title, detail }) {
  return (
    <div className="py-10 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#f0f3ec] text-[#9b8274] mx-auto mb-3 flex items-center justify-center">
        <Icon size={21} />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {detail && (
        <p className="text-xs text-[#9b8274] mt-2 leading-relaxed">{detail}</p>
      )}
    </div>
  );
}
function Notice({ children }) {
  return children ? (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-2xl bg-[#fff1e8] text-[#925a36] p-3 text-xs leading-relaxed"
    >
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      {children}
    </div>
  ) : null;
}
function Toast({ toast }) {
  return toast ? (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[calc(100%-32px)] max-w-sm jp-enter"
    >
      <div className="bg-[#594034] text-white rounded-2xl shadow-xl p-4 flex items-center gap-3">
        <span
          className={
            toast.kind === "error" ? "text-orange-300" : "text-[#d7e9ac]"
          }
        >
          {toast.kind === "error" ? (
            <AlertTriangle size={21} />
          ) : (
            <CheckCircle2 size={21} />
          )}
        </span>
        <div>
          <p className="text-sm font-medium">{toast.title}</p>
          {toast.detail && (
            <p className="text-xs opacity-70 mt-1">{toast.detail}</p>
          )}
        </div>
      </div>
    </div>
  ) : null;
}
function Sheet({ title, onClose, children, busy = false }) {
  const panel = useRef(null);
  const closeRef = useRef(onClose),
    busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const key = (event) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
      if (event.key !== "Tab") return;
      const items = [
        ...panel.current.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ];
      const first = items[0],
        last = items[items.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-[80] bg-[#594034]/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="jp-enter bg-[#fffaf0] rounded-t-[28px] sm:rounded-[28px] w-full max-w-md p-6 max-h-[90dvh] overflow-y-auto outline-none"
        style={{ paddingBottom: "max(24px,env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="jp-heading text-xl">{title}</h2>
          <IconButton disabled={busy} label="ปิด" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}
function SectionTitle({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5">
      <div>
        {eyebrow && <p className="jp-label uppercase mb-1.5">{eyebrow}</p>}
        <h2 className="jp-heading text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
function PendingBanner({ active }) {
  return active ? (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] rounded-full bg-[#594034] text-white px-4 py-2.5 text-xs shadow-lg flex items-center gap-2"
    >
      <Loader2 size={14} className="animate-spin" />
      กำลังบันทึกรายการ...
    </div>
  ) : null;
}

const ADMIN_SESSION_KEY = "jiwpay_admin_key";
const AVATAR_POOL = ["🐻", "🐼", "🐱", "🐰", "🐶", "🐸", "🦊", "🐨"];
export default function AdminDashboardApp() {
  const [adminKey, setAdminKey] = useState(
    () => storageGet(ADMIN_SESSION_KEY) || "",
  );
  useEffect(() => {
    const sync = (event) => {
      if (event.key === ADMIN_SESSION_KEY) setAdminKey(event.newValue || "");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const [keyInput, setKeyInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const authLock = useRef(false);
  const verifyKey = async () => {
    if (authLock.current || !keyInput.trim()) return;
    authLock.current = true;
    setVerifying(true);
    setAuthError("");
    try {
      const result = await apiGet(
        { sheet: "GameState", adminKey: keyInput.trim() },
        true,
      );
      if (result.ok && result.scope === "admin") {
        storageSet(ADMIN_SESSION_KEY, keyInput.trim());
        setAdminKey(keyInput.trim());
      } else setAuthError(result.error || "รหัสแอดมินไม่ถูกต้อง");
    } finally {
      authLock.current = false;
      setVerifying(false);
    }
  };
  const onLogout = () => {
    storageRemove(ADMIN_SESSION_KEY);
    storageRemove("jiwpay_admin_v4");
    setAdminKey("");
  };
  if (adminKey)
    return (
      <AdminDashboard key={adminKey} adminKey={adminKey} onLogout={onLogout} />
    );
  return (
    <div className="jp">
      <style>{DESIGN}</style>
      <main className="max-w-md mx-auto px-6 py-10 min-h-[100dvh] flex flex-col">
        <Brand admin />
        <div className="my-auto py-14">
          <div className="w-16 h-16 bg-[#fff0d4] rounded-3xl flex items-center justify-center mb-7">
            <ShieldCheck size={29} className="text-[#627d4d]" />
          </div>
          <SectionTitle
            eyebrow="สำหรับผู้ดูแลระบบ"
            title="เข้าสู่ระบบผู้ดูแล"
          />
          <p className="text-sm text-[#9b8274] leading-relaxed mb-8">
            จัดการบัญชีผู้ใช้ ตรวจสอบคำขอ
            <br />
            และดูความเคลื่อนไหวในระบบ
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyKey();
            }}
            className="space-y-5"
          >
            <Field
              label="รหัสผู้ดูแลระบบ"
              type="password"
              autoComplete="current-password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="รหัสผู้ดูแลระบบ"
            />
            <Notice>{authError}</Notice>
            <ActionButton
              className="jp-primary"
              type="submit"
              disabled={verifying || !keyInput.trim()}
            >
              {verifying ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <ArrowRight size={17} />
              )}
              เข้าสู่แดชบอร์ด
            </ActionButton>
          </form>
        </div>
        <p className="text-[11px] text-[#9ca69b] text-center tracking-widest">
          JIWPAY ผู้ดูแลระบบ
        </p>
      </main>
    </div>
  );
}
function AdminDashboard({ adminKey, onLogout }) {
  const { data, ref, put, generation, writing, alive } = useSnapshot(
    "jiwpay_admin_v4",
    () => {
      const cached = loadCache("jiwpay_admin_v4", {});
      return {
        users: Array.isArray(cached.users)
          ? cached.users.map(normalizeUser).filter(Boolean)
          : [],
        transactions: Array.isArray(cached.transactions)
          ? cached.transactions
          : [],
        topups: Array.isArray(cached.topups) ? cached.topups : [],
        loanRequests: Array.isArray(cached.loanRequests)
          ? cached.loanRequests
          : [],
        badges: Array.isArray(cached.badges) ? cached.badges : [],
        gameState: normalizeGame(cached.gameState),
      };
    },
  );
  const { users, transactions, topups, loanRequests, badges, gameState } = data;
  const [tab, setTab] = useState("overview");
  const [announcementDraft, setAnnouncementDraft] = useState(
    gameState?.announcement || "",
  );
  const draftDirty = useRef(false);
  const [globalRefreshing, setGlobalRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [showAddBadge, setShowAddBadge] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [busyAction, setBusyAction] = useState(null);
  const noticeTimer = useRef();
  const refreshLock = useRef(null);
  const notify = (title, detail) => {
    setToast({
      title,
      detail,
      kind:
        title.includes("ไม่สำเร็จ") || title.includes("ยืนยันรายการไม่ได้")
          ? "error"
          : "success",
    });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setToast(null), 4200);
  };
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const refreshAll = useCallback(
    (fresh = false) => {
      if (writing.current) return Promise.resolve(false);
      if (refreshLock.current?.version === generation.current)
        return refreshLock.current;
      const version = ++generation.current;
      const task = (async () => {
        const sheets = [
          "Users",
          "Transactions",
          "Topups",
          "LoanRequests",
          "Badges",
          "GameState",
        ];
        const active = () =>
          alive.current && version === generation.current && !writing.current;
        const valid = (result) =>
          result.ok && result.scope === "admin" && Array.isArray(result.rows);
        const results = await Promise.all(
          sheets.map(async (sheet) => {
            const result = await apiGet({ sheet, adminKey }, fresh);
            if (!active()) return result;
            if (result.ok && result.scope !== "admin") {
              setAuthorized(false);
              return {
                ok: false,
                error: "รหัสแอดมินใช้ไม่ได้ กรุณาออกจากระบบแล้วใส่รหัสใหม่",
              };
            }
            if (valid(result)) {
              if (sheet === "GameState") {
                setAuthorized(true);
                if (!draftDirty.current)
                  setAnnouncementDraft(result.rows[0]?.announcement || "");
              }
              const field = {
                Users: "users",
                Transactions: "transactions",
                Topups: "topups",
                LoanRequests: "loanRequests",
                Badges: "badges",
                GameState: "gameState",
              }[sheet];
              const value =
                sheet === "Users"
                  ? result.rows.map(normalizeUser).filter(Boolean)
                  : sheet === "Transactions"
                    ? sortTransactions(result.rows)
                    : sheet === "GameState"
                      ? normalizeGame(result.rows[0])
                      : result.rows;
              put((old) => ({ ...old, [field]: value }), true);
            }
            return result;
          }),
        );
        if (!active()) return false;
        const failure = results.find((result) => !valid(result));
        setSyncError(failure?.error || "");
        return !failure;
      })().finally(() => {
        if (refreshLock.current === task) refreshLock.current = null;
      });
      task.version = version;
      refreshLock.current = task;
      return task;
    },
    [adminKey, alive, generation, put, ref, writing],
  );
  useEffect(() => {
    refreshAll();
    const sync = () => {
      if (!document.hidden) refreshAll();
    };
    const timer = setInterval(sync, 60000);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    return () => {
      refreshLock.current = null;
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [refreshAll]);
  const doGlobalRefresh = async () => {
    if (writing.current || globalRefreshing) return;
    setGlobalRefreshing(true);
    try {
      if (await refreshAll(true)) notify("รีเฟรชข้อมูลแล้ว", "");
    } finally {
      if (alive.current) setGlobalRefreshing(false);
    }
  };
  const mutate = async (key, body, optimistic, title = "บันทึกสำเร็จ") => {
    if (writing.current || !authorized)
      return { ok: false, error: "กรุณารอการตรวจสอบหรือรายการก่อนหน้า" };
    writing.current = true;
    generation.current++;
    setBusyAction(key);
    const before = ref.current;
    try {
      if (optimistic) put(optimistic(before));
      const result = await apiPost({ ...body, adminKey });
      if (!alive.current) return result;
      if (!result.ok) {
        put(before);
        notify(
          result.uncertain ? "ยังยืนยันรายการไม่ได้" : "ทำรายการไม่สำเร็จ",
          result.error,
        );
        if (result.uncertain) setSyncError(result.error);
        return result;
      }
      if (body.clockAction && !result.state) {
        put(before);
        notify(
          "กรุณาอัปเดต Apps Script",
          "ระบบเวลาต้องใช้ Code.gs รุ่นใหม่ก่อน",
        );
        return { ok: false, error: "กรุณาอัปเดต Apps Script" };
      }
      if (result.state)
        put({ ...ref.current, gameState: normalizeGame(result.state) }, true);
      else if (result.user)
        put(
          {
            ...ref.current,
            users: ref.current.users.map((u) =>
              String(u.account) === String(result.user.account)
                ? normalizeUser(result.user)
                : u,
            ),
          },
          true,
        );
      else put(ref.current, true);
      notify(title, "");
      return result;
    } catch {
      if (alive.current) {
        put(before);
        notify("ทำรายการไม่สำเร็จ", "กรุณารีเฟรชตรวจสอบ");
      }
      return { ok: false, error: "ทำรายการไม่สำเร็จ" };
    } finally {
      writing.current = false;
      if (alive.current) {
        setBusyAction(null);
        refreshAll(true);
      }
    }
  };
  const decision = (id, status, loan) => {
    const collection = loan ? "loanRequests" : "topups";
    const row = ref.current[collection].find(
      (item) => String(item.id) === String(id),
    );
    if (!row || row.status !== "pending" || writing.current)
      return Promise.resolve({ ok: false });
    return mutate(
      `decision-${id}`,
      { type: loan ? "loan_decision" : "topup_decision", id, status },
      (state) => ({
        ...state,
        [collection]: state[collection].map((item) =>
          String(item.id) === String(id) ? { ...item, status } : item,
        ),
        users: state.users.map((user) => {
          if (status !== "approved" || String(user.id) !== String(row.userId))
            return user;
          return {
            ...user,
            balance: user.balance + number(row.amount),
            ...(loan
              ? {
                  loan: {
                    principal: number(row.amount),
                    days: number(row.days),
                    rate: number(row.rate),
                    dailyInstallment: Math.ceil(
                      Math.ceil(number(row.amount) * (1 + number(row.rate))) /
                        number(row.days),
                    ),
                    daysPaid: 0,
                    status: "active",
                    startDay: state.gameState?.day || 1,
                    missedSinceDay: null,
                  },
                }
              : {}),
          };
        }),
      }),
      status === "approved" ? "อนุมัติคำขอแล้ว" : "ปฏิเสธคำขอแล้ว",
    );
  };
  const updateUser = (key, id, patch) =>
    mutate(
      key,
      { type: "user_admin_upsert", user: { id, ...patch } },
      (state) => ({
        ...state,
        users: state.users.map((user) =>
          String(user.id) === String(id) ? { ...user, ...patch } : user,
        ),
      }),
    );
  const adjustBalance = (id, delta) => {
    const user = ref.current.users.find(
      (item) => String(item.id) === String(id),
    );
    return updateUser(`balance-${id}`, id, {
      balance: Math.max(0, user.balance + number(delta)),
      negative: false,
    });
  };
  const toggleQr = (user) =>
    updateUser(`qr-${user.id}`, user.id, { qrEnabled: !user.qrEnabled });
  const reissueQr = (user) =>
    updateUser(`reissue-${user.id}`, user.id, {
      qrVersion: Math.max(1, number(user.qrVersion)) + 1,
      qrEnabled: true,
    });
  const issueCreditCard = (user) => {
    const limit = Math.floor(user.piggy * 0.5),
      used = Math.max(0, user.creditLimit - user.availableCredit);
    return updateUser(`credit-${user.id}`, user.id, {
      hasCreditCard: true,
      creditLimit: limit,
      availableCredit: Math.max(0, limit - used),
    });
  };
  const setDailyRent = (user, rent) => {
    if (number(rent) === user.dailyRent) return Promise.resolve({ ok: true });
    return updateUser(`rent-${user.id}`, user.id, {
      dailyRent: Math.max(0, number(rent)),
    });
  };
  const createAccount = (form) => {
    if (ref.current.users.some((user) => user.account === form.account))
      return Promise.resolve({ ok: false, error: "เลขบัญชีนี้ถูกใช้แล้ว" });
    const user = {
      id: Date.now(),
      account: form.account,
      name: form.shopName,
      fullName: form.fullName,
      idCard: form.idCard,
      password: form.password,
      avatar: AVATAR_POOL[Math.floor(Math.random() * AVATAR_POOL.length)],
      balance: 0,
      piggy: 0,
      dailyRent: 0,
      negative: false,
      qrEnabled: true,
      qrVersion: 1,
      hasCreditCard: false,
      creditLimit: 0,
      availableCredit: 0,
      loan: null,
      creditSchedules: [],
      favoriteAccounts: [],
      earnedBadges: [],
    };
    return mutate(
      "create-account",
      { type: "user_admin_upsert", user },
      (state) => ({ ...state, users: [...state.users, normalizeUser(user)] }),
    );
  };
  const addBadge = (badge) => {
    const row = { id: newId(), ...badge };
    return mutate(
      "add-badge",
      { type: "badge_upsert", badge: row },
      (state) => ({ ...state, badges: [...state.badges, row] }),
    );
  };
  const deleteBadge = (id) =>
    mutate(`badge-${id}`, { type: "badge_delete", id }, (state) => ({
      ...state,
      badges: state.badges.filter((badge) => badge.id !== id),
    }));
  const [nightPercent, setNightPercent] = useState(
    String(gameState?.nightPercent || 25),
  );
  useEffect(() => {
    setNightPercent(String(gameState?.nightPercent || 25));
  }, [gameState?.nightPercent]);
  const [clockSpeed, setClockSpeed] = useState(
    String(gameState?.realMinutesPerDay || 30),
  );
  useEffect(() => {
    if (gameState?.realMinutesPerDay)
      setClockSpeed(String(gameState.realMinutesPerDay));
  }, [gameState?.realMinutesPerDay]);
  const updateGame = (key, state, clockAction) =>
    mutate(
      key,
      {
        type: "game_state",
        state: { ...gameState, ...state },
        ...(clockAction ? { clockAction } : {}),
      },
      null,
    );
  const initializeGame = () =>
    updateGame(
      "initialize",
      { day: 1, hour: 6, minute: 0, gamePaused: true, announcement: "" },
      "initialize",
    );
  const togglePause = () =>
    updateGame("pause", {}, gameState.gamePaused ? "resume" : "pause");
  const skipNight = () => updateGame("skip-night", {}, "skip");
  const changeSpeed = () =>
    updateGame(
      "clock-speed",
      {
        realMinutesPerDay: Number(clockSpeed),
        nightPercent: Number(nightPercent),
      },
      "set_speed",
    );
  const publishAnnouncement = async () => {
    const result = await updateGame("announcement", {
      ...gameState,
      announcement: announcementDraft,
    });
    if (result.ok) draftDirty.current = false;
    return result;
  };
  const factoryReset = async () => {
    if (resetPhrase !== "ยืนยัน") return;
    const result = await mutate(
      "reset",
      { type: "factory_reset" },
      null,
      "รีเซ็ตระบบแล้ว",
    );
    if (result.ok) {
      put(
        {
          users: [],
          transactions: [],
          topups: [],
          loanRequests: [],
          badges: [],
          gameState: null,
        },
        true,
      );
      setShowResetConfirm(false);
      setResetPhrase("");
      draftDirty.current = false;
      setAnnouncementDraft("");
    }
  };
  const pending = topups.filter((row) => row.status === "pending");
  const pendingLoans = loanRequests.filter((row) => row.status === "pending");
  const totalBalance = users.reduce((sum, user) => sum + user.balance, 0);
  const filteredUsers = users.filter(
    (user) =>
      String(user.name || "").includes(search) || user.account.includes(search),
  );
  const topupDecision = (id, status) => decision(id, status, false);
  const loanDecision = (id, status) => decision(id, status, true);
  const TABS = [
    { key: "overview", label: "ภาพรวม", icon: LayoutDashboard },
    { key: "time", label: "เวลาเกม", icon: Clock },
    {
      key: "topups",
      label: "คำขอเติมเงิน",
      icon: Wallet,
      badge: pending.length,
    },
    {
      key: "loans",
      label: "เงินกู้",
      icon: Banknote,
      badge: pendingLoans.length,
    },
    { key: "users", label: "บัญชีผู้ใช้", icon: Users },
    { key: "debts", label: "ยอดค้าง / พักบัญชี", icon: Banknote },
    { key: "badges", label: "เหรียญ", icon: Award },
    { key: "announcement", label: "ประกาศ", icon: Megaphone },
  ];

  return (
    <div
      className="jp min-h-screen overflow-y-auto pb-10 bg-amber-50"
      style={{ fontFamily: "Prompt, sans-serif" }}
    >
      <style>{`${DESIGN} @keyframes jp-spin { to { transform: rotate(360deg); } } .jp-spin { animation: jp-spin 0.8s linear infinite; }`}</style>
      <div className="sticky top-0 z-30 bg-white border-b-2 border-orange-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <Brand admin />
              <div className="text-[11px] text-stone-400">
                <GameClock state={gameState} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ActionButton
                onClick={doGlobalRefresh}
                aria-label="รีเฟรชข้อมูล"
                disabled={globalRefreshing || !!busyAction}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border-2 border-orange-100 text-xs font-semibold text-stone-600"
              >
                <RefreshCw
                  size={13}
                  className={globalRefreshing ? "jp-spin" : ""}
                />{" "}
                รีเฟรช
              </ActionButton>
              <ActionButton
                disabled={!!busyAction}
                onClick={onLogout}
                className="px-3 py-2 rounded-xl bg-stone-100 text-xs font-semibold text-stone-500"
              >
                ออกจากระบบ
              </ActionButton>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <ActionButton
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-semibold border-2 ${active ? "bg-orange-500 border-orange-600 text-white" : "bg-white border-orange-100 text-stone-500"}`}
                >
                  <Icon size={16} /> {t.label}
                  {!!t.badge && (
                    <span
                      className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${active ? "bg-white text-orange-600" : "bg-pink-100 text-pink-600"}`}
                    >
                      {t.badge}
                    </span>
                  )}
                </ActionButton>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pt-3">
        <Notice>{syncError}</Notice>
        {!authorized && !syncError && (
          <p className="text-xs text-stone-400">กำลังตรวจสอบสิทธิ์ผู้ดูแล...</p>
        )}
      </div>
      <fieldset
        disabled={!!busyAction || !authorized}
        className="border-0 p-0 min-w-0"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          {tab === "debts" && (
            <DebtPanel
              users={users}
              onSubmit={(body) =>
                mutate("admin-debt", { type: "admin_debt", ...body }, null)
              }
            />
          )}
          {tab === "overview" && (
            <div>
              <h1 className="jp-heading text-xl mb-4">ภาพรวมระบบ</h1>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="ผู้ใช้ทั้งหมด"
                  value={users.length}
                  icon={Users}
                  tone="orange"
                />
                <StatCard
                  label="ยอดเงินรวมในระบบ"
                  value={`${totalBalance.toLocaleString()} ฿`}
                  icon={Wallet}
                  tone="teal"
                />
                <StatCard
                  label="คำขอรอตรวจ"
                  value={pending.length + pendingLoans.length}
                  icon={Clock}
                  tone="pink"
                />
                <StatCard
                  label="ธุรกรรมทั้งหมด"
                  value={transactions.length}
                  icon={TrendingUp}
                  tone="amber"
                />
              </div>
              <div className="mt-6 bg-white rounded-2xl border-2 border-orange-100 p-4 sm:p-5">
                <h3
                  className="font-semibold text-stone-800 mb-3"
                  style={{ fontFamily: "Mitr, sans-serif" }}
                >
                  กิจกรรมล่าสุด
                </h3>
                <div className="divide-y divide-orange-50">
                  {transactions.slice(0, 8).map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg">
                        {Number(t.fromId) === 0 ? "🏦" : "👤"}
                      </div>
                      <div className="flex-1 min-w-0 text-sm">
                        <span className="font-semibold text-stone-800">
                          {fmtAccount(String(t.fromId))}
                        </span>
                        <span className="text-stone-400">
                          {" "}
                          → {fmtAccount(String(t.toId))}
                        </span>
                        <div className="text-xs text-stone-400">
                          {t.type} · {t.memo} · วันที่ {t.day}
                        </div>
                      </div>
                      <div
                        className="font-bold text-sm text-stone-800"
                        style={{ fontFamily: "Mitr, sans-serif" }}
                      >
                        {Number(t.amount).toLocaleString()}฿
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <div className="text-center text-stone-400 text-sm py-6">
                      ยังไม่มีธุรกรรม
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 bg-white rounded-2xl border-2 border-pink-200 p-4 sm:p-5">
                <div
                  className="flex items-center gap-2 mb-2 text-pink-600 font-semibold"
                  style={{ fontFamily: "Mitr, sans-serif" }}
                >
                  <AlertTriangle size={18} /> เขตอันตราย
                </div>
                <p className="text-xs text-stone-400 mb-3">
                  ล้างข้อมูลทั้งหมดกลับสู่ค่าเริ่มต้น — ลบทุกชีตยกเว้นหัวตาราง
                </p>
                <ActionButton
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pink-500 text-white text-sm font-semibold"
                >
                  <RotateCcw size={15} /> เริ่มเกมใหม่ (Factory Reset)
                </ActionButton>
              </div>
            </div>
          )}

          {tab === "time" && !gameState && (
            <div className="jp-card p-6 text-center">
              <p>กำลังซิงค์เวลา...</p>
              <ActionButton
                onClick={initializeGame}
                className="jp-primary mt-4"
              >
                ตั้งเวลาเริ่มต้น 06:00 น.
              </ActionButton>
            </div>
          )}
          {tab === "time" && gameState && (
            <div>
              <h2
                className="font-semibold text-xl text-stone-800 mb-1"
                style={{ fontFamily: "Mitr, sans-serif" }}
              >
                ระบบจัดการเวลาในเกม
              </h2>
              <div className="bg-white rounded-2xl border-2 border-orange-100 p-5 text-center mb-4">
                <GameClock state={gameState} large />
                {gameState.gamePaused && (
                  <div className="mt-2 inline-block text-xs font-bold text-pink-600 bg-pink-50 px-3 py-1 rounded-full">
                    ⏸️ หยุดชั่วคราว
                  </div>
                )}
              </div>
              <div className="jp-card p-5 mb-4">
                <label className="block text-sm font-semibold text-stone-700">
                  เวลาโลกจริงต่อ 1 วันเกม
                  <select
                    value={clockSpeed}
                    onChange={(event) => setClockSpeed(event.target.value)}
                    className="block w-full p-3 mt-2 rounded-xl border-2 border-orange-100 bg-white"
                  >
                    {[10, 15, 20, 30, 40, 60].map((value) => (
                      <option key={value} value={value}>
                        {value} นาที = 1 วันในเกม
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-stone-700 mt-4">
                  สัดส่วนเวลากลางคืน (18:00–06:00)
                  <select
                    value={nightPercent}
                    onChange={(event) => setNightPercent(event.target.value)}
                    className="block w-full p-3 mt-2 rounded-xl border-2 border-orange-100 bg-white"
                  >
                    {[5, 10, 20, 25, 30, 50].map((value) => (
                      <option key={value} value={value}>
                        {value}%
                        {value === 50
                          ? " · กลางวันและกลางคืนเท่ากัน"
                          : " ของเวลาทั้งวัน"}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm text-orange-700 mt-3" role="status">
                  กลางวัน 06:00–18:00:{" "}
                  {formatDuration(
                    Number(clockSpeed) * 60 * (1 - Number(nightPercent) / 100),
                  )}
                  <br />
                  กลางคืน 18:00–06:00:{" "}
                  {formatDuration(
                    (Number(clockSpeed) * 60 * Number(nightPercent)) / 100,
                  )}
                </p>
                <ActionButton
                  className="jp-primary w-full mt-3"
                  onClick={changeSpeed}
                >
                  {gameState.clockEnabled ? "บันทึกความเร็ว" : "เริ่มนาฬิกาเกม"}
                </ActionButton>
                <p className="text-xs text-stone-500 mt-3">
                  แนะนำ 30 นาที · เปลี่ยนความเร็วแล้วเวลาเดินต่อจากจุดเดิม
                  เกมจะเดินต่อแม้ปิดเว็บจนกดหยุดเกม
                </p>
              </div>
              <ActionButton
                onClick={togglePause}
                disabled={busyAction === "pause" || !gameState.clockEnabled}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-white mb-4 disabled:opacity-60 ${gameState.gamePaused ? "bg-teal-500" : "bg-stone-800"}`}
                style={{ fontFamily: "Mitr, sans-serif" }}
              >
                {busyAction === "pause" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : gameState.gamePaused ? (
                  <Play size={18} />
                ) : (
                  <Pause size={18} />
                )}{" "}
                {gameState.gamePaused ? "เล่นต่อ" : "หยุดเกมชั่วคราว"}
              </ActionButton>
              <ActionButton
                onClick={skipNight}
                disabled={
                  busyAction === "skip-night" || !gameState.clockEnabled
                }
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-white bg-orange-500 disabled:opacity-60"
              >
                {busyAction === "skip-night" ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <SkipForward size={18} />
                )}{" "}
                ข้ามคืน → 06:00 วันถัดไป
              </ActionButton>
              <p className="text-xs text-stone-400 mt-3">
                💡 ค่าเช่า ดอกเบี้ย และรอบผ่อนคิดตามวันในเกมเมื่อขึ้นวันใหม่
                ข้ามคืนจะปิดรอบการเงิน 1 วันตามกติกาเดิม ระบบตรวจรอบประมาณทุก 1
                นาทีจริง
              </p>
            </div>
          )}

          {tab === "topups" && (
            <div>
              <h2
                className="font-semibold text-xl text-stone-800 mb-4"
                style={{ fontFamily: "Mitr, sans-serif" }}
              >
                คำขอเติมเงิน
              </h2>
              <div className="space-y-2.5">
                {pending.map((r) => {
                  const u = users.find(
                    (x) => String(x.id) === String(r.userId),
                  );
                  const rowBusy = !!busyAction || !authorized;
                  return (
                    <div
                      key={r.id}
                      className="bg-white border-2 border-orange-100 rounded-xl p-3.5 flex items-center gap-3"
                    >
                      <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl shrink-0">
                        {u?.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-stone-800">
                          {u?.name}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          {r.reason} · วันที่ {r.day}
                        </div>
                        <div
                          className="font-bold text-orange-600"
                          style={{ fontFamily: "Mitr, sans-serif" }}
                        >
                          ขอเติม {Number(r.amount).toLocaleString()} ฿
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <ActionButton
                          disabled={rowBusy}
                          onClick={() => topupDecision(r.id, "approved")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold disabled:opacity-60"
                        >
                          {rowBusy ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}{" "}
                          อนุมัติ
                        </ActionButton>
                        <ActionButton
                          disabled={rowBusy}
                          onClick={() => topupDecision(r.id, "rejected")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-50 border-2 border-pink-200 text-pink-600 text-xs font-semibold disabled:opacity-60"
                        >
                          <XCircle size={13} /> ปฏิเสธ
                        </ActionButton>
                      </div>
                    </div>
                  );
                })}
                {pending.length === 0 && (
                  <div className="text-center text-stone-400 text-sm py-8 bg-white rounded-2xl border-2 border-orange-100">
                    ไม่มีคำขอที่รอตรวจสอบ 🎉
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "loans" && (
            <div>
              <h2
                className="font-semibold text-xl text-stone-800 mb-4"
                style={{ fontFamily: "Mitr, sans-serif" }}
              >
                คำขอกู้เงิน
              </h2>
              <div className="space-y-2.5">
                {pendingLoans.map((r) => {
                  const u = users.find(
                    (x) => String(x.id) === String(r.userId),
                  );
                  const rowBusy = !!busyAction || !authorized;
                  return (
                    <div
                      key={r.id}
                      className="bg-white border-2 border-orange-100 rounded-xl p-3.5 flex items-center gap-3"
                    >
                      <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl shrink-0">
                        {u?.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-stone-800">
                          {u?.name}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          {r.days} วัน · ดอกเบี้ย {Math.round(r.rate * 100)}%
                        </div>
                        <div
                          className="font-bold text-orange-600"
                          style={{ fontFamily: "Mitr, sans-serif" }}
                        >
                          ขอกู้ {Number(r.amount).toLocaleString()} ฿
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <ActionButton
                          disabled={rowBusy}
                          onClick={() => loanDecision(r.id, "approved")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold disabled:opacity-60"
                        >
                          {rowBusy ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}{" "}
                          อนุมัติ
                        </ActionButton>
                        <ActionButton
                          disabled={rowBusy}
                          onClick={() => loanDecision(r.id, "rejected")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-50 border-2 border-pink-200 text-pink-600 text-xs font-semibold disabled:opacity-60"
                        >
                          <XCircle size={13} /> ปฏิเสธ
                        </ActionButton>
                      </div>
                    </div>
                  );
                })}
                {pendingLoans.length === 0 && (
                  <div className="text-center text-stone-400 text-sm py-8 bg-white rounded-2xl border-2 border-orange-100">
                    ไม่มีคำขอกู้เงินที่รอตรวจ
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "users" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2
                  className="font-semibold text-xl text-stone-800"
                  style={{ fontFamily: "Mitr, sans-serif" }}
                >
                  จัดการผู้ใช้
                </h2>
                <ActionButton
                  onClick={() => setShowCreateAccount(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold"
                >
                  <UserPlus size={16} /> สร้างบัญชี
                </ActionButton>
              </div>
              <div className="relative mb-4">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อร้านหรือเลขบัญชี"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
                />
              </div>
              <div className="bg-white rounded-2xl border-2 border-orange-100 overflow-hidden">
                {filteredUsers.map((u, i) => (
                  <div
                    key={u.id}
                    className={`p-4 ${i !== 0 ? "border-t border-orange-50" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl shrink-0">
                        {u.avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-stone-800 truncate flex items-center gap-1.5">
                          {u.name}{" "}
                          {!u.qrEnabled && (
                            <ShieldOff size={13} className="text-pink-500" />
                          )}
                        </div>
                        <div className="text-xs text-stone-400">
                          เลขบัญชี {fmtAccount(u.account)} · บัตร v{u.qrVersion}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`text-sm font-bold ${u.negative ? "text-pink-500" : "text-stone-800"}`}
                          style={{ fontFamily: "Mitr, sans-serif" }}
                        >
                          {Number(u.balance).toLocaleString()} ฿
                        </div>
                        <div className="text-[10px] text-teal-600 font-medium">
                          กระปุก {Number(u.piggy || 0).toLocaleString()} ฿
                        </div>
                        {u.hasCreditCard && (
                          <div className="text-[10px] text-stone-500 font-medium">
                            เครดิต{" "}
                            {Number(u.availableCredit || 0).toLocaleString()}/
                            {Number(u.creditLimit || 0).toLocaleString()} ฿
                          </div>
                        )}
                        <ActionButton
                          onClick={() => setEditUser(u)}
                          className="text-xs font-semibold text-orange-600 mt-1"
                        >
                          แก้ไขยอดเงิน
                        </ActionButton>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <ActionButton
                        disabled={busyAction === `qr-${u.id}`}
                        onClick={() => toggleQr(u)}
                        className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-xs font-semibold disabled:opacity-60 ${u.qrEnabled ? "bg-pink-50 text-pink-600 border-2 border-pink-200" : "bg-teal-50 text-teal-600 border-2 border-teal-200"}`}
                      >
                        {busyAction === `qr-${u.id}` ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : u.qrEnabled ? (
                          <ShieldOff size={13} />
                        ) : (
                          <ShieldCheck size={13} />
                        )}{" "}
                        {u.qrEnabled ? "ระงับ QR" : "เปิดใช้งาน QR"}
                      </ActionButton>
                      <ActionButton
                        disabled={busyAction === `reissue-${u.id}`}
                        onClick={() => reissueQr(u)}
                        className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-xs font-semibold bg-stone-50 text-stone-600 border-2 border-stone-200 disabled:opacity-60"
                      >
                        {busyAction === `reissue-${u.id}` ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <QrCode size={13} />
                        )}{" "}
                        ออกบัตรใหม่ · QR + NFC
                      </ActionButton>
                    </div>
                    <ActionButton
                      disabled={busyAction === `credit-${u.id}`}
                      onClick={() => issueCreditCard(u)}
                      className="w-full flex items-center justify-center gap-1.5 mt-2 py-2 rounded-lg text-xs font-semibold bg-stone-800 text-white disabled:opacity-60"
                    >
                      {busyAction === `credit-${u.id}` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Banknote size={13} />
                      )}{" "}
                      {u.hasCreditCard
                        ? `คำนวณวงเงินใหม่ (${Math.floor((u.piggy || 0) * 0.5).toLocaleString()} ฿)`
                        : "ออกบัตรเครดิต (50% ของกระปุก)"}
                    </ActionButton>
                    <div className="flex items-center gap-2 mt-2 bg-amber-50 border-2 border-amber-100 rounded-lg px-3 py-2">
                      <span className="text-xs font-semibold text-stone-600 shrink-0">
                        💸 ค่าเช่ารายวัน
                      </span>
                      <input
                        defaultValue={u.dailyRent || 0}
                        onBlur={(e) =>
                          setDailyRent(
                            u,
                            Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                          )
                        }
                        inputMode="numeric"
                        className="flex-1 min-w-0 px-2 py-1 rounded-md border border-amber-200 text-sm font-bold text-center outline-none bg-white"
                        style={{ fontFamily: "Mitr, sans-serif" }}
                      />
                      <span className="text-xs text-stone-400 shrink-0">
                        ฿/วัน
                      </span>
                    </div>
                    <VisaCard user={u} />
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <div className="text-center text-stone-400 text-sm py-8">
                    ไม่พบผู้ใช้
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "badges" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="font-semibold text-xl text-stone-800"
                  style={{ fontFamily: "Mitr, sans-serif" }}
                >
                  จัดการเหรียญรางวัล
                </h2>
                <ActionButton
                  onClick={() => setShowAddBadge(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold"
                >
                  <Plus size={16} /> เพิ่มเหรียญ
                </ActionButton>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {badges.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl border-2 border-orange-100 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-3xl">{b.icon}</div>
                      <ActionButton
                        onClick={() => deleteBadge(b.id)}
                        className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center text-pink-500"
                      >
                        <Trash2 size={14} />
                      </ActionButton>
                    </div>
                    <div
                      className="font-semibold text-stone-800 text-sm mt-3"
                      style={{ fontFamily: "Mitr, sans-serif" }}
                    >
                      {b.label}
                    </div>
                    <div className="text-xs text-stone-400 mt-1">
                      {b.criteria}
                    </div>
                    <div className="text-[10px] text-orange-500 font-semibold mt-2 bg-orange-50 inline-block px-2 py-0.5 rounded-full">
                      {b.conditionType} ≥ {b.threshold}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "announcement" && gameState && (
            <div>
              <h2
                className="font-semibold text-xl text-stone-800 mb-4"
                style={{ fontFamily: "Mitr, sans-serif" }}
              >
                ระบบประกาศ
              </h2>
              <div className="bg-white rounded-2xl border-2 border-orange-100 p-5">
                <div className="text-xs font-semibold text-stone-500 mb-1.5">
                  ประกาศปัจจุบัน
                </div>
                <div className="rounded-xl bg-stone-800 text-white text-sm px-4 py-3 mb-4">
                  📢 {gameState.announcement || "(ยังไม่มีข้อความ)"}
                </div>
                <textarea
                  value={announcementDraft}
                  onChange={(e) => {
                    draftDirty.current = true;
                    setAnnouncementDraft(e.target.value);
                  }}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300 mb-3"
                />
                <ActionButton
                  onClick={publishAnnouncement}
                  disabled={busyAction === "announcement"}
                  className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {busyAction === "announcement" && (
                    <Loader2 size={15} className="animate-spin" />
                  )}{" "}
                  เผยแพร่ประกาศ
                </ActionButton>
              </div>
            </div>
          )}
        </div>

        {editUser && (
          <Modal
            title={`แก้ไขยอดเงิน · ${editUser.name}`}
            onClose={() => setEditUser(null)}
          >
            <BalanceEditor
              user={editUser}
              busy={busyAction === `balance-${editUser.id}`}
              onApply={async (delta) => {
                const result = await adjustBalance(editUser.id, delta);
                if (result.ok) setEditUser(null);
              }}
            />
          </Modal>
        )}
        {showAddBadge && (
          <AddBadgeModal
            busy={busyAction === "add-badge"}
            onClose={() => setShowAddBadge(false)}
            onAdd={async (b) => {
              const result = await addBadge(b);
              if (result.ok) setShowAddBadge(false);
            }}
          />
        )}
        {showCreateAccount && (
          <CreateAccountModal
            busy={busyAction === "create-account"}
            onClose={() => setShowCreateAccount(false)}
            onCreate={createAccount}
            existingAccounts={users.map((u) => u.account)}
          />
        )}
        {showResetConfirm && (
          <Modal
            title="ยืนยันการรีเซ็ตเกม"
            onClose={() => setShowResetConfirm(false)}
          >
            <div className="flex items-center gap-2 bg-pink-50 border-2 border-pink-300 text-pink-600 rounded-xl px-4 py-3 text-xs font-semibold mb-4">
              <AlertTriangle size={18} /> การกระทำนี้จะลบข้อมูลทุกชีตทันที
              ไม่สามารถย้อนกลับได้
            </div>
            <label className="text-xs font-semibold text-stone-500">
              พิมพ์คำว่า "ยืนยัน" เพื่อดำเนินการต่อ
            </label>
            <input
              value={resetPhrase}
              onChange={(e) => setResetPhrase(e.target.value)}
              className="w-full mt-1 mb-4 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
            />
            <ActionButton
              disabled={resetPhrase !== "ยืนยัน" || busyAction === "reset"}
              onClick={factoryReset}
              className="w-full py-3.5 rounded-xl font-semibold text-white disabled:bg-stone-200 bg-pink-500 flex items-center justify-center gap-2"
            >
              {busyAction === "reset" && (
                <Loader2 size={16} className="animate-spin" />
              )}{" "}
              เริ่มเกมใหม่ (ลบข้อมูลทั้งหมด)
            </ActionButton>
          </Modal>
        )}
      </fieldset>
      <PendingBanner active={busyAction} />
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] w-[92%] max-w-sm">
          <div className="bg-white rounded-2xl shadow-xl border-2 border-teal-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div
                className="font-semibold text-sm text-stone-800"
                style={{ fontFamily: "Mitr, sans-serif" }}
              >
                {toast.title}
              </div>
              {toast.detail && (
                <div className="text-xs text-stone-500 truncate">
                  {toast.detail}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceEditor({ user, busy, onApply }) {
  const [amount, setAmount] = useState("");
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-2xl">
          {user.avatar}
        </div>
        <div>
          <div className="text-sm font-semibold text-stone-800">
            {user.name}
          </div>
          <div className="text-xs text-stone-400">
            ยอดปัจจุบัน {Number(user.balance).toLocaleString()} ฿
          </div>
        </div>
      </div>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="0"
        inputMode="numeric"
        className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 text-lg font-semibold outline-none focus:border-orange-300 mb-4"
        style={{ fontFamily: "Mitr, sans-serif" }}
      />
      <div className="grid grid-cols-2 gap-3">
        <ActionButton
          disabled={busy}
          onClick={() => onApply(Number(amount) || 0)}
          className="py-3 rounded-xl bg-teal-500 text-white font-semibold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Plus size={15} />
          )}{" "}
          เพิ่มยอดเงิน
        </ActionButton>
        <ActionButton
          disabled={busy}
          onClick={() => onApply(-(Number(amount) || 0))}
          className="py-3 rounded-xl bg-pink-50 border-2 border-pink-200 text-pink-600 font-semibold text-sm disabled:opacity-60"
        >
          หักยอดเงิน
        </ActionButton>
      </div>
    </div>
  );
}

function AddBadgeModal({ busy, onClose, onAdd }) {
  const [b, setB] = useState({
    icon: "🏅",
    label: "",
    criteria: "",
    conditionType: "sales",
    threshold: 5,
  });
  return (
    <Modal title="เพิ่มเหรียญรางวัลใหม่" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-stone-500">
            ไอคอน (อีโมจิ)
          </label>
          <input
            value={b.icon}
            onChange={(e) => setB((x) => ({ ...x, icon: e.target.value }))}
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-lg outline-none focus:border-orange-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            ชื่อเหรียญ
          </label>
          <input
            value={b.label}
            onChange={(e) => setB((x) => ({ ...x, label: e.target.value }))}
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            เงื่อนไข (คำอธิบาย)
          </label>
          <input
            value={b.criteria}
            onChange={(e) => setB((x) => ({ ...x, criteria: e.target.value }))}
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            ประเภทเงื่อนไข
          </label>
          <select
            value={b.conditionType}
            onChange={(e) =>
              setB((x) => ({ ...x, conditionType: e.target.value }))
            }
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          >
            <option value="sales">ยอดขาย (จำนวนครั้ง)</option>
            <option value="spending">ยอดใช้จ่ายสะสม</option>
            <option value="savings">ยอดออมในกระปุก</option>
            <option value="top_daily_seller">ขายดีที่สุดประจำวัน</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            เกณฑ์ขั้นต่ำ
          </label>
          <input
            value={b.threshold}
            onChange={(e) =>
              setB((x) => ({
                ...x,
                threshold: Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
              }))
            }
            inputMode="numeric"
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        <ActionButton
          disabled={busy}
          onClick={() => b.label.trim() && onAdd(b)}
          className="w-full mt-2 py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />} บันทึกเหรียญ
        </ActionButton>
      </div>
    </Modal>
  );
}

function CreateAccountModal({ busy, onClose, onCreate, existingAccounts }) {
  const [form, setForm] = useState({
    fullName: "",
    idCard: "",
    shopName: "",
    account: "",
    password: "",
  });
  const [error, setError] = useState("");
  const submit = async () => {
    if (!form.fullName || !form.shopName || !form.password)
      return setError("กรุณากรอกข้อมูลให้ครบ");
    if (form.idCard.length !== 13)
      return setError("เลขบัตรประชาชนจำลองต้องมี 13 หลัก");
    if (form.account.length !== 6) return setError("เลขบัญชีต้องมี 6 หลัก");
    if (existingAccounts.map(String).includes(form.account))
      return setError("เลขบัญชีนี้ถูกใช้แล้ว");
    setError("");
    const res = await onCreate(form);
    if (res?.ok) onClose();
    else setError(res?.error || "สร้างบัญชีไม่สำเร็จ");
  };
  return (
    <Modal title="สร้างบัญชีใหม่" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-stone-500">
            ชื่อ-นามสกุลเจ้าของบัญชี
          </label>
          <input
            value={form.fullName}
            onChange={(e) =>
              setForm((f) => ({ ...f, fullName: e.target.value }))
            }
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            เลขบัตรประชาชนจำลอง (13 หลัก)
          </label>
          <input
            value={form.idCard}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                idCard: e.target.value.replace(/[^0-9]/g, "").slice(0, 13),
              }))
            }
            inputMode="numeric"
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            ชื่อร้าน / ชื่อเล่น
          </label>
          <input
            value={form.shopName}
            onChange={(e) =>
              setForm((f) => ({ ...f, shopName: e.target.value }))
            }
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            เลขบัญชี (6 หลัก)
          </label>
          <input
            value={form.account}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                account: e.target.value.replace(/[^0-9]/g, "").slice(0, 6),
              }))
            }
            inputMode="numeric"
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500">
            รหัสผ่านเริ่มต้น
          </label>
          <input
            value={form.password}
            onChange={(e) =>
              setForm((f) => ({ ...f, password: e.target.value }))
            }
            className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300"
          />
        </div>
        {error && (
          <div className="text-xs text-pink-500 font-medium">{error}</div>
        )}
        <ActionButton
          disabled={busy}
          onClick={submit}
          className="w-full mt-2 py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />} สร้างบัญชี
        </ActionButton>
      </div>
    </Modal>
  );
}

function StatCard({ label, value, icon: Icon, tone }) {
  const tones = {
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    pink: "bg-pink-50 text-pink-700 border-pink-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <div className={`rounded-2xl border-2 p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium opacity-80">{label}</span>
        <Icon size={18} />
      </div>
      <div
        className="mt-2 font-semibold text-2xl"
        style={{ fontFamily: "Mitr, sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}

function Modal(props) {
  return <Sheet {...props} />;
}
function VisaCard({ user }) {
  const [printError, setPrintError] = useState("");
  const [cardImage, setCardImage] = useState(null);
  const [nfcCopied, setNfcCopied] = useState(false);
  const nfcUrl =
    window.location.protocol === "https:"
      ? buildNfcUrl(
          window.location.href,
          user.account,
          Math.max(1, number(user.qrVersion)),
        )
      : "";
  const version = Math.max(1, number(user.qrVersion));
  const payload = JSON.stringify({
    action: "jiwpay_card",
    account: String(user.account),
    cardType: user.hasCreditCard ? "visa" : "wallet",
    qrVersion: version,
  });
  useEffect(() => { setCardImage(null); setNfcCopied(false); }, [payload, user.name, user.qrEnabled]);
  return (
    <details className="jp-card overflow-hidden mt-4">
      <summary className="cursor-pointer p-4 flex items-center gap-2 text-sm font-semibold">
        <CreditCard size={18} className="text-orange-500" />
        {user.hasCreditCard
          ? "บัตร Visa / QR / ลิงก์ NFC"
          : "บัตร JiwPay / QR / ลิงก์ NFC"}
        <span className="ml-auto text-stone-400">⌄</span>
      </summary>
      <div className="px-4 pb-5">
        <div className="rounded-3xl bg-gradient-to-br from-stone-800 via-stone-700 to-amber-900 text-white p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-semibold inline-flex items-center gap-2">
              <LogoMark /> JiwPay
            </span>
            <span className="text-2xl font-bold italic">
              {user.hasCreditCard ? "VISA" : "JIWPAY"}
            </span>
          </div>
          <p className="text-[11px] text-amber-200 mt-2">บัตรภายในเกม JiwPay</p>
          <div className="bg-white rounded-2xl p-3 w-fit mx-auto mt-5">
            {user.qrEnabled ? (
              <CardQr payload={payload} />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-stone-500 text-sm">
                บัตรถูกระงับ
              </div>
            )}
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <p className="text-xs opacity-70">{user.name}</p>
              <p className="font-mono tracking-widest mt-1">
                {fmtAccount(user.account)}
              </p>
            </div>
            <span className="text-xs text-amber-200">บัตรรุ่น {version}</span>
          </div>
        </div>
        {user.qrEnabled && (
          <ActionButton
            className="jp-primary w-full mt-4"
            onClick={async () => {
              setPrintError("");
              try {
                setCardImage(await createCardImage(user, payload, version));
              } catch (error) {
                setPrintError(error.message);
              }
            }}
          >
            เตรียมรูปบัตรแนวนอน
          </ActionButton>
        )}
        {user.qrEnabled && (
          <div className="mt-4 p-3 rounded-xl bg-orange-50 space-y-2">
            <p className="text-sm font-semibold">
              ตั้งบัตร NFC · รุ่น {version} · iPhone / Android
            </p>
            {nfcUrl ? (
              <>
                <input
                  aria-label="ลิงก์สำหรับเขียนลงบัตร NFC"
                  readOnly
                  value={nfcUrl}
                  className="w-full rounded-lg p-2 text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <ActionButton
                  className="jp-secondary w-full"
                  onClick={async () => {
                    await navigator.clipboard.writeText(nfcUrl);
                    setNfcCopied(true);
                  }}
                >
                  {nfcCopied ? "คัดลอกแล้ว" : "คัดลอกลิงก์ NFC"}
                </ActionButton>
              </>
            ) : (
              <p className="text-xs">
                เปิดหน้าแอดมินบนเว็บ HTTPS จริงเพื่อคัดลอกลิงก์
                ไม่ใช้ลิงก์จากเครื่องพรีวิว
              </p>
            )}
            <p className="text-xs text-stone-600">
              ใช้ NFC Tools → Write → Add a record → URL/URI
              วางลิงก์นี้แล้วเขียนลงบัตร QR และ NFC ใช้บัตรรุ่นเดียวกัน
              ออกบัตรใหม่แล้วทั้ง QR และลิงก์เดิมใช้รับชำระไม่ได้ ต้องเขียน NFC และเปลี่ยน QR ใหม่ด้วย
              แตะบัตรเพื่อเปิดหน้ารับชำระ ไม่ตัดเงินเพียงแค่เปิดลิงก์
            </p>
          </div>
        )}
        {cardImage && user.qrEnabled && (
          <div className="mt-4 space-y-3">
            <img
              src={cardImage}
              alt={`บัตรแนวนอนของ ${user.name}`}
              className="w-full rounded-xl border border-orange-100"
            />
            <a
              href={cardImage}
              download={`JiwPay-${user.account}-v${version}-3x2in.png`}
              className="jp-primary w-full"
            >
              บันทึกรูปบัตร
            </a>
            <p className="text-xs text-stone-500">
              PNG 1500 × 1000 พิกเซล · แนวนอน 3 × 2 นิ้ว
              <br />
              บน iPhone ถ้าเปิดเป็นรูป ให้แตะรูปค้างแล้วเลือกบันทึกไปยังรูปภาพ
              เมื่อนำไปจัดพิมพ์ กำหนดขนาดแต่ละใบเป็น 3 × 2 นิ้ว
            </p>
          </div>
        )}
        {printError && (
          <p role="alert" className="text-sm text-red-600 mt-2">
            {printError}
          </p>
        )}
        <p className="text-xs text-stone-500 mt-4 leading-relaxed">
          ให้ร้านค้าสแกน QR นี้เพื่อรับชำระจากบัญชีนี้ เลือกจ่ายเต็มหรือผ่อน 0%
          ได้ที่หน้าร้านค้า
        </p>
      </div>
    </details>
  );
}
function CardQr({ payload }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [payload]);
  return failed ? (
    <ActionButton
      className="jp-secondary w-40 h-40 text-xs"
      onClick={() => setFailed(false)}
    >
      โหลด QR อีกครั้ง
    </ActionButton>
  ) : (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`}
      width={160}
      height={160}
      alt="QR บัตร Visa สำหรับร้านค้าสแกนตัดเงิน"
      onError={() => setFailed(true)}
    />
  );
}

// A separate print document keeps account management controls off the sticker.
async function createCardImage(user, payload, version) {
  const load = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = setTimeout(
        () => reject(new Error("โหลดรูปบัตรไม่สำเร็จ กรุณาลองใหม่")),
        20000,
      );
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error("โหลดโลโก้หรือ QR ไม่สำเร็จ กรุณาลองใหม่"));
      };
      img.src = src;
    });
  await document.fonts.ready;
  const [logo, qr] = await Promise.all([
    load(new URL("./jiwpay-logo-transparent.png", document.baseURI).href),
    load(
      `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=40&ecc=M&data=${encodeURIComponent(payload)}`,
    ),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = 1500;
  canvas.height = 1000;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("อุปกรณ์นี้ยังสร้างรูปบัตรไม่ได้");
  const bg = c.createLinearGradient(0, 0, 1500, 1000);
  bg.addColorStop(0, "#ffb46b");
  bg.addColorStop(0.5, "#ff8248");
  bg.addColorStop(1, "#f15a91");
  c.fillStyle = bg;
  c.fillRect(0, 0, 1500, 1000);
  c.fillStyle = "rgba(255,255,255,.15)";
  for (const [x, y, r] of [
    [1420, -70, 580],
    [-80, 980, 420],
    [600, 1100, 420],
  ]) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = "rgba(255,255,255,.4)";
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(28, 28, 1444, 944, 50);
  c.stroke();
  c.drawImage(logo, 55, 48, 185, 185);
  c.fillStyle = "#66351e";
  c.font = '600 64px "Mitr", sans-serif';
  c.fillText("JiwPay", 255, 142);
  c.font = '400 27px "Prompt", sans-serif';
  c.fillText("จิ๋วเปย์ · กระเป๋าความสุข", 258, 191);
  c.fillStyle = "#fff5dd";
  c.font = "italic bold 65px sans-serif";
  c.textAlign = "right";
  c.fillText(user.hasCreditCard ? "VISA" : "JIWPAY", 1425, 140);
  c.textAlign = "left";
  // Decorative chip and contactless arcs, kept well away from the QR quiet zone.
  const gold = c.createLinearGradient(95, 295, 260, 410);
  gold.addColorStop(0, "#fff4ba");
  gold.addColorStop(1, "#c69943");
  c.fillStyle = gold;
  c.beginPath();
  c.roundRect(95, 295, 165, 115, 20);
  c.fill();
  c.strokeStyle = "#b98b3a";
  c.lineWidth = 3;
  c.stroke();
  for (const y of [333, 372]) {
    c.beginPath();
    c.moveTo(95, y);
    c.lineTo(260, y);
    c.stroke();
  }
  for (const x of [150, 205]) {
    c.beginPath();
    c.moveTo(x, 295);
    c.lineTo(x, 410);
    c.stroke();
  }
  c.strokeStyle = "rgba(255,255,255,.85)";
  c.lineWidth = 8;
  for (const r of [28, 48, 68]) {
    c.beginPath();
    c.arc(304, 352, r, -0.85, 0.85);
    c.stroke();
  }
  c.fillStyle = "#723a28";
  c.font = '400 25px "Prompt", sans-serif';
  c.fillText("เลขบัญชี / ACCOUNT", 95, 490);
  c.fillStyle = "#fff";
  c.font = '600 70px "Mitr", sans-serif';
  c.fillText(fmtAccount(user.account), 95, 580);
  c.fillStyle = "#723a28";
  c.font = '400 25px "Prompt", sans-serif';
  c.fillText("เจ้าของบัตร", 95, 675);
  let size = 48;
  c.fillStyle = "#fff";
  c.font = `500 ${size}px "Prompt", sans-serif`;
  while (c.measureText(String(user.name)).width > 650 && size > 20) {
    size--;
    c.font = `500 ${size}px "Prompt", sans-serif`;
  }
  c.fillText(String(user.name), 95, 747, 650);
  c.fillStyle = "#fff";
  c.beginPath();
  c.roundRect(835, 275, 580, 580, 30);
  c.fill();
  c.imageSmoothingEnabled = false;
  c.drawImage(qr, 855, 295, 540, 540);
  c.imageSmoothingEnabled = true;
  c.fillStyle = "#713927";
  c.font = '400 25px "Prompt", sans-serif';
  c.textAlign = "center";
  c.fillText("สแกนบัตรเพื่อรับชำระ", 1125, 901);
  c.textAlign = "left";
  c.fillStyle = "#723a28";
  c.font = '400 24px "Prompt", sans-serif';
  c.fillText(`บัตรภายในเกม · รุ่น ${version}`, 95, 907);
  return canvas.toDataURL("image/png");
}
export { createCardImage };

function LogoMark({
  className = "inline-block w-8 h-8 object-contain align-middle shrink-0",
}) {
  return (
    <img
      src="./jiwpay-logo-transparent.png"
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}

function nightShare(state) {
  const value = Number(state.nightPercent);
  return [5, 10, 20, 25, 30, 50].includes(value) ? value / 100 : 0.5;
}
function clockPhase(total, state) {
  const day = Math.floor(total / 1440),
    m = total - day * 1440,
    n = nightShare(state);
  return (
    day +
    (m < 360
      ? ((m / 360) * n) / 2
      : m < 1080
        ? n / 2 + ((m - 360) / 720) * (1 - n)
        : 1 - n / 2 + (((m - 1080) / 360) * n) / 2)
  );
}
function phaseMinutes(phase, state) {
  const day = Math.floor(phase),
    f = phase - day,
    n = nightShare(state);
  const minutes =
    day * 1440 +
    (f < n / 2
      ? (f / (n / 2)) * 360
      : f < 1 - n / 2
        ? 360 + ((f - n / 2) / (1 - n)) * 720
        : 1080 + ((f - (1 - n / 2)) / (n / 2)) * 360);
  return Math.round(minutes * 1e8) / 1e8;
}

function GameClock({ state, large = false }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!state) return <span>กำลังซิงค์เวลา...</span>;
  const enabled =
    state.clockEnabled === true || String(state.clockEnabled) === "true";
  const paused =
    state.gamePaused === true || String(state.gamePaused) === "true";
  const speed = number(state.realMinutesPerDay) || 30;
  const serverNow =
    number(state.serverNowMs) +
    Math.max(0, now - number(state.clockReceivedAt || now));
  const anchored = enabled && number(state.anchorRealMs) > 0;
  let total = anchored
    ? phaseMinutes(
        clockPhase(number(state.anchorGameMinutes), state) +
          (paused
            ? 0
            : Math.max(0, serverNow - number(state.anchorRealMs)) /
              (speed * 60000)),
        state,
      )
    : (state.day - 1) * 1440 + state.hour * 60 + state.minute;
  if (state.syncPending)
    total = (state.day - 1) * 1440 + state.hour * 60 + state.minute;
  const day = Math.floor(total / 1440) + 1,
    minute = Math.floor(total % 1440);
  const secondsLeft = Math.ceil(
    (Math.floor(total / 1440) + 1 - clockPhase(total, state)) * speed * 60,
  );
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return (
    <span className={large ? "block" : "inline-block"}>
      <span className={large ? "block text-3xl font-bold text-stone-800" : ""}>
        {large ? `${time} น.` : `วันที่ ${day} · ${time} น.`}
      </span>
      {large && (
        <span className="block text-sm font-semibold text-orange-600 mt-1">
          วันที่ {day}
        </span>
      )}
      <span
        className={
          large ? "block text-xs text-stone-500 mt-3" : "block text-[10px] mt-1"
        }
      >
        {state.syncPending
          ? "กำลังปิดบัญชีวันในเกม..."
          : !enabled
            ? "รอผู้ดูแลเริ่มนาฬิกาเกม"
            : paused
              ? "หยุดเวลาเกมชั่วคราว"
              : `ขึ้นวันใหม่ใน ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} นาทีจริง · ${speed} นาที = 1 วัน`}
      </span>
    </span>
  );
}

export { GameClock };

export { clockPhase, phaseMinutes };

function formatDuration(seconds) {
  const n = Math.round(seconds);
  return `${Math.floor(n / 60)} นาที ${n % 60} วินาทีจริง`;
}

function DebtPanel({ users, onSubmit }) {
  const [selected, setSelected] = useState(null),
    [error, setError] = useState("");
  const rows = users
    .map((u) => {
      const negative = Math.max(0, -Number(u.balance || 0));
      const loan = u.loan
        ? Math.max(0, Number(u.loan.days) - Number(u.loan.daysPaid || 0)) *
            Number(u.loan.dailyInstallment || 0) +
          Number(u.loan.overdueAmount || 0)
        : 0;
      const credit = (u.creditSchedules || []).reduce(
        (sum, sc) =>
          sum +
          (sc.daysPaid < sc.days
            ? (sc.days - sc.daysPaid) * sc.dailyAmount +
              Number(sc.overdueAmount || 0)
            : 0),
        0,
      );
      const fees = (u.creditSchedules || []).reduce(
        (sum, sc) => sum + Number(sc.overdueAmount || 0),
        0,
      );
      return { ...u, debts: { negative, loan, credit }, fees };
    })
    .filter(
      (u) =>
        u.accountPaused || u.debts.negative || u.debts.loan || u.debts.credit,
    );
  const choose = (u, action) => {
    setError("");
    setSelected({
      account: u.account,
      name: u.name,
      action,
      amount: u.debts[action] || 0,
      requestId:
        globalThis.crypto?.randomUUID?.() ||
        String(Date.now()) + "-" + Math.random().toString(36).slice(2),
    });
  };
  return (
    <div className="space-y-4">
      <h2 className="jp-heading text-xl">ยอดค้าง / พักบัญชี</h2>
      <p className="text-xs text-stone-500">
        ยอดปิดหนี้แยกจากงวดค้าง ยอดที่หักจนติดลบแล้วไม่รวมซ้ำในเงินกู้
        การพักบัญชีหยุดการจ่ายออก แต่ยังรับเงินและคิดรอบรายวันตามกติกาเดิม
      </p>
      {!rows.length && <p>ไม่มีหนี้หรือบัญชีที่พักอยู่</p>}
      {rows.map((u) => (
        <div key={u.account} className="jp-card p-4 space-y-2">
          <h3 className="font-bold">
            {u.name} · {u.account}
          </h3>
          <p className="text-sm">
            {u.accountPaused || u.debts.negative
              ? "⏸ พักการจ่ายออก"
              : "เปิดใช้งาน"}
          </p>
          <p className="text-sm">
            ยอดติดลบ: ฿{u.debts.negative.toLocaleString()}
          </p>
          <p className="text-sm">
            เงินกู้คงเหลือทั้งหมด: ฿{u.debts.loan.toLocaleString()}
            {u.loan?.status === "missed"
              ? " · ค้างงวด ฿" +
                u.loan.dailyInstallment +
                " ตั้งแต่วันที่ " +
                u.loan.missedSinceDay
              : ""}
          </p>
          <p className="text-sm">
            บัตรคงเหลือทั้งหมด: ฿{u.debts.credit.toLocaleString()} ·
            รวมค่าปรับค้าง ฿{u.fees.toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ["negative", "รับเงินสดชำระยอดติดลบ"],
              ["loan", "รับเงินสดปิดเงินกู้"],
              ["credit", "รับเงินสดปิดบัตร"],
            ].map(
              ([key, label]) =>
                u.debts[key] > 0 && (
                  <ActionButton
                    key={key}
                    className="jp-secondary text-xs"
                    onClick={() => choose(u, key)}
                  >
                    {label}
                  </ActionButton>
                ),
            )}
            <ActionButton
              className="jp-secondary text-xs"
              onClick={() =>
                choose(
                  u,
                  u.accountPaused || u.debts.negative ? "resume" : "pause",
                )
              }
            >
              {u.accountPaused || u.debts.negative ? "ปลดพักบัญชี" : "พักบัญชี"}
            </ActionButton>
          </div>
        </div>
      ))}
      {selected && (
        <div
          role="dialog"
          aria-label="ยืนยันจัดการยอดค้าง"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-5"
        >
          <div className="jp-card p-5 max-w-sm w-full space-y-4">
            <h3 className="font-bold">{selected.name}</h3>
            <p>
              {selected.amount
                ? "ยืนยันว่าได้รับเงินสดแล้ว ฿" +
                  selected.amount.toLocaleString()
                : selected.action === "pause"
                  ? "พักการจ่ายออกของบัญชีนี้"
                  : "ปลดพักบัญชีนี้หลังจัดการยอดค้าง"}
            </p>
            <p className="text-xs">
              การรับเงินสดตัดหนี้ประเภทที่เลือกโดยตรง ไม่เพิ่มยอดกระเป๋า
              และไม่ปลดพักอัตโนมัติ
            </p>
            {error && (
              <p role="alert" className="text-red-600">
                {error}
              </p>
            )}
            <ActionButton
              className="jp-primary w-full"
              onClick={async () => {
                const r = await onSubmit(selected);
                if (r.ok) setSelected(null);
                else setError(r.error || "บันทึกไม่ได้");
              }}
            >
              ยืนยันบันทึก
            </ActionButton>
            <ActionButton
              className="jp-secondary w-full"
              onClick={() => setSelected(null)}
            >
              ยกเลิก
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}

function buildNfcUrl(base, account, version) {
  const url = new URL(base);
  if (
    url.protocol !== "https:" ||
    !/^\d{6}$/.test(String(account)) ||
    !Number.isSafeInteger(Number(version)) ||
    Number(version) < 1 ||
    Number(version) > 999999999
  )
    throw Error("ข้อมูลลิงก์บัตรไม่ถูกต้อง");
  url.pathname = url.pathname.replace(/\/admin\/?$/, "/");
  url.search = "";
  url.hash = "tap=" + account + "." + version;
  return url.href;
}
export { buildNfcUrl };
