import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Wifi,
  Sparkles,
  Wallet,
  Home,
  Send,
  ScanLine,
  History,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  Lock,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Plus,
  TrendingUp,
  RefreshCw,
  Star,
  AlertTriangle,
  LogOut,
  Banknote,
  CreditCard,
  Loader2,
  Camera,
  Megaphone,
  Store,
  QrCode,
  Users,
} from "lucide-react";
// Decode only when a scanner is opened; the wallet does not download jsQR.
let qrDecoderPromise;
const loadQrDecoder = () =>
  (qrDecoderPromise ||= import("jsqr")
    .then((module) => module.default)
    .catch((error) => {
      qrDecoderPromise = null;
      throw error;
    }));
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
  for (const key of ["negative", "qrEnabled", "hasCreditCard"])
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
@keyframes jp-fall { to { transform:translateY(680px) rotate(540deg); opacity:0; } }
@keyframes jp-pop { from { transform:scale(.65); opacity:0; } 70% { transform:scale(1.06); } to { transform:scale(1); opacity:1; } }
@keyframes jp-marquee { from { transform:translateX(0); } to { transform:translateX(-50%); } }
.jp-marquee-track { display:inline-flex; white-space:nowrap; animation:jp-marquee 18s linear infinite; }
.jp-scroll::-webkit-scrollbar { display:none; }
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

