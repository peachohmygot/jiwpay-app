import React, { useState, useEffect, useCallback } from "react";
import {
  Users, Wallet, Banknote, Award, Megaphone, Clock, LayoutDashboard,
  CheckCircle2, XCircle, Plus, Trash2, ShieldOff, ShieldCheck, UserPlus,
  Search, AlertTriangle, RotateCcw, Pause, Play, SkipForward, TrendingUp,
  Loader2, RefreshCw, X, QrCode, KeyRound,
} from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Mitr:wght@500;600;700&family=Prompt:wght@400;500;600;700&display=swap');`;

/* =============================================================
   ADMIN DASHBOARD — a separate deployment from the customer app,
   sharing the same Google Apps Script backend (jiwpay-backend-v3.gs).
   Every request includes `adminKey`, which unlocks the admin-only
   actions and unfiltered reads on the backend. The customer app
   never has this key, so it can never reach these actions.
   ============================================================= */
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbyPM1-Dqf-Fx4o5UOYLtR2T9ArbveG2lPSvyV4I_wMSFz6UB0UU99k5EuTc5t4SsBZpLQ/exec";

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}?${qs}`);
  return res.json();
}
async function apiPost(body) {
  const res = await fetch(API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const fmtAccount = (acc) => (acc ? `${String(acc).slice(0, 3)}-${String(acc).slice(3)}` : "");
const AVATAR_POOL = ["🐻", "🐼", "🐱", "🐰", "👦", "👧", "🐶", "🐸", "🦊", "🐨"];

function StatCard({ label, value, icon: Icon, tone }) {
  const tones = { orange: "bg-orange-50 text-orange-700 border-orange-200", pink: "bg-pink-50 text-pink-700 border-pink-200", teal: "bg-teal-50 text-teal-700 border-teal-200", amber: "bg-amber-50 text-amber-700 border-amber-200" };
  return (
    <div className={`rounded-2xl border-2 p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between"><span className="text-xs font-medium opacity-80">{label}</span><Icon size={18} /></div>
      <div className="mt-2 font-semibold text-2xl" style={{ fontFamily: "Mitr, sans-serif" }}>{value}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-stone-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{title}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center"><X size={18} className="text-stone-600" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ================= ROOT ================= */