const SESSION_KEY = "jiwpay_logged_account";
const LOAN_PLANS = [
  { days: 3, rate: 0.1 },
  { days: 5, rate: 0.2 },
];
function creditTodayDue(user) {
  return (user.creditSchedules || []).reduce(
    (sum, s) =>
      s.daysPaid < s.days
        ? sum + number(s.dailyAmount) + number(s.overdueAmount)
        : sum,
    0,
  );
}
function creditTotalOutstanding(user) {
  return (user.creditSchedules || []).reduce(
    (sum, s) =>
      s.daysPaid < s.days
        ? sum +
          (number(s.days) - number(s.daysPaid)) * number(s.dailyAmount) +
          number(s.overdueAmount)
        : sum,
    0,
  );
}
export default function App() {
  const [account, setAccount] = useState(() => storageGet(SESSION_KEY) || "");
  useEffect(() => {
    const syncSession = (event) => {
      if (event.key === SESSION_KEY) setAccount(event.newValue || "");
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, []);
  // Remount account-bound state so responses/caches cannot cross user sessions.
  return (
    <ClientSession
      key={account || "guest"}
      account={account}
      onAccount={setAccount}
    />
  );
}
function ClientSession({ account, onAccount }) {
  const cacheKey = `jiwpay_client_v4:${account || "guest"}`;
  const { data, ref, put, generation, writing, alive } = useSnapshot(
    cacheKey,
    () => {
      const cached = loadCache(cacheKey, {}) || {};
      const legacy = normalizeUser(loadCache("jiwpay_cache_user", null));
      const user =
        normalizeUser(cached.currentUser) ||
        (account && legacy?.account === account ? legacy : null);
      return {
        currentUser: user?.account === account ? user : null,
        transactions: Array.isArray(cached.transactions)
          ? cached.transactions
          : [],
        topups: Array.isArray(cached.topups) ? cached.topups : [],
        loanRequests: Array.isArray(cached.loanRequests)
          ? cached.loanRequests
          : [],
        badges: Array.isArray(cached.badges) ? cached.badges : [],
        gameTime: normalizeGame(cached.gameTime),
        announcement: cached.announcement || "",
      };
    },
  );
  const {
    currentUser,
    transactions,
    topups,
    loanRequests,
    badges,
    gameTime,
    announcement,
  } = data;
  const [screen, setScreen] = useState(account ? "unlocked" : "login");
  const [loadingApp, setLoadingApp] = useState(false);
  const [globalRefreshing, setGlobalRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [syncError, setSyncError] = useState("");
  const [toast, setToast] = useState(null);
  const refreshLock = useRef(null);
  const loginLock = useRef(false);
  const noticeTimer = useRef();
  const directory = useRef(new Map());
  const notify = useCallback((payload) => {
    setToast(payload);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => {
      setToast(null);
    }, 4200);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  const lookupAccount = useCallback(async (value, fresh = false) => {
    const accountNumber = String(value);
    if (!/^\d{6}$/.test(accountNumber)) return null;
    const hit = directory.current.get(accountNumber);
    if (!fresh && hit && Date.now() - hit.at < 15000) return hit.user;
    const result = await apiGet({ lookupAccount: accountNumber }, fresh);
    if (!result.ok || !result.user?.account) return null;
    const found = {
      ...result.user,
      account: String(result.user.account),
      hasCreditCard:
        result.user.hasCreditCard === true ||
        String(result.user.hasCreditCard).toLowerCase() === "true",
    };
    directory.current.set(accountNumber, { at: Date.now(), user: found });
    return found;
  }, []);
  const refresh = useCallback(
    (fresh = false) => {
      if (writing.current) return Promise.resolve(false);
      if (refreshLock.current && !fresh) return refreshLock.current;
      const version = ++generation.current;
      const task = (async () => {
        const cachedId = ref.current.currentUser?.id;
        const requests =
          cachedId != null
            ? Promise.all([
                apiGet({ sheet: "Topups", userId: cachedId }, fresh),
                apiGet({ sheet: "LoanRequests", userId: cachedId }, fresh),
              ])
            : null;
        const [me, tx, badgeResult, gameResult] = await Promise.all([
          account
            ? apiGet({ sheet: "Users", userId: account }, fresh)
            : Promise.resolve({ ok: true, rows: [] }),
          account
            ? apiGet({ sheet: "Transactions", userId: account }, fresh)
            : Promise.resolve({ ok: true, rows: [] }),
          apiGet({ sheet: "Badges" }, fresh),
          apiGet({ sheet: "GameState" }, fresh),
        ]);
        const user = me.ok
          ? normalizeUser(me.rows?.[0])
          : ref.current.currentUser;
        // GAS stores request.userId as Users.id, whereas Transactions use account.
        const [topupResult, loanResult] =
          account && user
            ? await (requests ||
                Promise.all([
                  apiGet({ sheet: "Topups", userId: user.id }, fresh),
                  apiGet({ sheet: "LoanRequests", userId: user.id }, fresh),
                ]))
            : [
                { ok: !account, rows: [] },
                { ok: !account, rows: [] },
              ];
        if (!alive.current || generation.current !== version || writing.current)
          return false;
        const results = [
          me,
          tx,
          badgeResult,
          gameResult,
          topupResult,
          loanResult,
        ];
        const failure = results.find((result) => !result.ok);
        const nextGame = gameResult.ok
          ? normalizeGame(gameResult.rows?.[0])
          : ref.current.gameTime;
        put(
          (old) => ({
            ...old,
            currentUser: me.ok ? user : old.currentUser,
            transactions:
              tx.ok && Array.isArray(tx.rows)
                ? sortTransactions(tx.rows)
                : old.transactions,
            topups: topupResult.ok ? topupResult.rows : old.topups,
            loanRequests: loanResult.ok ? loanResult.rows : old.loanRequests,
            badges:
              badgeResult.ok && Array.isArray(badgeResult.rows)
                ? badgeResult.rows
                : old.badges,
            gameTime: nextGame,
            announcement: gameResult.ok
              ? nextGame?.announcement || ""
              : old.announcement,
          }),
          true,
        );
        setSyncError(
          failure?.error ||
            (account && !user
              ? "ไม่พบบัญชี กรุณาติดต่อแอดมินหรือเปลี่ยนบัญชี"
              : !nextGame
                ? "ยังไม่มีเวลาเกม ให้แอดมินตั้งค่าเวลาเริ่มต้น"
                : ""),
        );
        return !failure;
      })().finally(() => {
        if (refreshLock.current === task) refreshLock.current = null;
      });
      refreshLock.current = task;
      return task;
    },
    [account, alive, generation, put, ref, writing],
  );
  useEffect(() => {
    refresh();
    const sync = () => {
      if (!document.hidden) refresh();
    };
    const interval = setInterval(sync, 60000);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => {
      refreshLock.current = null;
      clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, [refresh]);
  const doGlobalRefresh = async () => {
    if (writing.current || globalRefreshing) return;
    setGlobalRefreshing(true);
    try {
      if (await refresh(true)) notify({ title: "รีเฟรชข้อมูลแล้ว" });
    } finally {
      if (alive.current) setGlobalRefreshing(false);
    }
  };
  const doLogin = async (loginAccount, password) => {
    if (loginLock.current) return { ok: false, error: "กำลังเข้าสู่ระบบ" };
    loginLock.current = true;
    setLoadingApp(true);
    try {
      const result = await apiPost({
        type: "login",
        account: loginAccount,
        password,
      });
      if (!result.ok) return result;
      const user = normalizeUser(result.user);
      if (!user) return { ok: false, error: "ข้อมูลบัญชีไม่ถูกต้อง" };
      saveCache(`jiwpay_client_v4:${user.account}`, {
        ...ref.current,
        currentUser: user,
        transactions: [],
        topups: [],
        loanRequests: [],
      });
      storageSet(SESSION_KEY, user.account);
      onAccount(user.account);
      return { ok: true };
    } finally {
      loginLock.current = false;
      if (alive.current) setLoadingApp(false);
    }
  };
  const doLogout = () => {
    if (writing.current) return;
    generation.current++;
    storageRemove(SESSION_KEY);
    storageRemove(cacheKey);
    [
      "jiwpay_cache_user",
      "jiwpay_cache_tx",
      "jiwpay_cache_topups",
      "jiwpay_cache_loans",
    ].forEach(storageRemove);
    onAccount("");
    setScreen("login");
  };
  const mutate = async (label, body, optimistic) => {
    if (writing.current)
      return { ok: false, error: "กำลังบันทึกรายการก่อนหน้า" };
    if (!ref.current.currentUser)
      return { ok: false, error: "กรุณารอข้อมูลบัญชี" };
    writing.current = true;
    generation.current++;
    setPendingAction(label);
    const before = ref.current;
    try {
      if (optimistic) put(optimistic(before));
      const result = await apiPost(body);
      if (!alive.current) return result;
      if (!result.ok) {
        put(before);
        notify({
          kind: "error",
          title: result.uncertain
            ? "ยังยืนยันรายการไม่ได้"
            : "ทำรายการไม่สำเร็จ",
          detail: result.error,
        });
        if (result.uncertain) setSyncError(result.error);
        return result;
      }
      put(
        (state) => ({
          ...state,
          currentUser:
            result.user && String(result.user.account) === account
              ? normalizeUser(result.user)
              : state.currentUser,
          transactions: result.transaction
            ? [
                result.transaction,
                ...state.transactions.filter(
                  (tx) => tx.id !== result.transaction.id,
                ),
              ]
            : state.transactions,
        }),
        true,
      );
      notify({ title: `${label}`, detail: "บันทึกแล้ว" });
      return result;
    } catch {
      if (alive.current) {
        put(before);
        notify({ kind: "error", title: "ทำรายการไม่สำเร็จ" });
      }
      return { ok: false, error: "ทำรายการไม่สำเร็จ" };
    } finally {
      writing.current = false;
      if (alive.current) {
        setPendingAction("");
        refresh(true);
      }
    }
  };
  const invalid = () =>
    Promise.resolve({
      ok: false,
      error: "จำนวนเงินไม่ถูกต้อง หรือยอดเงินไม่พอ",
    });
  const handleTransfer = ({ recipientAccount, amount, memo }) => {
    const user = ref.current.currentUser,
      amt = Number(amount);
    if (
      !user ||
      !validAmount(amt) ||
      amt > user.balance ||
      String(recipientAccount) === account ||
      !/^\d{6}$/.test(String(recipientAccount))
    )
      return invalid();
    return mutate(
      "โอนเงินสำเร็จ",
      {
        type: "transfer",
        fromAccount: account,
        toAccount: recipientAccount,
        amount: amt,
        memo,
      },
      (state) => ({
        ...state,
        currentUser: { ...user, balance: user.balance - amt },
      }),
    );
  };
  const charge = (customerAccount, amount, days, planLabel, cardQrVersion) => {
    const amt = Number(amount);
    if (!validAmount(amt) || String(customerAccount) === account)
      return invalid();
    return mutate(
      "รับเงินสำเร็จ",
      days
        ? {
            type: "credit_purchase",
            buyerAccount: customerAccount,
            merchantAccount: account,
            amount: amt,
            days,
            planLabel,
            cardQrVersion,
          }
        : {
            type: "transfer",
            fromAccount: customerAccount,
            toAccount: account,
            amount: amt,
            memo: "ชำระเงินหน้าร้าน (POS)",
            cardQrVersion,
          },
      (state) => ({
        ...state,
        currentUser: {
          ...state.currentUser,
          balance: state.currentUser.balance + amt,
        },
      }),
    );
  };
  const handlePosCashCharge = (customer, amount, version) =>
    charge(customer, amount, undefined, undefined, version);
  const handlePosCreditCharge = (customer, amount, days, label, version) =>
    charge(customer, amount, days, label, version);
  const piggyAction = (amount, withdraw) => {
    const user = ref.current.currentUser,
      amt = Number(amount);
    if (
      !user ||
      !validAmount(amt) ||
      amt > (withdraw ? user.piggy : user.balance) ||
      (withdraw && user.negative)
    )
      return invalid();
    let loan = user.loan,
      piggyAdd = amt;
    if (!withdraw && loan?.status === "missed") {
      const due = number(loan.dailyInstallment) + number(loan.overdueAmount);
      const paid = Math.min(amt, due);
      piggyAdd -= paid;
      if (paid >= due) {
        loan = {
          ...loan,
          daysPaid: number(loan.daysPaid) + 1,
          status: "active",
          missedSinceDay: null,
        };
        if (loan.daysPaid >= loan.days) loan = null;
      }
    }
    return mutate(
      withdraw ? "ถอนจากกระปุกสำเร็จ" : "ฝากเข้ากระปุกสำเร็จ",
      {
        type: withdraw ? "piggy_withdraw" : "piggy_deposit",
        account,
        amount: amt,
      },
      (state) => ({
        ...state,
        currentUser: {
          ...user,
          balance: user.balance + (withdraw ? amt : -amt),
          piggy: user.piggy + (withdraw ? -amt : piggyAdd),
          loan,
        },
      }),
    );
  };
  const piggyDeposit = (amount) => piggyAction(amount, false);
  const piggyWithdraw = (amount) => piggyAction(amount, true);
  const payCreditBill = (mode) => {
    const user = ref.current.currentUser;
    const due =
      mode === "full" ? creditTotalOutstanding(user) : creditTodayDue(user);
    if (!validAmount(due) || due > user.balance) return invalid();
    const schedules = user.creditSchedules.filter((s) => s.daysPaid < s.days);
    const credit =
      mode === "full"
        ? user.creditLimit
        : user.availableCredit +
          schedules.reduce((sum, s) => sum + number(s.dailyAmount), 0);
    return mutate(
      "ชำระบิลสำเร็จ",
      { type: "credit_bill_payment", account, mode },
      (state) => ({
        ...state,
        currentUser: {
          ...user,
          balance: user.balance - due,
          availableCredit: credit,
          creditSchedules:
            mode === "full"
              ? []
              : schedules
                  .map((s) => ({
                    ...s,
                    daysPaid: number(s.daysPaid) + 1,
                    overdueAmount: 0,
                    lastPaymentDay: gameTime?.day,
                  }))
                  .filter((s) => s.daysPaid < s.days),
        },
      }),
    );
  };
  const toggleFavoriteAccount = (favorite) => {
    const user = ref.current.currentUser,
      list = user.favoriteAccounts;
    const next = list.includes(favorite)
      ? list.filter((item) => item !== favorite)
      : [...list, favorite];
    return mutate(
      "บันทึกรายการโปรดแล้ว",
      {
        type: "user_self_update",
        user: { id: user.id, favoriteAccounts: next },
      },
      (state) => ({
        ...state,
        currentUser: { ...user, favoriteAccounts: next },
      }),
    );
  };
  const submitRequest = ({ amount, reason, plan }) => {
    const user = ref.current.currentUser;
    if (!validAmount(amount)) return invalid();
    if (
      plan &&
      (user.loan ||
        ref.current.loanRequests.some((row) => row.status === "pending"))
    )
      return Promise.resolve({
        ok: false,
        error: "มีเงินกู้หรือคำขอรออนุมัติอยู่แล้ว",
      });
    const row = {
      id: newId(),
      userId: user.id,
      amount: Number(amount),
      reason: reason || "",
      ...(plan ? { days: plan.days, rate: plan.rate } : {}),
      day: gameTime?.day || 1,
      status: "pending",
    };
    const key = plan ? "loanRequests" : "topups";
    return mutate(
      plan ? "ส่งคำขอกู้เงินแล้ว" : "ส่งคำขอเติมเงินแล้ว",
      { type: plan ? "loan_request" : "topup_request", ...row },
      (state) => ({ ...state, [key]: [row, ...state[key]] }),
    );
  };
  const submitTopup = (form) => submitRequest(form);
  const submitLoanRequest = (form) => submitRequest(form);
  const doSetPin = async (pin) => {
    const result = await mutate(
      "ตั้ง PIN แล้ว",
      { type: "user_self_update", user: { id: currentUser.id, pin } },
      (state) => ({ ...state, currentUser: { ...state.currentUser, pin } }),
    );
    if (result.ok) setScreen("unlocked");
    return result;
  };
  const doUnlock = (pin) => {
    if (String(currentUser?.pin) !== String(pin))
      return { error: "รหัส PIN ไม่ถูกต้อง" };
    setScreen("unlocked");
    refresh(true);
    return { ok: true };
  };
  const doLock = () => {
    if (!writing.current) setScreen(currentUser?.pin ? "lock" : "setpin");
  };
  return (
    <div className="jp">
      <style>{DESIGN}</style>
      {account ? (
        <>
          <div className="max-w-md mx-auto px-5 pt-6 pb-3 flex items-center justify-between">
            <Brand />
            <div className="flex gap-2">
              <IconButton
                label="รีเฟรชข้อมูล"
                disabled={globalRefreshing || !!pendingAction}
                onClick={doGlobalRefresh}
              >
                <RefreshCw
                  size={17}
                  className={globalRefreshing ? "animate-spin" : ""}
                />
              </IconButton>
              <IconButton
                label="ออกจากระบบ"
                disabled={!!pendingAction}
                onClick={doLogout}
              >
                <LogOut size={17} />
              </IconButton>
            </div>
          </div>
          <div className="max-w-md mx-auto px-5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#9b8274] mb-3">
              <span
                className={`h-1.5 w-1.5 rounded-full ${gameTime ? "bg-[#729660]" : "bg-[#d4a66a]"}`}
              />
              {fmtGameTime(gameTime)}
            </div>
            <Notice>{syncError}</Notice>
          </div>
          {currentUser ? (
            <WalletApp
              user={currentUser}
              data={data}
              busy={!!pendingAction}
              screen={screen}
              onLock={doLock}
              onUnlock={doUnlock}
              onSetPin={doSetPin}
              lookup={lookupAccount}
              onTransfer={handleTransfer}
              onCash={handlePosCashCharge}
              onCredit={handlePosCreditCharge}
              onTopup={submitTopup}
              onLoan={submitLoanRequest}
              onDeposit={piggyDeposit}
              onWithdraw={piggyWithdraw}
              onBill={payCreditBill}
              onFavorite={toggleFavoriteAccount}
            />
          ) : (
            <WalletSkeleton />
          )}
        </>
      ) : (
        <Login onLogin={doLogin} loading={loadingApp} />
      )}
      <PendingBanner active={pendingAction} />
      <Toast toast={toast} />
    </div>
  );
}
function Login({ onLogin, loading }) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const guard = useRef(false);
  const submit = async () => {
    if (guard.current) return;
    guard.current = true;
    setError("");
    try {
      const result = await onLogin(account, password);
      if (!result.ok) setError(result.error);
    } finally {
      guard.current = false;
    }
  };
  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col justify-center px-6 pb-24">
      <div className="flex justify-center mb-6">
        <Brand />
      </div>
      <div className="bg-white rounded-3xl border-2 border-orange-100 p-6 shadow-sm">
        <h1 className="jp-heading text-xl text-stone-800">เข้าสู่ระบบ</h1>
        <p className="text-xs text-stone-400 mt-2 mb-5">
          กรอกเลขบัญชีและรหัสผ่านที่แอดมินให้ไว้ <LogoMark />
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <Field
            label="เลขบัญชี 6 หลัก"
            value={account}
            onChange={(event) =>
              setAccount(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="username"
            placeholder="เช่น 482913"
          />
          <Field
            label="รหัสผ่าน"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="รหัสผ่าน"
          />
          <Notice>{error}</Notice>
          <ActionButton
            type="submit"
            disabled={loading || account.length !== 6 || !password}
            className="jp-primary"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            เข้าสู่ระบบ
          </ActionButton>
        </form>
        <p className="text-center text-[11px] text-orange-400 mt-5">
          ✨ เครื่องนี้จะจำบัญชีให้ ไม่ต้องเข้าสู่ระบบซ้ำ
        </p>
      </div>
    </main>
  );
}
function WalletSkeleton() {
  return (
    <div aria-label="กำลังโหลดบัญชี" className="max-w-md mx-auto p-5 space-y-5">
      <div className="jp-shimmer h-8 w-1/2" />
      <div className="jp-shimmer h-52 !rounded-3xl" />
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="jp-shimmer h-16" />
        ))}
      </div>
      <div className="jp-shimmer h-40" />
    </div>
  );
}
function WalletApp({
  user,
  data,
  busy,
  screen,
  onLock,
  onUnlock,
  onSetPin,
  lookup,
  onTransfer,
  onCash,
  onCredit,
  onTopup,
  onLoan,
  onDeposit,
  onWithdraw,
  onBill,
  onFavorite,
}) {
  const [page, setPage] = useState("home");
  const [scannedRecipient, setScannedRecipient] = useState(null);
  const [modal, setModal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [celebrating, setCelebrating] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const celebrate =
    (action) =>
    async (...args) => {
      const result = await action(...args);
      if (result?.ok) {
        setCelebrating(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCelebrating(false), 2400);
      }
      return result;
    };
  if (screen === "lock" || screen === "setpin")
    return (
      <PinScreen
        setup={screen === "setpin"}
        onSubmit={screen === "setpin" ? onSetPin : onUnlock}
        busy={busy}
      />
    );
  const titles = {
    transfer: "โอนเงิน",
    scanpay: "สแกน QR เพื่อจ่ายเงิน",
    scan: "สแกน",
    pos: "เครื่องรับเงิน JiwPay",
    loan: "เงินกู้",
    topup: "เติมเงิน",
    history: "ประวัติรายการ",
  };
  const todaySales = data.transactions
    .filter(
      (t) =>
        number(t.day) === data.gameTime?.day &&
        String(t.toId) === user.account &&
        ["TRANSFER", "CREDIT_PURCHASE"].includes(t.type),
    )
    .reduce((sum, t) => sum + number(t.amount), 0);
  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 relative">
      <Confetti show={celebrating} />
      {data.announcement && (
        <div className="mx-5 my-3 rounded-xl bg-stone-800 text-white overflow-hidden py-2">
          <div className="jp-marquee-track text-xs">
            <span className="px-6">📢 {data.announcement}</span>
            <span className="px-6">📢 {data.announcement}</span>
          </div>
        </div>
      )}
      <fieldset disabled={busy} className="border-0 p-0 m-0 min-w-0">
        {page !== "home" && page !== "receipt" && (
          <div className="px-5 flex items-center gap-3 my-4">
            <IconButton label="กลับหน้าหลัก" onClick={() => setPage("home")}>
              <ChevronLeft size={18} />
            </IconButton>
            <h1 className="jp-heading text-lg">{titles[page]}</h1>
          </div>
        )}
        <div className="jp-enter" key={page}>
          {page === "home" && (
            <HomeView
              user={user}
              badges={data.badges}
              myTx={data.transactions.slice(0, 3)}
              todaySales={todaySales}
              onGoTransfer={() => {
                setScannedRecipient(null);
                setPage("transfer");
              }}
              onGoScanHub={() => setPage("scan")}
              onGoTopup={() => setPage("topup")}
              onGoLoan={() => setPage("loan")}
              onGoHistory={() => setPage("history")}
              onOpenPiggy={() => setModal("savings")}
              onOpenPayBill={() => setModal("credit")}
              onReceive={() => setModal("receive")}
              onCard={() => setModal("card")}
              onLock={onLock}
            />
          )}
          {page === "scan" && (
            <ScanHub
              user={user}
              lookup={lookup}
              onCash={celebrate(onCash)}
              onCredit={celebrate(onCredit)}
              onChoose={(recipient) => {
                setScannedRecipient(recipient);
                setPage("transfer");
              }}
            />
          )}
          {page === "transfer" && (
            <div className="px-5">
              <TransferForm
                initialRecipient={scannedRecipient}
                user={user}
                lookup={lookup}
                onFavorite={onFavorite}
                onSubmit={async (form) => {
                  const result = await celebrate(onTransfer)(form);
                  if (result.ok) {
                    setReceipt({
                      ...result.transaction,
                      recipientName: form.recipientName,
                      recipientAvatar: form.recipientAvatar,
                    });
                    setPage("receipt");
                  }
                  return result;
                }}
              />
            </div>
          )}
          {page === "receipt" && receipt && (
            <ESlipView
              currentUser={user}
              tx={receipt}
              onDone={() => setPage("home")}
            />
          )}
          {page === "pos" && (
            <div className="px-5">
              <PosQrPanel user={user} />
            </div>
          )}
          {page === "loan" && (
            <div className="px-5">
              <RequestForm
                loan
                user={user}
                requests={data.loanRequests}
                onSubmit={celebrate(onLoan)}
              />
            </div>
          )}
          {page === "topup" && (
            <div className="px-5">
              <RequestForm
                requests={data.topups}
                onSubmit={celebrate(onTopup)}
              />
            </div>
          )}
          {page === "history" && (
            <div className="px-5">
              <Activity
                transactions={data.transactions}
                account={user.account}
              />
            </div>
          )}
        </div>
      </fieldset>
      <nav
        aria-label="เมนูหลัก"
        className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t-2 border-orange-100 flex justify-around py-3 z-40"
        style={{ paddingBottom: "max(12px,env(safe-area-inset-bottom))" }}
      >
        {[
          { id: "home", label: "หน้าแรก", icon: Home },
          { id: "transfer", label: "โอนเงิน", icon: Send },
          { id: "scan", label: "สแกน", icon: QrCode },
          { id: "pos", label: "POS", icon: CreditCard },
          { id: "history", label: "ประวัติ", icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <ActionButton
            key={id}
            disabled={busy}
            onClick={() => {
              if (id === "transfer") setScannedRecipient(null);
              setPage(id);
            }}
            aria-current={page === id ? "page" : undefined}
            className="flex flex-col items-center gap-1 px-2"
          >
            <Icon
              size={21}
              className={page === id ? "text-orange-500" : "text-stone-300"}
            />
            <span
              className={`text-[10px] ${page === id ? "text-orange-600 font-bold" : "text-stone-400"}`}
            >
              {label}
            </span>
          </ActionButton>
        ))}
      </nav>
      {modal && (
        <Sheet
          title={
            {
              savings: "กระปุกออมสิน",
              credit: "บัตรเครดิต JiwPay",
              receive: "QR รับโอนของฉัน",
              card: "บัตร / QR ของฉัน",
            }[modal]
          }
          busy={busy}
          onClose={() => setModal(null)}
        >
          <fieldset disabled={busy} className="border-0 p-0 min-w-0">
            {modal === "savings" && (
              <Savings
                user={user}
                onDeposit={celebrate(onDeposit)}
                onWithdraw={celebrate(onWithdraw)}
              />
            )}
            {modal === "credit" && (
              <CreditBill user={user} onPay={celebrate(onBill)} />
            )}
            {modal === "receive" && <ReceiveQR user={user} />}
            {modal === "card" && <VisaCard user={user} />}
          </fieldset>
        </Sheet>
      )}
    </div>
  );
}

function TransactionList({ transactions, account }) {
  return (
    <div className="jp-card overflow-hidden">
      {transactions.length ? (
        transactions.map((tx, index) => {
          const incoming = String(tx.toId) === String(account);
          return (
            <div
              key={tx.id || index}
              className={`flex items-center gap-3 p-4 ${index ? "border-t border-[#fff0df]" : ""}`}
            >
              <span
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${incoming ? "bg-[#ecf2e6] text-[#567845]" : "bg-[#f4ede5] text-[#a17b55]"}`}
              >
                {incoming ? (
                  <ArrowDownLeft size={18} />
                ) : (
                  <ArrowUpRight size={18} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {tx.memo ||
                    {
                      TRANSFER: "โอนเงิน",
                      CREDIT_PURCHASE: "ชำระด้วยเครดิต",
                      TOPUP: "เติมเงิน",
                      LOAN_RECEIVE: "รับเงินกู้",
                      CREDIT_REPAY: "ชำระบัตรเครดิต",
                      RENT: "ค่าเช่าร้าน",
                      INTEREST: "ดอกเบี้ยออมทรัพย์",
                    }[tx.type] ||
                    tx.type}
                </p>
                <p className="text-[11px] text-[#b19887] mt-1">
                  วันที่ {tx.day || "—"} · {tx.time || "JiwPay"}
                </p>
              </div>
              <p
                className={`jp-number text-sm font-medium whitespace-nowrap ${incoming ? "text-[#5a7d48]" : ""}`}
              >
                {incoming ? "+" : "−"}฿{money(tx.amount)}
              </p>
            </div>
          );
        })
      ) : (
        <Empty
          title="ยังไม่มีประวัติรายการ"
          detail="รายการรับเงินและจ่ายเงินจะแสดงในหน้านี้"
        />
      )}
    </div>
  );
}
function Activity({ transactions, account }) {
  const [filter, setFilter] = useState("all");
  const rows = transactions.filter(
    (tx) =>
      filter === "all" ||
      (filter === "in"
        ? String(tx.toId) === account
        : String(tx.fromId) === account),
  );
  return (
    <>
      <div className="flex gap-2 mb-5">
        {[
          ["all", "ทั้งหมด"],
          ["in", "เงินเข้า"],
          ["out", "เงินออก"],
        ].map(([id, label]) => (
          <ActionButton
            key={id}
            onClick={() => setFilter(id)}
            className={`text-xs px-4 py-2.5 rounded-full ${filter === id ? "bg-[#f58b38] text-white" : "bg-white text-[#9b8274] border border-[#ffe0bd]"}`}
          >
            {label}
          </ActionButton>
        ))}
      </div>
      <TransactionList transactions={rows} account={account} />
    </>
  );
}
function AmountInput({ value, onChange, label = "จำนวนเงิน", max }) {
  return (
    <div className="jp-card p-6 text-center">
      <label className="jp-label">
        {label}
        <div className="flex items-center justify-center mt-3">
          <span className="text-2xl text-[#a8b19f] mr-2">฿</span>
          <input
            aria-label={label}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              if (/^\d*(\.\d{0,2})?$/.test(next)) onChange(next);
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="bg-transparent outline-none w-full max-w-[220px] text-center text-4xl jp-number text-[#594034]"
          />
        </div>
      </label>
      {max !== undefined && (
        <p className="text-[11px] text-[#b19887] mt-3">ใช้ได้ ฿{money(max)}</p>
      )}
    </div>
  );
}
function TransferForm({
  user,
  initialRecipient,
  lookup,
  onSubmit,
  onFavorite,
}) {
  const [favoriteDetails, setFavoriteDetails] = useState({});
  const favoriteKey = user.favoriteAccounts.map(String).join(",");
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      favoriteKey
        .split(",")
        .filter(Boolean)
        .map(async (account) => {
          try {
            return [account, await lookup(account)];
          } catch {
            return [account, null];
          }
        }),
    ).then((entries) => {
      if (!cancelled) setFavoriteDetails(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [favoriteKey, lookup]);
  const [account, setAccount] = useState(initialRecipient?.account || ""),
    [recipient, setRecipient] = useState(initialRecipient),
    [amount, setAmount] = useState(initialRecipient?.amount || ""),
    [memo, setMemo] = useState(""),
    [error, setError] = useState(""),
    [searching, setSearching] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setRecipient(null);
    if (account.length !== 6) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await lookup(account);
      if (!cancelled) {
        setRecipient(result);
        setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [account, lookup]);
  const submit = async () => {
    setError("");
    const result = await onSubmit({
      recipientAccount: recipient.account,
      recipientName: recipient.name,
      recipientAvatar: recipient.avatar,
      amount: Number(amount),
      memo,
    });
    if (!result.ok) setError(result.error);
  };
  return (
    <div className="space-y-5">
      <div className="jp-card p-5">
        <Field
          label={
            initialRecipient
              ? "ผู้รับจาก QR (ตรวจสอบก่อนโอน)"
              : "โอนไปยังเลขบัญชี"
          }
          readOnly={!!initialRecipient}
          value={account}
          inputMode="numeric"
          placeholder="เลขบัญชี 6 หลัก"
          onChange={(e) =>
            setAccount(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
        />
        {searching ? (
          <div className="jp-shimmer h-12 mt-4" />
        ) : recipient ? (
          <div className="flex items-center gap-3 mt-4">
            <span className="text-2xl bg-[#eff2e7] p-2 rounded-xl">
              {recipient.avatar || "👤"}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium">{recipient.name}</p>
              <p className="text-[11px] text-[#9b8274]">
                {fmtAccount(recipient.account)}
              </p>
            </div>
            <ActionButton
              aria-pressed={user.favoriteAccounts.includes(recipient.account)}
              disabled={recipient.account === user.account}
              className="flex flex-col items-center gap-1 rounded-xl border-2 border-amber-100 bg-amber-50 p-2 text-xs text-amber-700"
              onClick={() => onFavorite(recipient.account)}
            >
              <Star
                size={17}
                className={
                  user.favoriteAccounts.includes(recipient.account)
                    ? "fill-[#d5b978] text-[#d5b978]"
                    : ""
                }
              />
              {user.favoriteAccounts.includes(recipient.account)
                ? "ติดดาวแล้ว"
                : "เพิ่มรายการโปรด"}
            </ActionButton>
          </div>
        ) : account.length === 6 ? (
          <p className="text-xs text-[#b17050] mt-3">
            ไม่พบบัญชีหรือเชื่อมต่อไม่สำเร็จ
          </p>
        ) : null}
        <section
          aria-label="รายการโปรด"
          className="mt-4 border-t border-orange-100 pt-4"
        >
          <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
            <Star size={15} className="fill-amber-400 text-amber-400" />
            รายการโปรด
          </h2>
          <p className="text-xs text-stone-400 mt-1">
            แตะบัญชีเพื่อโอนครั้งถัดไป ไม่ต้องกรอกเลขใหม่
          </p>
          {user.favoriteAccounts.length === 0 && (
            <p className="text-xs text-stone-400 mt-3">
              ยังไม่มีรายการโปรด ค้นหาหรือสแกนผู้รับแล้วกดเพิ่มรายการโปรดได้เลย
            </p>
          )}
          <div className="flex gap-2 flex-wrap pt-3">
            {user.favoriteAccounts.map((favorite) => (
              <ActionButton
                key={favorite}
                className="text-[11px] bg-[#fff0db] px-3 py-2 rounded-full whitespace-nowrap"
                aria-label={`โอนไปยังรายการโปรด ${fmtAccount(favorite)}`}
                disabled={!!initialRecipient}
                onClick={() => setAccount(String(favorite))}
              >
                <Star size={10} className="inline mr-1" />
                <span className="text-xl block mb-1">
                  {favoriteDetails[favorite]?.avatar || "👤"}
                </span>
                <span className="block font-semibold">
                  {favoriteDetails[favorite]?.name || "บัญชีโปรด"}
                </span>
                <span className="block text-stone-400 mt-1">
                  {fmtAccount(favorite)}
                </span>
              </ActionButton>
            ))}
          </div>
        </section>
      </div>
      <AmountInput value={amount} onChange={setAmount} max={user.balance} />
      <div className="flex justify-center gap-3">
        {[20, 50, 100].map((value) => (
          <ActionButton
            key={value}
            onClick={() => setAmount(String(value))}
            className={`rounded-full border-2 px-5 py-2 text-sm ${amount === String(value) ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-100 text-orange-600"}`}
          >
            {value}฿
          </ActionButton>
        ))}
      </div>
      <Field
        label="ข้อความถึงผู้รับ (ไม่บังคับ)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        maxLength={140}
        placeholder="เช่น ค่าอาหารกลางวัน"
      />
      <Notice>{error}</Notice>
      <ActionButton
        disabled={
          !recipient ||
          recipient.account === user.account ||
          number(amount) <= 0 ||
          number(amount) > user.balance
        }
        className="jp-primary"
        onClick={submit}
      >
        โอน ฿{money(amount)} <ArrowUpRight size={18} />
      </ActionButton>
      <p className="text-center text-[11px] text-[#b19887]">
        ตรวจสอบชื่อผู้รับและจำนวนเงินก่อนยืนยัน
      </p>
    </div>
  );
}
function RequestForm({ loan = false, user, requests, onSubmit }) {
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [plan, setPlan] = useState(LOAN_PLANS[0]),
    [error, setError] = useState("");
  const pending = requests.some((row) => row.status === "pending");
  const submit = async () => {
    setError("");
    const result = await onSubmit({
      amount: Number(amount),
      reason,
      plan: loan ? plan : undefined,
    });
    if (result.ok) {
      setAmount("");
      setReason("");
    } else setError(result.error);
  };
  return (
    <div className="space-y-5">
      {loan && user.loan && (
        <div className="jp-card p-5">
          <p className="jp-label mb-2">เงินกู้ปัจจุบัน</p>
          <p className="jp-number text-3xl">฿{money(user.loan.principal)}</p>
          <p className="text-xs text-[#9b8274] mt-2">
            ชำระแล้ว {user.loan.daysPaid}/{user.loan.days} วัน · วันละ ฿
            {money(user.loan.dailyInstallment)}
          </p>
        </div>
      )}
      <AmountInput
        value={amount}
        onChange={setAmount}
        label={loan ? "จำนวนเงินที่ต้องการกู้" : "จำนวนเงินที่ต้องการเติม"}
      />
      {loan ? (
        <div className="grid grid-cols-2 gap-3">
          {LOAN_PLANS.map((item) => (
            <ActionButton
              key={item.days}
              onClick={() => setPlan(item)}
              className={`jp-card p-4 text-left ${plan.days === item.days ? "!border-[#567746] !bg-[#edf2e4]" : ""}`}
            >
              <p className="text-lg jp-number font-medium">{item.days} วัน</p>
              <p className="text-[11px] text-[#9b8274] mt-1">
                ดอกเบี้ย {item.rate * 100}%
              </p>
              <p className="text-[11px] mt-3">
                วันละ ฿
                {money(
                  Math.ceil(
                    Math.ceil(number(amount) * (1 + item.rate)) / item.days,
                  ),
                )}
              </p>
            </ActionButton>
          ))}
        </div>
      ) : (
        <Field
          label="เหตุผลในการเติมเงิน"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ระบุเหตุผลหรือรายละเอียด"
        />
      )}
      <Notice>{error}</Notice>
      <ActionButton
        className="jp-primary"
        disabled={number(amount) <= 0 || (loan && (pending || !!user.loan))}
        onClick={submit}
      >
        {loan && pending
          ? "มีคำขอรออนุมัติแล้ว"
          : "ส่งคำขอ" + (loan ? "กู้เงิน" : "เติมเงิน")}
        <ArrowUpRight size={17} />
      </ActionButton>
      <p className="text-[11px] text-center text-[#9b8274]">
        ยอดเงินจะเข้าบัญชีเมื่อผู้ดูแลอนุมัติ
      </p>
      <div className="pt-3">
        <p className="jp-label mb-3">ประวัติคำขอ</p>
        <div className="jp-card overflow-hidden">
          {requests.length ? (
            requests.map((row, index) => (
              <div
                key={row.id}
                className={`p-4 flex items-center justify-between ${index ? "border-t border-[#fff0df]" : ""}`}
              >
                <div>
                  <p className="text-sm font-medium">฿{money(row.amount)}</p>
                  <p className="text-[11px] text-[#b19887] mt-1">
                    วันที่ {row.day || "—"}
                  </p>
                </div>
                <span
                  className={`text-[11px] px-2.5 py-1.5 rounded-full ${row.status === "pending" ? "bg-[#fbf0df] text-[#a17b45]" : row.status === "approved" ? "bg-[#eaf2e1] text-[#618248]" : "bg-[#f7e8e0] text-[#ac7159]"}`}
                >
                  {row.status === "pending"
                    ? "รออนุมัติ"
                    : row.status === "approved"
                      ? "อนุมัติแล้ว"
                      : "ไม่อนุมัติ"}
                </span>
              </div>
            ))
          ) : (
            <Empty icon={loan ? Banknote : Plus} title="ยังไม่มีคำขอ" />
          )}
        </div>
      </div>
    </div>
  );
}
function Savings({ user, onDeposit, onWithdraw }) {
  const [mode, setMode] = useState("deposit"),
    [amount, setAmount] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="space-y-5">
      <div className="text-center rounded-3xl bg-[#fff0cf] py-6">
        <LogoMark className="w-12 h-12 mx-auto mb-3 object-contain" />
        <p className="jp-label">เงินออมของคุณ</p>
        <p className="jp-number text-4xl mt-2">฿{money(user.piggy)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 bg-[#fff0dd] rounded-2xl p-1">
        {[
          ["deposit", "ฝากเงิน"],
          ["withdraw", "ถอนเงิน"],
        ].map(([key, label]) => (
          <ActionButton
            key={key}
            onClick={() => {
              setMode(key);
              setError("");
            }}
            className={`rounded-xl py-2.5 text-xs ${mode === key ? "bg-white shadow-sm" : ""}`}
          >
            {label}
          </ActionButton>
        ))}
      </div>
      <AmountInput
        value={amount}
        onChange={setAmount}
        max={mode === "deposit" ? user.balance : user.piggy}
      />
      {mode === "deposit" && user.loan?.status === "missed" && (
        <Notice>เงินฝากจะนำไปชำระเงินกู้ที่ค้างก่อนเข้ากระปุก</Notice>
      )}
      <Notice>{error}</Notice>
      <ActionButton
        className="jp-primary"
        disabled={
          number(amount) <= 0 ||
          number(amount) > (mode === "deposit" ? user.balance : user.piggy) ||
          (mode === "withdraw" && user.negative)
        }
        onClick={async () => {
          setError("");
          const result = await (mode === "deposit" ? onDeposit : onWithdraw)(
            Number(amount),
          );
          if (result.ok) setAmount("");
          else setError(result.error);
        }}
      >
        {mode === "deposit" ? "ฝากเข้ากระปุก" : "ถอนเข้ากระเป๋า"}
        <ArrowUpRight size={17} />
      </ActionButton>
    </div>
  );
}
function CreditBill({ user, onPay }) {
  const [error, setError] = useState("");
  const daily = creditTodayDue(user),
    total = creditTotalOutstanding(user);
  return (
    <div className="space-y-4">
      <VisaCard user={user} />
      <div className="rounded-3xl bg-[#594034] text-white p-6">
        <p className="text-xs opacity-60">ยอดค้างชำระทั้งหมด</p>
        <p className="jp-number text-4xl mt-3">฿{money(total)}</p>
        <p className="text-[11px] opacity-60 mt-5">
          วงเงินคงเหลือ ฿{money(user.availableCredit)}
        </p>
      </div>
      <Notice>{error}</Notice>
      {[
        ["daily", "ชำระยอดวันนี้", daily],
        ["full", "ชำระทั้งหมด", total],
      ].map(([mode, label, due]) => (
        <ActionButton
          key={mode}
          disabled={due <= 0 || due > user.balance}
          onClick={async () => {
            setError("");
            const result = await onPay(mode);
            if (!result.ok) setError(result.error);
          }}
          className="jp-secondary w-full !justify-between"
        >
          <span>{label}</span>
          <span className="jp-number font-medium">฿{money(due)}</span>
        </ActionButton>
      ))}
      <p className="text-[11px] text-[#9b8274]">
        เงินจะถูกหักจากยอดกระเป๋า ฿{money(user.balance)}
      </p>
    </div>
  );
}
function SmartQrImage({ payload, size = 220 }) {
  const [failed, setFailed] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => setFailed(false), [payload]);
  return failed ? (
    <div className="p-5 text-center">
      <p className="text-xs text-[#9b8274] mb-3">โหลด QR ไม่สำเร็จ</p>
      <ActionButton
        className="jp-secondary mx-auto"
        onClick={() => {
          setFailed(false);
          setRevision((value) => value + 1);
        }}
      >
        ลองใหม่
      </ActionButton>
    </div>
  ) : (
    <img
      key={revision}
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}&v=${revision}`}
      width={size}
      height={size}
      alt="QR สำหรับรับเงิน"
      className="mx-auto rounded-xl"
      onError={() => setFailed(true)}
    />
  );
}
function ReceiveQR({ user }) {
  const [amount, setAmount] = useState("");
  return (
    <div className="space-y-5">
      <div className="jp-card p-7 text-center">
        <p className="text-3xl mb-2">{user.avatar}</p>
        <p className="jp-heading text-lg mb-1">{user.name}</p>
        <p className="text-xs text-[#9b8274] mb-6">
          {fmtAccount(user.account)}
        </p>
        <SmartQrImage
          payload={JSON.stringify({
            action: "pay",
            account: user.account,
            ...(number(amount) > 0 ? { amount: number(amount) } : {}),
          })}
        />
        <p className="jp-label mt-5">สแกนด้วยแอป JiwPay เพื่อโอนเงิน</p>
      </div>
      <Field
        label="ระบุยอดรับเงิน (ไม่บังคับ)"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder="ไม่ระบุจำนวนเงิน"
      />
    </div>
  );
}
function decodeScanPayload(raw) {
  try {
    const value = JSON.parse(raw);
    const account = String(value?.account ?? value?.merchant_account ?? "");
    if (/^\d{6}$/.test(account))
      return {
        account,
        action: value.action,
        qrVersion: value.qrVersion,
        amount: number(value.amount) > 0 ? String(number(value.amount)) : "",
      };
  } catch {}
  return { account: /^\d{6}$/.test(raw) ? raw : "", amount: "" };
}
function ScannerPanel({ lookup, onChoose, mode = "pay" }) {
  const [manual, setManual] = useState(""),
    [error, setError] = useState("");
  const detect = async (raw) => {
    const decoded = decodeScanPayload(raw);
    if (!decoded.account) {
      setError("QR นี้ไม่ใช่บัญชี JiwPay");
      return;
    }
    if (mode === "pay" && decoded.action === "jiwpay_card") {
      setError(
        "นี่คือ QR บัตรสำหรับร้านค้ารับเงิน กรุณาสแกน QR รับโอนของผู้รับ",
      );
      return;
    }
    const found = await lookup(decoded.account, true);
    if (!found) {
      setError("ไม่พบบัญชี กรุณาลองอีกครั้ง");
      return;
    }
    if (
      found.qrEnabled === false ||
      String(found.qrEnabled).toLowerCase() === "false"
    ) {
      setError("บัญชีนี้ถูกระงับการใช้ QR");
      return;
    }
    if (mode === "collect" && decoded.action === "pay") {
      setError("นี่คือ QR รับโอนเงิน ให้ลูกค้าเปิด QR บัตร Visa แทน");
      return;
    }
    if (
      mode === "collect" &&
      decoded.qrVersion &&
      found.qrVersion != null &&
      number(decoded.qrVersion) !== number(found.qrVersion)
    ) {
      setError("บัตรนี้ถูกออกใหม่แล้ว กรุณาใช้ QR บัตรล่าสุด");
      return;
    }
    setError("");
    onChoose({
      ...found,
      account: String(found.account),
      amount: decoded.amount,
      scannedQrVersion: decoded.qrVersion,
    });
  };
  return (
    <div className="space-y-5">
      <div className="rounded-[28px] bg-[#594034] p-7 flex flex-col items-center">
        <CameraPreview accent="border-[#d9e7b2]" onDetect={detect} />
        <p className="text-xs text-[#c5cfbf] text-center mt-5">
          วาง QR ให้อยู่ในกรอบ
          <br />
          <span className="text-[11px] opacity-60">
            {mode === "collect"
              ? "สแกน QR บนบัตรลูกค้า เพื่อให้ร้านค้ารับเงิน"
              : "ตรวจสอบผู้รับได้ก่อนยืนยันจ่าย"}
          </span>
        </p>
      </div>
      <Notice>{error}</Notice>
      <div className="jp-card p-5">
        <Field
          label="หรือกรอกเลขบัญชี"
          value={manual}
          onChange={(e) =>
            setManual(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          inputMode="numeric"
          placeholder="เลขบัญชี 6 หลัก"
        />
        <ActionButton
          disabled={manual.length !== 6}
          className="jp-secondary w-full mt-3"
          onClick={() => detect(manual)}
        >
          ค้นหาบัญชี <ArrowRight size={15} />
        </ActionButton>
      </div>
    </div>
  );
}
function PosPanel({ lookup, onCash, onCredit, user }) {
  const [customer, setCustomer] = useState(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [days, setDays] = useState("3");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const lock = useRef(false);
  const canCredit =
    customer?.hasCreditCard === true ||
    String(customer?.hasCreditCard).toLowerCase() === "true";
  const choose = (found) => {
    if (String(found.account) === String(user.account)) {
      setError("ไม่สามารถรับชำระจากบัญชีตนเอง");
      return;
    }
    setCustomer(found);
    setAmount("");
    setMethod("cash");
    setDays("3");
    setError("");
  };
  const confirm = async () => {
    if (
      lock.current ||
      !customer ||
      !validAmount(amount) ||
      (method === "credit" && !canCredit)
    )
      return;
    lock.current = true;
    setProcessing(true);
    setError("");
    try {
      const result = await (method === "cash"
        ? onCash(customer.account, Number(amount), customer.scannedQrVersion)
        : onCredit(
            customer.account,
            Number(amount),
            Number(days),
            `ผ่อน 0% ${days} งวด`,
            customer.scannedQrVersion,
          ));
      if (result?.ok) setSuccess(true);
      else setError(result?.error || "ทำรายการไม่สำเร็จ");
    } catch {
      setError("ยังยืนยันรายการไม่ได้ กรุณาตรวจสอบยอดก่อนลองใหม่");
    } finally {
      lock.current = false;
      setProcessing(false);
    }
  };
  if (success)
    return (
      <div className="jp-card p-7 text-center">
        <span className="text-5xl">🎉</span>
        <h2 className="jp-heading text-2xl mt-4">รับเงินเรียบร้อย!</h2>
        <p className="text-sm text-stone-500 mt-3">
          รับชำระจาก {customer.name}
        </p>
        <p className="jp-number text-4xl text-orange-500 my-5">
          ฿{money(amount)}
        </p>
        <p className="text-xs text-stone-500">
          {method === "cash" ? "จ่ายเต็มตอนนี้" : `ผ่อน 0% ${days} งวด`}
        </p>
        <ActionButton
          className="jp-primary mt-6"
          onClick={() => {
            setCustomer(null);
            setSuccess(false);
            setAmount("");
          }}
        >
          รับเงินรายการถัดไป
        </ActionButton>
      </div>
    );
  return (
    <div className="space-y-5">
      {!customer ? (
        <ScannerPanel mode="collect" lookup={lookup} onChoose={choose} />
      ) : (
        <fieldset
          disabled={processing}
          className="space-y-5 border-0 p-0 m-0 min-w-0"
        >
          <div className="jp-card p-5 flex items-center gap-3">
            <span className="text-3xl">{customer.avatar || "👤"}</span>
            <div className="flex-1">
              <p className="jp-label">ตัดเงินจากบัตรของ</p>
              <p className="text-sm font-semibold mt-1">{customer.name}</p>
              <p className="text-xs text-stone-400">
                {fmtAccount(customer.account)}
              </p>
            </div>
            <IconButton label="เปลี่ยนลูกค้า" onClick={() => setCustomer(null)}>
              <X size={16} />
            </IconButton>
          </div>
          <AmountInput
            label="ยอดที่ร้านค้าต้องการรับ"
            value={amount}
            onChange={setAmount}
          />
          <div className="grid grid-cols-2 gap-3">
            <ActionButton
              aria-pressed={method === "cash"}
              className={`jp-secondary ${method === "cash" ? "!bg-orange-100 !border-orange-400" : ""}`}
              onClick={() => setMethod("cash")}
            >
              จ่ายเต็มตอนนี้
            </ActionButton>
            <ActionButton
              aria-pressed={method === "credit"}
              disabled={!canCredit}
              className={`jp-secondary ${method === "credit" ? "!bg-orange-100 !border-orange-400" : ""}`}
              onClick={() => setMethod("credit")}
            >
              ผ่อน 0%
            </ActionButton>
          </div>
          {!canCredit && (
            <p className="text-xs text-stone-400">
              บัญชีนี้ยังไม่มีบัตร Visa สำหรับผ่อนชำระ
            </p>
          )}
          {method === "credit" && (
            <div className="jp-card p-5">
              <label className="jp-label">
                จำนวนงวด
                <select
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  className="block w-full border-2 border-orange-100 rounded-xl bg-white p-3 mt-2 text-sm"
                >
                  <option value="3">3 งวด</option>
                  <option value="5">5 งวด</option>
                </select>
              </label>
              <p className="text-xs text-stone-500 mt-3">
                ใช้วงเงิน Visa · ชำระวันละ ฿
                {money(Math.ceil(number(amount) / Number(days)))} ตามเวลาในเกม
              </p>
            </div>
          )}
          <ActionButton
            disabled={processing || !validAmount(amount)}
            className="jp-primary"
            onClick={confirm}
          >
            <CheckCircle2 size={18} />
            ยืนยันรับเงิน ฿{money(amount)}
          </ActionButton>
          <p className="text-center text-xs text-stone-500">
            ตรวจสอบชื่อเจ้าของบัตร ยอดเงิน และแผนชำระก่อนยืนยัน
          </p>
        </fieldset>
      )}
      <Notice>{error}</Notice>
    </div>
  );
}

function PosQrPanel({ user }) {
  const [amount, setAmount] = useState("");
  const [qrAmount, setQrAmount] = useState(null);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-orange-50 border-2 border-orange-100 p-4">
        <h2 className="jp-heading">เครื่องคิดเลขร้านค้า</h2>
        <p className="text-xs text-stone-500 mt-2">
          คำนวณยอด แล้วสร้าง QR ให้ลูกค้าสแกนจ่าย
        </p>
      </div>
      <CalculatorAmount
        value={amount}
        onChange={(value) => {
          setAmount(value);
          setQrAmount(null);
        }}
      />
      <ActionButton
        disabled={!validAmount(amount)}
        className="jp-primary"
        onClick={() => setQrAmount(Number(amount))}
      >
        <QrCode size={18} />
        สร้าง QR รับชำระ
      </ActionButton>
      {qrAmount !== null && (
        <div className="jp-card p-6 text-center">
          <p className="jp-heading text-lg">{user.name}</p>
          <p className="text-xs text-stone-400 mb-4">
            {fmtAccount(user.account)}
          </p>
          <SmartQrImage
            payload={JSON.stringify({
              action: "pay",
              account: String(user.account),
              amount: qrAmount,
            })}
          />
          <p className="jp-number text-3xl text-orange-500 mt-4">
            ฿{money(qrAmount)}
          </p>
          <p className="text-xs text-stone-500 mt-3">
            ให้ลูกค้าเลือกสแกนจ่าย แล้วสแกน QR นี้
          </p>
          <p className="text-xs text-stone-400 mt-2">
            ตรวจสอบยอดเข้าหรือประวัติรายการก่อนส่งมอบสินค้า
          </p>
        </div>
      )}
    </div>
  );
}
export { PosQrPanel };

function PinScreen({ setup, onSubmit, busy }) {
  const [pin, setPin] = useState(""),
    [first, setFirst] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <div className="max-w-sm mx-auto px-6 py-16 text-center">
      <span className="w-16 h-16 rounded-3xl bg-[#e4ebd7] mx-auto flex items-center justify-center mb-5">
        <Lock size={26} />
      </span>
      <h1 className="jp-heading text-2xl">
        {setup
          ? first
            ? "ยืนยัน PIN อีกครั้ง"
            : "ตั้ง PIN 4 หลัก"
          : "ใส่รหัส PIN"}
      </h1>
      <p className="text-xs text-[#9b8274] mt-3 mb-7">
        PIN ใช้ล็อกหน้าจอบนอุปกรณ์นี้
      </p>
      <div className="flex gap-4 justify-center mb-7">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-3 h-3 rounded-full ${pin.length > i ? "bg-[#f58b38]" : "bg-[#ffe0bd]"}`}
          />
        ))}
      </div>
      <Notice>{error}</Notice>
      <div className="grid grid-cols-4 gap-4 mt-5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(
          (key, i) => (
            <ActionButton
              key={i}
              disabled={!key || busy}
              className={`h-16 rounded-2xl text-xl ${key ? "bg-white border border-[#ffe0bd]" : "invisible"}`}
              onClick={async () => {
                if (lock.current) return;
                if (key === "⌫") {
                  setPin((value) => value.slice(0, -1));
                  return;
                }
                const next = pin + key;
                setPin(next);
                if (next.length < 4) return;
                if (setup && !first) {
                  setFirst(next);
                  setPin("");
                  return;
                }
                if (setup && next !== first) {
                  setError("PIN ไม่ตรงกัน กรุณาตั้งใหม่");
                  setPin("");
                  setFirst("");
                  return;
                }
                lock.current = true;
                try {
                  const result = await onSubmit(next);
                  if (result.error) {
                    setError(result.error);
                    setPin("");
                  }
                } finally {
                  lock.current = false;
                }
              }}
            >
              {key}
            </ActionButton>
          ),
        )}
      </div>
    </div>
  );
}
function CameraPreview({ accent, onDetect, fallbackText }) {
  const videoRef = useRef(null);
  const detectRef = useRef(onDetect);
  detectRef.current = onDetect;
  const [status, setStatus] = useState("requesting");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let decode;
    let cancelled = false,
      stream,
      frame,
      lastScan = 0,
      detected = false;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    let context;
    const stop = () => {
      stream?.getTracks().forEach((track) => track.stop());
      cancelAnimationFrame(frame);
    };
    const scan = (now) => {
      if (cancelled || detected) return;
      if (
        now - lastScan > 150 &&
        video.readyState >= 2 &&
        video.videoWidth &&
        context
      ) {
        lastScan = now;
        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = Math.round(
          (video.videoHeight * canvas.width) / video.videoWidth,
        );
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = decode(pixels.data, pixels.width, pixels.height, {
          inversionAttempts: "attemptBoth",
        });
        if (result?.data) {
          detected = true;
          setStatus("processing");
          Promise.resolve()
            .then(() => detectRef.current(result.data))
            .catch(() => {
              if (!cancelled) setStatus("failed");
            })
            .finally(() => {
              if (!cancelled) {
                detected = false;
                lastScan = performance.now() + 1500;
                setStatus("live");
                frame = requestAnimationFrame(scan);
              }
            });
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    };
    const start = async () => {
      setStatus("requesting");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
            },
          });
        } catch (error) {
          if (error.name !== "OverconstrainedError") throw error;
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
        if (cancelled || document.hidden) {
          stop();
          return;
        }
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute("webkit-playsinline", "true");
        await video.play();
        decode = await loadQrDecoder();
        if (cancelled || document.hidden) {
          stop();
          return;
        }
        context = canvas.getContext("2d", { willReadFrequently: true });
        setStatus("live");
        frame = requestAnimationFrame(scan);
      } catch (error) {
        stop();
        if (!cancelled)
          setStatus(error.name === "NotAllowedError" ? "denied" : "failed");
      }
    };
    start();
    const visibility = () => {
      if (document.hidden) stop();
      else setAttempt((value) => value + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      stop();
      video.srcObject = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [attempt]);
  const live = status === "live" || status === "processing";
  return (
    <div
      className="w-52 h-52 shrink-0 rounded-2xl overflow-hidden relative bg-stone-900"
      style={{ isolation: "isolate" }}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 z-0 w-full h-full object-cover"
      />
      <div
        className={`absolute inset-3 z-10 rounded-xl border-4 border-dashed pointer-events-none ${accent}`}
      />
      {live ? (
        <div className="absolute bottom-2 inset-x-2 z-20 bg-black/50 text-white text-[11px] text-center rounded-lg py-1.5">
          {status === "processing" ? "กำลังตรวจสอบ QR..." : "กำลังสแกน..."}
        </div>
      ) : (
        <div className="absolute inset-0 z-20 bg-stone-900/90 flex flex-col items-center justify-center gap-2 px-3 text-center text-stone-200 text-[11px]">
          <Camera size={32} />
          {status === "requesting" ? (
            <>
              <Loader2 className="animate-spin" />
              กำลังขอสิทธิ์ใช้กล้อง...
            </>
          ) : (
            <>
              <span>
                {fallbackText ||
                  "เปิดสิทธิ์กล้อง หรือเปิดลิงก์นี้ใน Safari / Chrome ผ่าน HTTPS"}
              </span>
              <ActionButton
                className="text-amber-400 underline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                เปิดกล้องอีกครั้ง
              </ActionButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { CameraPreview, SmartQrImage, normalizeGame, normalizeUser };

function VisaCard({ user }) {
  const version = Math.max(1, number(user.qrVersion));
  const payload = JSON.stringify({
    action: "jiwpay_card",
    account: String(user.account),
    cardType: user.hasCreditCard ? "visa" : "wallet",
    qrVersion: version,
  });
  return (
    <details className="jp-card overflow-hidden mt-4">
      <summary className="cursor-pointer p-4 flex items-center gap-2 text-sm font-semibold">
        <CreditCard size={18} className="text-orange-500" />
        {user.hasCreditCard
          ? "บัตร Visa / QR สำหรับให้ร้านค้าสแกน"
          : "บัตร JiwPay / QR สำหรับให้ร้านค้าสแกน"}
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

export { PosPanel, decodeScanPayload };

function HomeView({
  user,
  badges,
  myTx,
  todaySales,
  onGoTransfer,
  onGoScanHub,
  onGoTopup,
  onGoLoan,
  onGoHistory,
  onOpenPiggy,
  onOpenPayBill,
  onReceive,
  onCard,
  onLock,
}) {
  const { base, next } = milestoneRange(user.piggy || 0);
  const progress = Math.min(
    100,
    Math.round(((user.piggy - base) / (next - base)) * 100),
  );
  const earned = user.earnedBadges || [];
  const [cardIndex, setCardIndex] = useState(0);
  const touchStartX = useRef(null);
  const todayDue = creditTodayDue(user);
  const totalOwed = creditTotalOutstanding(user);
  const usedCreditPct =
    user.creditLimit > 0
      ? Math.round(
          ((user.creditLimit - user.availableCredit) / user.creditLimit) * 100,
        )
      : 0;
  const earnedBadges = badges.filter((b) =>
    earned.map(String).includes(String(b.id)),
  );

  return (
    <div className="px-5">
      <div className="flex items-center gap-3 bg-white rounded-2xl border-2 border-orange-100 p-4">
        <ActionButton
          aria-label="ตั้ง PIN หรือล็อกหน้าจอ"
          onClick={onLock}
          className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center text-3xl"
        >
          {user.avatar}
        </ActionButton>
        <div className="min-w-0">
          <div
            className="font-semibold text-stone-800 text-base truncate"
            style={{ fontFamily: "Mitr, sans-serif" }}
          >
            {user.name}
          </div>
          <div className="text-xs text-stone-400">
            เลขบัญชี {fmtAccount(user.account)}
          </div>
        </div>
      </div>

      {user.negative && (
        <div className="mt-3 flex items-center gap-2 bg-pink-50 border-2 border-pink-300 text-pink-600 rounded-xl px-4 py-3 text-xs font-semibold">
          <AlertTriangle size={16} /> บัญชีติดลบ {Math.abs(user.balance)} ฿
        </div>
      )}
      {!user.negative && user.loan?.status === "missed" && (
        <div className="mt-3 flex items-center gap-2 bg-amber-50 border-2 border-amber-300 text-amber-700 rounded-xl px-4 py-3 text-xs font-semibold">
          <AlertTriangle size={16} /> ค้างชำระเงินกู้{" "}
          {user.loan.dailyInstallment} ฿
        </div>
      )}

      <div className="mt-4">
        <div
          className="overflow-hidden rounded-2xl"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null || !user.hasCreditCard) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (dx < -40) setCardIndex(1);
            else if (dx > 40) setCardIndex(0);
            touchStartX.current = null;
          }}
          onClick={() =>
            user.hasCreditCard && setCardIndex((i) => (i === 0 ? 1 : 0))
          }
        >
          <div
            className="flex transition-transform duration-300"
            style={{ transform: `translateX(-${cardIndex * 100}%)` }}
          >
            <div
              className="w-full shrink-0 rounded-2xl p-5 text-white"
              style={{
                background: user.negative
                  ? "linear-gradient(135deg,#FF6B9D,#E23F6B)"
                  : "linear-gradient(135deg,#FF9142,#F5720E)",
              }}
            >
              <div className="text-sm opacity-90">ยอดเงินคงเหลือ</div>
              <div
                className="font-bold text-4xl mt-1"
                style={{ fontFamily: "Mitr, sans-serif" }}
              >
                <span aria-label="ยอดเงินคงเหลือ">
                  {user.balance.toLocaleString()}
                </span>{" "}
                <span className="text-xl">บาท</span>
              </div>
              <ActionButton
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPiggy();
                }}
                className="w-full flex items-center justify-between mt-4 bg-white/20 px-3 py-2 rounded-full text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <Lock size={12} /> กระปุกออมสิน{" "}
                  {(user.piggy || 0).toLocaleString()} ฿ · แตะเพื่อฝาก/ถอน
                </span>
                <Wallet size={16} />
              </ActionButton>
              <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full bg-white"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-[10px] opacity-80 mt-1">
                เป้าหมายถัดไป {next.toLocaleString()} ฿
              </div>
            </div>
            {user.hasCreditCard && (
              <div
                className="w-full shrink-0 rounded-2xl p-5 text-white"
                style={{
                  background: "linear-gradient(135deg,#1c1917,#3D2C1F)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm opacity-80">JiwPay Visa</div>
                  <div className="text-lg font-bold tracking-wider opacity-90">
                    VISA
                  </div>
                </div>
                <div
                  className="font-bold text-3xl mt-3"
                  style={{ fontFamily: "Mitr, sans-serif" }}
                >
                  {(user.availableCredit || 0).toLocaleString()}{" "}
                  <span className="text-base font-normal opacity-70">
                    ฿ วงเงินคงเหลือ
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/20 overflow-hidden mt-2">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${usedCreditPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-3 text-xs opacity-80">
                  <span>
                    วงเงินทั้งหมด {(user.creditLimit || 0).toLocaleString()} ฿
                  </span>
                  <span>ยอดวันนี้ {todayDue.toLocaleString()} ฿</span>
                </div>
                <ActionButton
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPayBill();
                  }}
                  disabled={totalOwed <= 0}
                  className="w-full mt-4 py-2.5 rounded-full bg-amber-400 text-stone-900 text-sm font-bold disabled:opacity-40"
                  style={{ fontFamily: "Mitr, sans-serif" }}
                >
                  ชำระบิล
                </ActionButton>
              </div>
            )}
          </div>
        </div>
        {user.hasCreditCard && (
          <p className="text-center text-[10px] text-orange-400 mt-2">
            👆 ปัดหรือแตะเพื่อสลับบัตรกระเป๋า / Visa
          </p>
        )}
        {user.hasCreditCard && (
          <div className="flex justify-center gap-1.5 mt-2">
            {[0, 1].map((i) => (
              <ActionButton
                key={i}
                aria-label={i === 0 ? "แสดงบัตรกระเป๋าเงิน" : "แสดงบัตร Visa"}
                onClick={() => setCardIndex(i)}
                className={`h-1.5 rounded-full transition-all ${cardIndex === i ? "w-5 bg-orange-500" : "w-1.5 bg-orange-200"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between bg-white rounded-2xl border-2 border-orange-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
            <TrendingUp size={17} className="text-teal-600" />
          </div>
          <div>
            <div className="text-[11px] text-stone-400">ยอดขายวันนี้</div>
            <div
              className="font-bold text-lg text-stone-800"
              style={{ fontFamily: "Mitr, sans-serif" }}
            >
              {todaySales.toLocaleString()} ฿
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-around mt-5">
        {[
          {
            icon: Send,
            label: "โอนเงิน",
            bg: "bg-pink-500",
            onClick: onGoTransfer,
            disabled: user.negative,
          },
          {
            icon: QrCode,
            label: "สแกน",
            bg: "bg-teal-500",
            onClick: onGoScanHub,
          },
          {
            icon: Plus,
            label: "เติมเงิน",
            bg: "bg-orange-500",
            onClick: onGoTopup,
          },
        ].map((a) => {
          const Icon = a.icon;
          return (
            <ActionButton
              key={a.label}
              disabled={a.disabled}
              onClick={a.onClick}
              className="flex flex-col items-center gap-1.5 disabled:opacity-40"
            >
              <div
                className={`w-14 h-14 rounded-2xl ${a.bg} flex items-center justify-center`}
              >
                <Icon size={22} className="text-white" />
              </div>
              <span className="text-xs font-medium text-stone-700">
                {a.label}
              </span>
            </ActionButton>
          );
        })}
      </div>

      <ActionButton
        disabled={user.negative}
        aria-label="เงินกู้"
        onClick={onGoLoan}
        className="w-full flex items-center justify-center gap-2 mt-4 bg-white border-2 border-orange-100 rounded-2xl py-3 text-sm font-semibold text-stone-700 disabled:opacity-40"
      >
        <Banknote size={17} className="text-orange-500" /> กู้เงิน
      </ActionButton>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <ActionButton className="jp-secondary !text-xs" onClick={onReceive}>
          <QrCode size={15} />
          QR รับโอนของฉัน
        </ActionButton>
        <ActionButton className="jp-secondary !text-xs" onClick={onCard}>
          <CreditCard size={15} />
          บัตร / QR ของฉัน
        </ActionButton>
      </div>
      <div className="mt-5">
        <div
          className="font-semibold text-sm text-stone-800 mb-2"
          style={{ fontFamily: "Mitr, sans-serif" }}
        >
          เหรียญรางวัล
        </div>
        {earnedBadges.length === 0 ? (
          <div className="text-xs text-stone-400 italic">
            ยังไม่มีเหรียญรางวัล
          </div>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto jp-scroll pb-1">
            {earnedBadges.map((b) => (
              <div
                key={b.id}
                className="min-w-[104px] rounded-2xl border-2 p-3 text-center bg-white border-orange-100"
              >
                <div className="text-2xl">{b.icon}</div>
                <div className="text-[11px] font-medium mt-1 text-stone-700">
                  {b.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div
            className="font-semibold text-sm text-stone-800"
            style={{ fontFamily: "Mitr, sans-serif" }}
          >
            รายการล่าสุด
          </div>
          <ActionButton
            onClick={onGoHistory}
            className="text-xs font-semibold text-orange-600"
          >
            ดูทั้งหมด
          </ActionButton>
        </div>
        <div className="bg-white rounded-2xl border-2 border-orange-100 overflow-hidden">
          {myTx.map((t, i) => {
            const dir = String(t.toId) === String(user.account) ? "in" : "out";
            const other = dir === "in" ? t.fromId : t.toId;
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 p-3.5 ${i !== 0 ? "border-t border-orange-50" : ""}`}
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg shrink-0">
                  {Number(other) === 0 ? "🏦" : "👤"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-800 truncate">
                    {Number(other) === 0
                      ? "ธนาคารจิ๋วเปย์"
                      : fmtAccount(String(other))}
                  </div>
                  <div className="text-[11px] text-stone-400">
                    {t.memo} · วันที่ {t.day} {t.time}
                  </div>
                </div>
                <div
                  className={`text-sm font-bold shrink-0 ${dir === "in" ? "text-teal-600" : "text-pink-500"}`}
                >
                  {dir === "in" ? "+" : "-"}
                  {Number(t.amount).toLocaleString()}฿
                </div>
              </div>
            );
          })}
          {myTx.length === 0 && (
            <div className="text-center text-stone-400 text-sm py-6">
              ยังไม่มีรายการ
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Confetti({ show }) {
  const pieces = useRef(
    Array.from({ length: 42 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 2 + Math.random() * 1.2,
      color: ["#FF9142", "#FF6B9D", "#3FC7B8", "#FFC94D", "#7C6BFF"][i % 5],
      size: 6 + Math.random() * 6,
      rotate: Math.random() * 360,
    })),
  ).current;
  if (!show) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[80]">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            top: -20,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotate}deg)`,
            animation: `jp-fall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

function ESlipView({ currentUser, tx, onDone }) {
  return (
    <div className="px-5">
      <div className="flex flex-col items-center pt-6">
        <div
          style={{ animation: "jp-pop 0.5s ease" }}
          className="w-16 h-16 rounded-full bg-teal-500 flex items-center justify-center"
        >
          <CheckCircle2 size={34} className="text-white" />
        </div>
        <div
          className="font-bold text-xl text-stone-800 mt-3"
          style={{ fontFamily: "Mitr, sans-serif" }}
        >
          โอนเงินเรียบร้อย
        </div>
        <div className="text-xs text-stone-400 mt-1">
          เก็บสลิปไว้เป็นหลักฐานได้เลย
        </div>
        <div className="w-full mt-5 rounded-3xl overflow-hidden shadow-lg">
          <div
            className="p-5 text-white"
            style={{ background: "linear-gradient(135deg,#FF9142,#FF6B9D)" }}
          >
            <div
              className="flex items-center gap-1.5 font-semibold text-sm"
              style={{ fontFamily: "Mitr, sans-serif" }}
            >
              <Sparkles size={15} /> จิ๋วเปย์ อี-สลิป
            </div>
            <div
              className="font-bold text-3xl mt-2"
              style={{ fontFamily: "Mitr, sans-serif" }}
            >
              {Number(tx.amount).toLocaleString()} บาท
            </div>
          </div>
          <div className="bg-white p-5">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                {currentUser.avatar}
              </div>
              <div className="text-xs font-medium text-stone-700">
                {currentUser.name} (ผู้โอน)
              </div>
            </div>
            <div className="flex justify-center my-1">
              <ArrowDownLeft size={14} className="text-stone-300" />
            </div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                {tx.recipientAvatar}
              </div>
              <div className="text-xs font-medium text-stone-700">
                {tx.recipientName} (ผู้รับ)
              </div>
            </div>
            <div className="border-t border-dashed border-stone-200 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-400">วันเวลาในเกม</span>
                <span className="font-semibold text-stone-800">
                  วันที่ {tx.day}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-400 mt-3">
          <Camera size={13} /> แคปหน้าจอเก็บไว้ได้เลย!
        </div>
      </div>
      <ActionButton
        onClick={onDone}
        className="w-full mt-5 py-4 rounded-2xl font-semibold text-white bg-stone-800"
        style={{ fontFamily: "Mitr, sans-serif" }}
      >
        ปิด / แคปหน้าจอ
      </ActionButton>
    </div>
  );
}

function milestoneRange(v) {
  const list = [0, 100, 500, 1000, 5000];
  while (list[list.length - 1] <= v) list.push(list[list.length - 1] * 5);
  for (let i = 1; i < list.length; i++)
    if (v < list[i]) return { base: list[i - 1], next: list[i] };
  return { base: 0, next: 100 };
}

function CalculatorAmount({ value, onChange }) {
  const [expression, setExpression] = useState("");
  const press = (key) => {
    let next =
      key === "C"
        ? ""
        : key === "⌫"
          ? expression.slice(0, -1)
          : expression + key;
    if (next.length > 40 || /[+\-]{2}|^\+/.test(next)) return;
    setExpression(next);
    const terms = next.match(/[+\-]?\d+(?:\.\d*)?/g) || [];
    const total = terms.reduce((sum, term) => sum + Number(term), 0);
    onChange(next ? String(Math.max(0, Math.round(total * 100) / 100)) : "");
  };
  return (
    <div className="space-y-3">
      <AmountInput
        label="ยอดที่ร้านค้าต้องการรับ"
        value={value}
        onChange={(next) => {
          setExpression(next);
          onChange(next);
        }}
      />
      <div
        className="rounded-xl bg-stone-800 text-amber-300 px-4 py-3 text-right font-mono text-sm"
        aria-label="รายการคำนวณ"
      >
        {expression || "ใส่ยอดชำระ"}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          "7",
          "8",
          "9",
          "+",
          "4",
          "5",
          "6",
          "-",
          "1",
          "2",
          "3",
          "C",
          "0",
          "00",
          "⌫",
        ].map((key) => (
          <ActionButton
            key={key}
            onClick={() => press(key)}
            className={`rounded-xl py-3 border-2 font-semibold ${["+", "-"].includes(key) ? "bg-orange-500 border-orange-500 text-white" : ["C", "⌫"].includes(key) ? "bg-pink-50 border-pink-100 text-pink-500" : "bg-white border-orange-100 text-stone-700"}`}
          >
            {key}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}

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

function ScanHub({ user, lookup, onChoose, onCash, onCredit }) {
  const [tab, setTab] = useState("pay");
  const tabs = [
    ["pay", "สแกนจ่าย"],
    ["collect", "สแกนรับเงิน"],
    ["receive", "QR รับเงิน"],
  ];
  return (
    <div className="px-5 space-y-4">
      <div
        role="tablist"
        aria-label="บริการสแกน"
        className="grid grid-cols-3 rounded-2xl bg-pink-50 border-2 border-pink-100 overflow-hidden"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`scan-panel-${id}`}
            id={`scan-tab-${id}`}
            onClick={() => setTab(id)}
            className={`py-4 text-xs font-semibold border-b-4 ${tab === id ? "border-teal-400 text-teal-700 bg-white" : "border-transparent text-stone-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`scan-panel-${tab}`}
        aria-labelledby={`scan-tab-${tab}`}
        key={tab}
        className="space-y-4 jp-enter"
      >
        {tab === "pay" && (
          <>
            <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              สแกน QR รับโอนของผู้รับ เพื่อจ่ายจากบัญชีของคุณ
              ตรวจสอบชื่อและยอดก่อนยืนยันทุกครั้ง
            </p>
            <ScannerPanel mode="pay" lookup={lookup} onChoose={onChoose} />
          </>
        )}
        {tab === "collect" && (
          <>
            <p className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-xs text-teal-800">
              สำหรับร้านค้า: สแกน QR บัตรลูกค้า แล้วระบุยอดรับชำระ
            </p>
            <PosPanel
              user={user}
              lookup={lookup}
              onCash={onCash}
              onCredit={onCredit}
              startWithCamera
            />
          </>
        )}
        {tab === "receive" && <ReceiveQR user={user} />}
      </div>
    </div>
  );
}

const validAmount = (value) =>
    Number.isFinite(Number(value)) &&
    Number(value) > 0 &&
    Number(value) <= Number.MAX_SAFE_INTEGER;