export default function AdminDashboardApp() {
  const [adminKey, setAdminKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [checking, setChecking] = useState(false);

  const verifyKey = async () => {
    setChecking(true); setAuthError("");
    // A lightweight way to confirm the key is real: ask for the full (unfiltered)
    // Users sheet — a wrong/missing key gets silently scoped/rejected by the
    // backend, so an empty ok:false response means the key didn't work.
    const res = await apiGet({ sheet: "GameState", adminKey: keyInput });
    setChecking(false);
    if (res.ok && res.scope === "admin") { setAdminKey(keyInput); setAuthed(true); }
    else setAuthError("รหัสแอดมินไม่ถูกต้อง หรือเชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center px-6" style={{ fontFamily: "Prompt, sans-serif" }}>
        <style>{FONT_IMPORT}</style>
        <div className="w-full max-w-sm bg-white rounded-3xl border-2 border-orange-100 p-6">
          <div className="flex justify-center mb-4"><KeyRound size={36} className="text-orange-500" /></div>
          <div className="font-semibold text-lg text-stone-800 text-center mb-1" style={{ fontFamily: "Mitr, sans-serif" }}>JiwPay แอดมิน</div>
          <div className="text-xs text-stone-400 text-center mb-5">ใส่รหัสผู้ดูแลระบบเพื่อเข้าใช้งาน</div>
          <input value={keyInput} onChange={(e) => setKeyInput(e.target.value)} type="password" placeholder="Admin Key"
            className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 outline-none focus:border-orange-300 text-sm mb-3" />
          {authError && <div className="text-xs text-pink-500 font-medium mb-3">{authError}</div>}
          <button onClick={verifyKey} disabled={checking || !keyInput} className="w-full py-3.5 rounded-xl font-semibold text-white bg-orange-500 disabled:opacity-50 flex items-center justify-center gap-2" style={{ fontFamily: "Mitr, sans-serif" }}>
            {checking && <Loader2 size={16} className="animate-spin" />} เข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }
  return <AdminDashboard adminKey={adminKey} />;
}

/* ================= DASHBOARD ================= */

function AdminDashboard({ adminKey }) {
  const [tab, setTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loanRequests, setLoanRequests] = useState([]);
  const [badges, setBadges] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editUser, setEditUser] = useState(null);
  const [showAddBadge, setShowAddBadge] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const [u, t, tp, ln, b, gs] = await Promise.all([
      apiGet({ sheet: "Users", adminKey }),
      apiGet({ sheet: "Transactions", adminKey }),
      apiGet({ sheet: "Topups", adminKey }),
      apiGet({ sheet: "LoanRequests", adminKey }),
      apiGet({ sheet: "Badges", adminKey }),
      apiGet({ sheet: "GameState", adminKey }),
    ]);
    if (u.ok) setUsers(u.rows);
    if (t.ok) setTransactions(t.rows.sort((a, b2) => (b2.loggedAt || "").localeCompare(a.loggedAt || "")));
    if (tp.ok) setTopups(tp.rows);
    if (ln.ok) setLoanRequests(ln.rows);
    if (b.ok) setBadges(b.rows);
    if (gs.ok && gs.rows[0]) { setGameState(gs.rows[0]); setAnnouncementDraft(gs.rows[0].announcement || ""); }
    setLoading(false);
  }, [adminKey]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const pending = topups.filter((t) => t.status === "pending");
  const pendingLoans = loanRequests.filter((r) => r.status === "pending");
  const totalBalance = users.reduce((s, u) => s + Number(u.balance || 0), 0);
  const filteredUsers = users.filter((u) => (u.name || "").includes(search) || String(u.account || "").includes(search));

  const topupDecision = async (id, status) => { await apiPost({ type: "topup_decision", adminKey, id, status }); refreshAll(); };
  const loanDecision = async (id, status) => { await apiPost({ type: "loan_decision", adminKey, id, status }); refreshAll(); };
  const adjustBalance = async (userId, delta) => { const u = users.find((x) => x.id === userId); await apiPost({ type: "user_admin_upsert", adminKey, user: { id: userId, balance: Math.max(0, Number(u.balance || 0) + delta) } }); refreshAll(); };
  const toggleQr = async (u) => { await apiPost({ type: "user_admin_upsert", adminKey, user: { id: u.id, qrEnabled: !u.qrEnabled } }); refreshAll(); };
  const reissueQr = async (u) => { await apiPost({ type: "user_admin_upsert", adminKey, user: { id: u.id, qrVersion: (u.qrVersion || 1) + 1, qrEnabled: true } }); refreshAll(); };
  const issueCreditCard = async (u) => { const limit = Math.floor((u.piggy || 0) * 0.5); await apiPost({ type: "user_admin_upsert", adminKey, user: { id: u.id, hasCreditCard: true, creditLimit: limit, availableCredit: limit } }); refreshAll(); };
  const setDailyRent = async (u, rent) => { await apiPost({ type: "user_admin_upsert", adminKey, user: { id: u.id, dailyRent: rent } }); refreshAll(); };
  const createAccount = async (form) => {
    const id = Date.now();
    await apiPost({ type: "user_admin_upsert", adminKey, user: {
      id, account: form.account, name: form.shopName, fullName: form.fullName, idCard: form.idCard, password: form.password,
      avatar: AVATAR_POOL[id % AVATAR_POOL.length], balance: 0, piggy: 0, dailyRent: 0, negative: false,
      qrEnabled: true, qrVersion: 1, hasCreditCard: false, creditLimit: 0, availableCredit: 0,
      loan: null, creditSchedules: [], favoriteAccounts: [], earnedBadges: [],
    }});
    refreshAll();
  };
  const addBadge = async (b) => { await apiPost({ type: "badge_upsert", adminKey, badge: { id: Date.now(), ...b } }); refreshAll(); };
  const deleteBadge = async (id) => { await apiPost({ type: "badge_delete", adminKey, id }); refreshAll(); };
  const togglePause = async () => { await apiPost({ type: "game_state", adminKey, state: { ...gameState, gamePaused: !gameState.gamePaused } }); refreshAll(); };
  const skipNight = async () => { let { day, hour, minute } = gameState; let total = hour * 60 + minute + 720; const dayAdd = Math.floor(total / 1440); total %= 1440; await apiPost({ type: "game_state", adminKey, state: { ...gameState, day: day + dayAdd, hour: Math.floor(total / 60), minute: total % 60 } }); refreshAll(); };
  const publishAnnouncement = async () => { await apiPost({ type: "game_state", adminKey, state: { ...gameState, announcement: announcementDraft } }); refreshAll(); };
  const factoryReset = async () => { await apiPost({ type: "factory_reset", adminKey }); setShowResetConfirm(false); setResetPhrase(""); refreshAll(); };

  const TABS = [
    { key: "overview", label: "ภาพรวม", icon: LayoutDashboard },
    { key: "time", label: "เวลาเกม", icon: Clock },
    { key: "topups", label: "คำขอเติมเงิน", icon: Wallet, badge: pending.length },
    { key: "loans", label: "เงินกู้", icon: Banknote, badge: pendingLoans.length },
    { key: "users", label: "ผู้ใช้", icon: Users },
    { key: "badges", label: "เหรียญ", icon: Award },
    { key: "announcement", label: "ประกาศ", icon: Megaphone },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-amber-50" style={{ fontFamily: "Prompt, sans-serif" }}>
        <style>{FONT_IMPORT}</style>
        <Loader2 size={28} className="text-orange-500 animate-spin" /> <span className="text-stone-400 text-sm">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto pb-10 bg-amber-50" style={{ fontFamily: "Prompt, sans-serif" }}>
      <style>{FONT_IMPORT}</style>
      <div className="sticky top-0 z-30 bg-white border-b-2 border-orange-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="font-bold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>🐷 JiwPay แอดมิน</div>
            <button onClick={refreshAll} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border-2 border-orange-100 text-xs font-semibold text-stone-600"><RefreshCw size={13} /> รีเฟรช</button>
          </div>
          <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
            {TABS.map((t) => {
              const Icon = t.icon; const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-semibold border-2 ${active ? "bg-orange-500 border-orange-600 text-white" : "bg-white border-orange-100 text-stone-500"}`}>
                  <Icon size={16} /> {t.label}
                  {!!t.badge && <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${active ? "bg-white text-orange-600" : "bg-pink-100 text-pink-600"}`}>{t.badge}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        {tab === "overview" && (
          <div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="ผู้ใช้ทั้งหมด" value={users.length} icon={Users} tone="orange" />
              <StatCard label="ยอดเงินรวมในระบบ" value={`${totalBalance.toLocaleString()} ฿`} icon={Wallet} tone="teal" />
              <StatCard label="คำขอรอตรวจ" value={pending.length + pendingLoans.length} icon={Clock} tone="pink" />
              <StatCard label="ธุรกรรมทั้งหมด" value={transactions.length} icon={TrendingUp} tone="amber" />
            </div>
            <div className="mt-6 bg-white rounded-2xl border-2 border-orange-100 p-4 sm:p-5">
              <h3 className="font-semibold text-stone-800 mb-3" style={{ fontFamily: "Mitr, sans-serif" }}>กิจกรรมล่าสุด</h3>
              <div className="divide-y divide-orange-50">
                {transactions.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg">{Number(t.fromId) === 0 ? "🏦" : "👤"}</div>
                    <div className="flex-1 min-w-0 text-sm"><span className="font-semibold text-stone-800">{fmtAccount(String(t.fromId))}</span><span className="text-stone-400"> → {fmtAccount(String(t.toId))}</span><div className="text-xs text-stone-400">{t.type} · {t.memo} · วันที่ {t.day}</div></div>
                    <div className="font-bold text-sm text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{Number(t.amount).toLocaleString()}฿</div>
                  </div>
                ))}
                {transactions.length === 0 && <div className="text-center text-stone-400 text-sm py-6">ยังไม่มีธุรกรรม</div>}
              </div>
            </div>
            <div className="mt-6 bg-white rounded-2xl border-2 border-pink-200 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2 text-pink-600 font-semibold" style={{ fontFamily: "Mitr, sans-serif" }}><AlertTriangle size={18} /> เขตอันตราย</div>
              <p className="text-xs text-stone-400 mb-3">ล้างข้อมูลทั้งหมดกลับสู่ค่าเริ่มต้น — ลบทุกชีตยกเว้นหัวตาราง</p>
              <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pink-500 text-white text-sm font-semibold"><RotateCcw size={15} /> เริ่มเกมใหม่ (Factory Reset)</button>
            </div>
          </div>
        )}

        {tab === "time" && gameState && (
          <div>
            <h2 className="font-semibold text-xl text-stone-800 mb-1" style={{ fontFamily: "Mitr, sans-serif" }}>ระบบจัดการเวลาในเกม</h2>
            <div className="bg-white rounded-2xl border-2 border-orange-100 p-5 text-center mb-4">
              <div className="font-bold text-3xl text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{String(gameState.hour).padStart(2, "0")}:{String(gameState.minute).padStart(2, "0")} น.</div>
              <div className="text-sm font-semibold text-orange-600 mt-1">วันที่ {gameState.day}</div>
              {gameState.gamePaused && <div className="mt-2 inline-block text-xs font-bold text-pink-600 bg-pink-50 px-3 py-1 rounded-full">⏸️ หยุดชั่วคราว</div>}
            </div>
            <button onClick={togglePause} className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-white mb-4 ${gameState.gamePaused ? "bg-teal-500" : "bg-stone-800"}`} style={{ fontFamily: "Mitr, sans-serif" }}>
              {gameState.gamePaused ? <><Play size={18} /> เล่นต่อ</> : <><Pause size={18} /> หยุดเกมชั่วคราว</>}
            </button>
            <button onClick={skipNight} className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-white bg-orange-500"><SkipForward size={18} /> ข้ามคืน (+12 ชม.)</button>
            <p className="text-xs text-stone-400 mt-3">💡 ค่าเช่า/ดอกเบี้ย/ค่าปรับเงินกู้จะคำนวณอัตโนมัติทุกวันผ่าน Apps Script trigger (runDailyRollover) — ปุ่มด้านบนแค่ปรับนาฬิกาที่แสดงผลเท่านั้น</p>
          </div>
        )}

        {tab === "topups" && (
          <div>
            <h2 className="font-semibold text-xl text-stone-800 mb-4" style={{ fontFamily: "Mitr, sans-serif" }}>คำขอเติมเงิน</h2>
            <div className="space-y-2.5">
              {pending.map((r) => {
                const u = users.find((x) => String(x.id) === String(r.userId));
                return (
                  <div key={r.id} className="bg-white border-2 border-orange-100 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl shrink-0">{u?.avatar}</div>
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-stone-800">{u?.name}</div><div className="text-[11px] text-stone-400">{r.reason} · วันที่ {r.day}</div><div className="font-bold text-orange-600" style={{ fontFamily: "Mitr, sans-serif" }}>ขอเติม {Number(r.amount).toLocaleString()} ฿</div></div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => topupDecision(r.id, "approved")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold"><CheckCircle2 size={13} /> อนุมัติ</button>
                      <button onClick={() => topupDecision(r.id, "rejected")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-50 border-2 border-pink-200 text-pink-600 text-xs font-semibold"><XCircle size={13} /> ปฏิเสธ</button>
                    </div>
                  </div>
                );
              })}
              {pending.length === 0 && <div className="text-center text-stone-400 text-sm py-8 bg-white rounded-2xl border-2 border-orange-100">ไม่มีคำขอที่รอตรวจสอบ 🎉</div>}
            </div>
          </div>
        )}

        {tab === "loans" && (
          <div>
            <h2 className="font-semibold text-xl text-stone-800 mb-4" style={{ fontFamily: "Mitr, sans-serif" }}>คำขอกู้เงิน</h2>
            <div className="space-y-2.5">
              {pendingLoans.map((r) => {
                const u = users.find((x) => String(x.id) === String(r.userId));
                return (
                  <div key={r.id} className="bg-white border-2 border-orange-100 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl shrink-0">{u?.avatar}</div>
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-stone-800">{u?.name}</div><div className="text-[11px] text-stone-400">{r.days} วัน · ดอกเบี้ย {Math.round(r.rate * 100)}%</div><div className="font-bold text-orange-600" style={{ fontFamily: "Mitr, sans-serif" }}>ขอกู้ {Number(r.amount).toLocaleString()} ฿</div></div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => loanDecision(r.id, "approved")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold"><CheckCircle2 size={13} /> อนุมัติ</button>
                      <button onClick={() => loanDecision(r.id, "rejected")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-pink-50 border-2 border-pink-200 text-pink-600 text-xs font-semibold"><XCircle size={13} /> ปฏิเสธ</button>
                    </div>
                  </div>
                );
              })}
              {pendingLoans.length === 0 && <div className="text-center text-stone-400 text-sm py-8 bg-white rounded-2xl border-2 border-orange-100">ไม่มีคำขอกู้เงินที่รอตรวจ</div>}
            </div>
          </div>
        )}

        {tab === "users" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-xl text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>จัดการผู้ใช้</h2>
              <button onClick={() => setShowCreateAccount(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold"><UserPlus size={16} /> สร้างบัญชี</button>
            </div>
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อร้านหรือเลขบัญชี" className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" />
            </div>
            <div className="bg-white rounded-2xl border-2 border-orange-100 overflow-hidden">
              {filteredUsers.map((u, i) => (
                <div key={u.id} className={`p-4 ${i !== 0 ? "border-t border-orange-50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center text-xl shrink-0">{u.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-stone-800 truncate flex items-center gap-1.5">{u.name} {!u.qrEnabled && <ShieldOff size={13} className="text-pink-500" />}</div>
                      <div className="text-xs text-stone-400">เลขบัญชี {fmtAccount(u.account)} · บัตร v{u.qrVersion}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold ${u.negative ? "text-pink-500" : "text-stone-800"}`} style={{ fontFamily: "Mitr, sans-serif" }}>{Number(u.balance).toLocaleString()} ฿</div>
                      <div className="text-[10px] text-teal-600 font-medium">กระปุก {Number(u.piggy || 0).toLocaleString()} ฿</div>
                      {u.hasCreditCard && <div className="text-[10px] text-stone-500 font-medium">เครดิต {Number(u.availableCredit || 0).toLocaleString()}/{Number(u.creditLimit || 0).toLocaleString()} ฿</div>}
                      <button onClick={() => setEditUser(u)} className="text-xs font-semibold text-orange-600 mt-1">แก้ไขยอดเงิน</button>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => toggleQr(u)} className={`flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-xs font-semibold ${u.qrEnabled ? "bg-pink-50 text-pink-600 border-2 border-pink-200" : "bg-teal-50 text-teal-600 border-2 border-teal-200"}`}>{u.qrEnabled ? <><ShieldOff size={13} /> ระงับ QR</> : <><ShieldCheck size={13} /> เปิดใช้งาน QR</>}</button>
                    <button onClick={() => reissueQr(u)} className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-xs font-semibold bg-stone-50 text-stone-600 border-2 border-stone-200"><QrCode size={13} /> ออกบัตรใหม่</button>
                  </div>
                  <button onClick={() => issueCreditCard(u)} className="w-full flex items-center justify-center gap-1.5 mt-2 py-2 rounded-lg text-xs font-semibold bg-stone-800 text-white">
                    <Banknote size={13} /> {u.hasCreditCard ? `คำนวณวงเงินใหม่ (${Math.floor((u.piggy || 0) * 0.5).toLocaleString()} ฿)` : "ออกบัตรเครดิต (50% ของกระปุก)"}
                  </button>
                  <div className="flex items-center gap-2 mt-2 bg-amber-50 border-2 border-amber-100 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-stone-600 shrink-0">💸 ค่าเช่ารายวัน</span>
                    <input defaultValue={u.dailyRent || 0} onBlur={(e) => setDailyRent(u, Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} inputMode="numeric" className="flex-1 min-w-0 px-2 py-1 rounded-md border border-amber-200 text-sm font-bold text-center outline-none bg-white" style={{ fontFamily: "Mitr, sans-serif" }} />
                    <span className="text-xs text-stone-400 shrink-0">฿/วัน</span>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && <div className="text-center text-stone-400 text-sm py-8">ไม่พบผู้ใช้</div>}
            </div>
          </div>
        )}

        {tab === "badges" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-xl text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>จัดการเหรียญรางวัล</h2>
              <button onClick={() => setShowAddBadge(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold"><Plus size={16} /> เพิ่มเหรียญ</button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {badges.map((b) => (
                <div key={b.id} className="bg-white rounded-2xl border-2 border-orange-100 p-4">
                  <div className="flex items-start justify-between"><div className="text-3xl">{b.icon}</div><button onClick={() => deleteBadge(b.id)} className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center text-pink-500"><Trash2 size={14} /></button></div>
                  <div className="font-semibold text-stone-800 text-sm mt-3" style={{ fontFamily: "Mitr, sans-serif" }}>{b.label}</div>
                  <div className="text-xs text-stone-400 mt-1">{b.criteria}</div>
                  <div className="text-[10px] text-orange-500 font-semibold mt-2 bg-orange-50 inline-block px-2 py-0.5 rounded-full">{b.conditionType} ≥ {b.threshold}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "announcement" && gameState && (
          <div>
            <h2 className="font-semibold text-xl text-stone-800 mb-4" style={{ fontFamily: "Mitr, sans-serif" }}>ระบบประกาศ</h2>
            <div className="bg-white rounded-2xl border-2 border-orange-100 p-5">
              <div className="text-xs font-semibold text-stone-500 mb-1.5">ประกาศปัจจุบัน</div>
              <div className="rounded-xl bg-stone-800 text-white text-sm px-4 py-3 mb-4">📢 {gameState.announcement || "(ยังไม่มีข้อความ)"}</div>
              <textarea value={announcementDraft} onChange={(e) => setAnnouncementDraft(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300 mb-3" />
              <button onClick={publishAnnouncement} className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm">เผยแพร่ประกาศ</button>
            </div>
          </div>
        )}
      </div>

      {editUser && <Modal title={`แก้ไขยอดเงิน · ${editUser.name}`} onClose={() => setEditUser(null)}><BalanceEditor user={editUser} onApply={(delta) => { adjustBalance(editUser.id, delta); setEditUser(null); }} /></Modal>}
      {showAddBadge && <AddBadgeModal onClose={() => setShowAddBadge(false)} onAdd={(b) => { addBadge(b); setShowAddBadge(false); }} />}
      {showCreateAccount && <CreateAccountModal onClose={() => setShowCreateAccount(false)} onCreate={(f) => { createAccount(f); setShowCreateAccount(false); }} existingAccounts={users.map((u) => u.account)} />}
      {showResetConfirm && (
        <Modal title="ยืนยันการรีเซ็ตเกม" onClose={() => setShowResetConfirm(false)}>
          <div className="flex items-center gap-2 bg-pink-50 border-2 border-pink-300 text-pink-600 rounded-xl px-4 py-3 text-xs font-semibold mb-4"><AlertTriangle size={18} /> การกระทำนี้จะลบข้อมูลทุกชีตทันที ไม่สามารถย้อนกลับได้</div>
          <label className="text-xs font-semibold text-stone-500">พิมพ์คำว่า "ยืนยัน" เพื่อดำเนินการต่อ</label>
          <input value={resetPhrase} onChange={(e) => setResetPhrase(e.target.value)} className="w-full mt-1 mb-4 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" />
          <button disabled={resetPhrase !== "ยืนยัน"} onClick={factoryReset} className="w-full py-3.5 rounded-xl font-semibold text-white disabled:bg-stone-200 bg-pink-500">เริ่มเกมใหม่ (ลบข้อมูลทั้งหมด)</button>
        </Modal>
      )}
    </div>
  );
}

function BalanceEditor({ user, onApply }) {
  const [amount, setAmount] = useState("");
  return (
    <div>
      <div className="flex items-center gap-3 mb-4"><div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-2xl">{user.avatar}</div><div><div className="text-sm font-semibold text-stone-800">{user.name}</div><div className="text-xs text-stone-400">ยอดปัจจุบัน {Number(user.balance).toLocaleString()} ฿</div></div></div>
      <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" inputMode="numeric" className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 text-lg font-semibold outline-none focus:border-orange-300 mb-4" style={{ fontFamily: "Mitr, sans-serif" }} />
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onApply(Number(amount) || 0)} className="py-3 rounded-xl bg-teal-500 text-white font-semibold text-sm flex items-center justify-center gap-1.5"><Plus size={15} /> เพิ่มยอดเงิน</button>
        <button onClick={() => onApply(-(Number(amount) || 0))} className="py-3 rounded-xl bg-pink-50 border-2 border-pink-200 text-pink-600 font-semibold text-sm">หักยอดเงิน</button>
      </div>
    </div>
  );
}

function AddBadgeModal({ onClose, onAdd }) {
  const [b, setB] = useState({ icon: "🏅", label: "", criteria: "", conditionType: "sales", threshold: 5 });
  return (
    <Modal title="เพิ่มเหรียญรางวัลใหม่" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="text-xs font-semibold text-stone-500">ไอคอน (อีโมจิ)</label><input value={b.icon} onChange={(e) => setB((x) => ({ ...x, icon: e.target.value }))} className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-lg outline-none focus:border-orange-300" /></div>
        <div><label className="text-xs font-semibold text-stone-500">ชื่อเหรียญ</label><input value={b.label} onChange={(e) => setB((x) => ({ ...x, label: e.target.value }))} className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        <div><label className="text-xs font-semibold text-stone-500">เงื่อนไข (คำอธิบาย)</label><input value={b.criteria} onChange={(e) => setB((x) => ({ ...x, criteria: e.target.value }))} className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        <div>
          <label className="text-xs font-semibold text-stone-500">ประเภทเงื่อนไข</label>
          <select value={b.conditionType} onChange={(e) => setB((x) => ({ ...x, conditionType: e.target.value }))} className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300">
            <option value="sales">ยอดขาย (จำนวนครั้ง)</option>
            <option value="spending">ยอดใช้จ่ายสะสม</option>
            <option value="savings">ยอดออมในกระปุก</option>
            <option value="top_daily_seller">ขายดีที่สุดประจำวัน</option>
          </select>
        </div>
        <div><label className="text-xs font-semibold text-stone-500">เกณฑ์ขั้นต่ำ</label><input value={b.threshold} onChange={(e) => setB((x) => ({ ...x, threshold: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }))} inputMode="numeric" className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        <button onClick={() => b.label.trim() && onAdd(b)} className="w-full mt-2 py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm">บันทึกเหรียญ</button>
      </div>
    </Modal>
  );
}

function CreateAccountModal({ onClose, onCreate, existingAccounts }) {
  const [form, setForm] = useState({ fullName: "", idCard: "", shopName: "", account: "", password: "" });
  const [error, setError] = useState("");
  const submit = () => {
    if (!form.fullName || !form.shopName || !form.password) return setError("กรุณากรอกข้อมูลให้ครบ");
    if (form.idCard.length !== 13) return setError("เลขบัตรประชาชนจำลองต้องมี 13 หลัก");
    if (form.account.length !== 6) return setError("เลขบัญชีต้องมี 6 หลัก");
    if (existingAccounts.includes(form.account)) return setError("เลขบัญชีนี้ถูกใช้แล้ว");
    onCreate(form);
  };
  return (
    <Modal title="สร้างบัญชีใหม่" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="text-xs font-semibold text-stone-500">ชื่อ-นามสกุลเจ้าของบัญชี</label><input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        <div><label className="text-xs font-semibold text-stone-500">เลขบัตรประชาชนจำลอง (13 หลัก)</label><input value={form.idCard} onChange={(e) => setForm((f) => ({ ...f, idCard: e.target.value.replace(/[^0-9]/g, "").slice(0, 13) }))} inputMode="numeric" className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        <div><label className="text-xs font-semibold text-stone-500">ชื่อร้าน / ชื่อเล่น</label><input value={form.shopName} onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))} className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        <div><label className="text-xs font-semibold text-stone-500">เลขบัญชี (6 หลัก)</label><input value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} inputMode="numeric" className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        <div><label className="text-xs font-semibold text-stone-500">รหัสผ่านเริ่มต้น</label><input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full mt-1 px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" /></div>
        {error && <div className="text-xs text-pink-500 font-medium">{error}</div>}
        <button onClick={submit} className="w-full mt-2 py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm">สร้างบัญชี</button>
      </div>
    </Modal>
  );
}
