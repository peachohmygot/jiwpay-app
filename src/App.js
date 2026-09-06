import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Home, Send, QrCode, History, ChevronLeft, CheckCircle2, XCircle,
  Lock, Award, Wallet, ArrowUpRight, ArrowDownLeft, Sparkles, Camera,
  Plus, ChevronDown, Clock, TrendingUp, RefreshCw, Star, AlertTriangle,
  LogOut, KeyRound, Banknote, CreditCard, Wifi, Loader2, Download,
} from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Mitr:wght@500;600;700&family=Prompt:wght@400;500;600;700&display=swap');`;

/* =============================================================
   PRODUCTION CLIENT — no mock data, no simulate buttons.
   Every read/write goes through the Google Apps Script backend
   (jiwpay-backend-v3.gs). Paste your deployed /exec URL below.
   ============================================================= */
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbyPM1-Dqf-Fx4o5UOYLtR2T9ArbveG2lPSvyV4I_wMSFz6UB0UU99k5EuTc5t4SsBZpLQ/exec";

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE_URL}?${qs}`);
  return res.json();
}
async function apiPost(body) {
  // text/plain avoids a CORS preflight against Apps Script's web app endpoint
  const res = await fetch(API_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ---------------- helpers ---------------- */

const pad = (n) => String(n).padStart(2, "0");
const fmtGameTime = (t) => (t ? `${t.hour >= 6 && t.hour < 18 ? "🌞" : "🌙"} วันที่ ${t.day} - ${pad(t.hour)}:${pad(t.minute)} น.` : "");
const fmtAccount = (acc) => (acc ? `${String(acc).slice(0, 3)}-${String(acc).slice(3)}` : "");

function playChime(kind = "success") {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const notes = kind === "success" ? [523.25, 659.25, 783.99] : kind === "error" ? [300, 220] : [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + i * 0.09 + 0.3);
    });
  } catch (e) {}
}

// ---- Smart QR payload helpers (shared by generation + scanning) ----
function buildPayPayload(account, amount) {
  const payload = { action: "pay", account: String(account) };
  if (amount !== undefined && amount !== null && Number(amount) > 0) payload.amount = Number(amount);
  return JSON.stringify(payload);
}
function decodeScanPayload(raw) {
  try {
    const obj = JSON.parse(raw);
    const acc = obj && (obj.account ?? obj.merchant_account);
    if (acc) {
      return { account: String(acc).replace(/[^0-9]/g, ""), amount: obj.amount != null && Number(obj.amount) > 0 ? String(Math.floor(Number(obj.amount))) : null };
    }
  } catch (e) { /* not JSON — treat as a plain account number */ }
  return { account: String(raw).replace(/[^0-9]/g, ""), amount: null };
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return { ok: true };
  } catch (err) {
    window.open(url, "_blank");
    return { ok: false, fallback: true };
  }
}

function milestoneRange(v) {
  const list = [0, 100, 500, 1000, 5000];
  while (list[list.length - 1] <= v) list.push(list[list.length - 1] * 5);
  for (let i = 1; i < list.length; i++) if (v < list[i]) return { base: list[i - 1], next: list[i] };
  return { base: 0, next: 100 };
}
function creditTodayDue(user) {
  return (user.creditSchedules || []).reduce((sum, s) => (s.daysPaid < s.days ? sum + s.dailyAmount + (s.overdueAmount || 0) : sum), 0);
}
function creditTotalOutstanding(user) {
  return (user.creditSchedules || []).reduce((sum, s) => (s.daysPaid < s.days ? sum + (s.days - s.daysPaid) * s.dailyAmount + (s.overdueAmount || 0) : sum), 0);
}

const LOAN_PLANS = [
  { days: 3, rate: 0.1, label: "กู้ 3 วัน ดอกเบี้ย 10%" },
  { days: 5, rate: 0.2, label: "กู้ 5 วัน ดอกเบี้ย 20%" },
];

/* ---------------- real QR generation (api.qrserver.com) ---------------- */

function SmartQrImage({ payload, size = 160, accountLabel }) {
  const [broken, setBroken] = useState(false);
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      {broken ? (
        <div className="rounded-xl bg-white border-2 border-dashed border-stone-300 flex flex-col items-center justify-center gap-1" style={{ width: size, height: size }}>
          <QrCode size={size * 0.3} className="text-stone-300" />
          <div className="text-[9px] text-stone-400 px-2 text-center">โหลด QR ไม่สำเร็จ ลองใหม่อีกครั้ง</div>
        </div>
      ) : (
        <img src={src} alt="Smart QR" width={size} height={size} className="rounded-xl bg-white" onError={() => setBroken(true)} />
      )}
      {accountLabel && <div className="text-[10px] font-mono tracking-widest text-stone-400">{accountLabel}</div>}
    </div>
  );
}

/* ---------------- real camera QR decoding (jsQR loaded from a CDN) ---------------- */
// No QR-decoder package is available in this build environment, so jsQR
// (a small, dependency-free decoder) is loaded from a CDN at runtime — the
// same way the QR *image* already comes from an external API. If that CDN
// is unreachable, decoding simply never becomes available; the UI says so
// rather than faking a result.
function useJsQR() {
  const [status, setStatus] = useState(window.jsQR ? "ready" : "loading");
  useEffect(() => {
    if (window.jsQR) { setStatus("ready"); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    script.async = true;
    script.onload = () => setStatus("ready");
    script.onerror = () => setStatus("failed");
    document.head.appendChild(script);
    const timeout = setTimeout(() => setStatus((s) => (s === "loading" ? "failed" : s)), 6000);
    return () => clearTimeout(timeout);
  }, []);
  return status; // "loading" | "ready" | "failed"
}

// Strict, camera-only, continuously-scanning QR reader. No manual input, no
// simulate button — it decodes real video frames via jsQR the moment a QR
// code is in view, and calls onDetect(text) exactly once per successful read.
function CameraPreview({ accent, onDetect, fallbackText }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
  const [status, setStatus] = useState("requesting"); // requesting | live | denied | unsupported
  const [attempt, setAttempt] = useState(0);
  const jsQrStatus = useJsQR();
  const scanningRef = useRef(true);

  useEffect(() => {
    let stream;
    setStatus("requesting");
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("unsupported"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
        setStatus("live");
      })
      .catch(() => setStatus("denied"));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [attempt]);

  useEffect(() => {
    if (status !== "live" || jsQrStatus !== "ready") return;
    scanningRef.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let rafId;
    const tick = () => {
      if (!scanningRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (code && code.data) {
          scanningRef.current = false;
          onDetect(code.data);
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => { scanningRef.current = false; if (rafId) cancelAnimationFrame(rafId); };
  }, [status, jsQrStatus, onDetect]);

  if (status !== "live") {
    return (
      <div className={`w-52 h-52 rounded-2xl bg-stone-900 border-4 border-dashed flex flex-col items-center justify-center gap-2 ${accent}`}>
        <Camera size={40} className="opacity-60 text-stone-300" />
        <div className="text-[11px] text-center px-5 text-stone-300 font-semibold">
          {status === "requesting" ? "กำลังขอสิทธิ์ใช้กล้อง..." : (fallbackText || "ไม่มีสิทธิ์ใช้กล้อง กรุณาใช้เมนูโอนเงินแทน")}
        </div>
        {status !== "requesting" && (
          <button onClick={() => setAttempt((a) => a + 1)} className="mt-1 text-[11px] font-semibold text-amber-400 underline">ลองขอสิทธิ์กล้องอีกครั้ง</button>
        )}
      </div>
    );
  }
  return (
    <div className="w-52 h-52 rounded-2xl overflow-hidden relative">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <div className={`absolute inset-3 rounded-xl border-4 border-dashed pointer-events-none ${accent}`} />
      <div className="absolute bottom-2 left-2 right-2 py-1.5 rounded-lg bg-black/50 text-white text-[10px] text-center font-semibold">
        {jsQrStatus === "ready" ? "กำลังสแกน..." : jsQrStatus === "failed" ? "โหลดตัวสแกนไม่สำเร็จ ลองรีเฟรชหน้า" : "กำลังเตรียมตัวสแกน..."}
      </div>
    </div>
  );
}

/* ---------------- shared UI bits ---------------- */

const LOGO_URL = "https://i.postimg.cc/T2Z6xTkR/Untitled48-20260902112016.png";
function JiwPayLogo() {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {broken ? (
        <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-2xl shrink-0">🐷</div>
      ) : (
        <img src={LOGO_URL} alt="JiwPay Logo" className="w-12 h-12 object-contain" onError={() => setBroken(true)} />
      )}
      <div className="leading-tight">
        <div className="font-bold text-stone-800 text-lg -mb-0.5" style={{ fontFamily: "Mitr, sans-serif" }}>JiwPay</div>
        <div className="text-[11px] text-orange-500 font-semibold">จิ๋วเปย์</div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-stone-900/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{title}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center"><XCircle size={18} className="text-stone-600" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Confetti({ show }) {
  const pieces = useRef(
    Array.from({ length: 42 }, (_, i) => ({
      id: i, left: Math.random() * 100, delay: Math.random() * 0.4, duration: 2 + Math.random() * 1.2,
      color: ["#FF9142", "#FF6B9D", "#3FC7B8", "#FFC94D", "#7C6BFF"][i % 5], size: 6 + Math.random() * 6, rotate: Math.random() * 360,
    }))
  ).current;
  if (!show) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[80]">
      {pieces.map((p) => (
        <span key={p.id} style={{ position: "absolute", top: -20, left: `${p.left}%`, width: p.size, height: p.size * 0.6, background: p.color, borderRadius: 2, transform: `rotate(${p.rotate}deg)`, animation: `jp-fall ${p.duration}s ${p.delay}s ease-in forwards` }} />
      ))}
    </div>
  );
}

function Chip({ children, active, onClick, disabled }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={`font-semibold text-sm px-4 py-2.5 rounded-full border-2 whitespace-nowrap disabled:opacity-40 ${active ? "bg-orange-500 border-orange-600 text-white" : "bg-white border-orange-100 text-stone-600"}`}>
      {children}
    </button>
  );
}

function Accordion({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="bg-white rounded-2xl border-2 border-orange-100 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3.5">
        <span className="font-semibold text-sm text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{title}</span>
        <ChevronDown size={17} className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-orange-50">{children}</div>}
    </div>
  );
}

function PinDots({ value, length = 4 }) {
  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length }).map((_, i) => (
        <div key={i} className={`w-4 h-4 rounded-full border-2 ${i < value.length ? "bg-orange-500 border-orange-500" : "border-stone-300"}`} />
      ))}
    </div>
  );
}

function PinPad({ onDigit, onDelete }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-4 justify-items-center w-fit mx-auto">
      {keys.map((k, i) => (
        <button key={i} disabled={!k} onClick={() => (k === "⌫" ? onDelete() : k && onDigit(k))}
          className={`w-16 h-16 rounded-full flex items-center justify-center font-semibold text-lg ${k ? "bg-white border-2 border-orange-100 text-stone-700" : "invisible"}`}
          style={{ fontFamily: "Mitr, sans-serif" }}>
          {k}
        </button>
      ))}
    </div>
  );
}

/* ================= ROOT APP ================= */
// Production CLIENT-ONLY build — no admin mode, no mock data. Everything
// comes from the Google Apps Script backend (jiwpay-backend-v3.gs). A
// separate admin build talks to the same backend independently.

export default function App() {
  const [screen, setScreen] = useState("login"); // login | setpin | lock | app
  const [currentUser, setCurrentUser] = useState(null);
  const [rememberedAccount, setRememberedAccount] = useState(null);

  const [transactions, setTransactions] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loanRequests, setLoanRequests] = useState([]);
  const [badges, setBadges] = useState([]);
  const [announcement, setAnnouncement] = useState("");
  const [gameTime, setGameTime] = useState(null);
  const [directory, setDirectory] = useState({});
  const [loadingApp, setLoadingApp] = useState(false);

  const [toast, setToast] = useState(null);
  const [confetti, setConfetti] = useState(false);

  const notify = (payload) => {
    setToast(payload);
    setConfetti(payload.kind !== "error");
    playChime(payload.kind === "error" ? "error" : "success");
    setTimeout(() => setConfetti(false), 2400);
    setTimeout(() => setToast(null), 4200);
  };

  const lookupAccount = useCallback(async (account) => {
    if (directory[account]) return directory[account];
    const res = await apiGet({ lookupAccount: account });
    if (res.ok) { setDirectory((prev) => ({ ...prev, [account]: res.user })); return res.user; }
    return null;
  }, [directory]);

  const refreshMe = useCallback(async (account) => {
    const acc = account || currentUser?.account;
    if (!acc) return;
    const [meRes, txRes, topupRes, loanRes] = await Promise.all([
      apiGet({ sheet: "Users", userId: acc }),
      apiGet({ sheet: "Transactions", userId: acc }),
      apiGet({ sheet: "Topups", userId: acc }),
      apiGet({ sheet: "LoanRequests", userId: acc }),
    ]);
    if (meRes.ok && meRes.rows[0]) setCurrentUser(meRes.rows[0]);
    if (txRes.ok) setTransactions(txRes.rows.sort((a, b) => (b.loggedAt || "").localeCompare(a.loggedAt || "")));
    if (topupRes.ok) setTopups(topupRes.rows);
    if (loanRes.ok) setLoanRequests(loanRes.rows);
  }, [currentUser]);

  const refreshPublic = useCallback(async () => {
    const [badgeRes, gsRes] = await Promise.all([apiGet({ sheet: "Badges" }), apiGet({ sheet: "GameState" })]);
    if (badgeRes.ok) setBadges(badgeRes.rows);
    if (gsRes.ok && gsRes.rows[0]) { setGameTime(gsRes.rows[0]); setAnnouncement(gsRes.rows[0].announcement || ""); }
  }, []);

  useEffect(() => { refreshPublic(); }, [refreshPublic]);

  const doLogin = async (account, password) => {
    setLoadingApp(true);
    try {
      const res = await apiPost({ type: "login", account, password });
      if (!res.ok) return { error: res.error || "เข้าสู่ระบบไม่สำเร็จ" };
      setCurrentUser(res.user);
      await refreshMe(res.user.account);
      if (!res.user.pin) { setScreen("setpin"); return { ok: true }; }
      setRememberedAccount(res.user.account);
      setScreen("unlocked");
      return { ok: true };
    } catch (err) {
      return { error: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่" };
    } finally {
      setLoadingApp(false);
    }
  };
  const doSetPin = async (pin) => {
    await apiPost({ type: "user_self_update", user: { id: currentUser.id, pin } });
    setCurrentUser((u) => ({ ...u, pin }));
    setRememberedAccount(currentUser.account);
    setScreen("unlocked");
  };
  const doUnlock = (pin) => {
    if (!currentUser || String(currentUser.pin) !== String(pin)) return { error: "รหัส PIN ไม่ถูกต้อง" };
    setScreen("unlocked");
    return { ok: true };
  };
  const doLock = () => setScreen("lock");
  const doLogout = () => { setCurrentUser(null); setRememberedAccount(null); setScreen("login"); setTransactions([]); setTopups([]); setLoanRequests([]); };

  const handleTransfer = async ({ recipientAccount, amount, memo }) => {
    const res = await apiPost({ type: "transfer", fromAccount: currentUser.account, toAccount: recipientAccount, amount, memo });
    if (!res.ok) { notify({ kind: "error", title: "❌ ทำรายการไม่สำเร็จ", detail: res.error }); return { error: res.error }; }
    await refreshMe();
    notify({ kind: "pay", title: "💸 ชำระเงินสำเร็จ", detail: `-${amount} บาท` });
    return { ok: true, transaction: res.transaction };
  };

  // Shared by both POS identify methods (NFC tap + camera card scan) — same
  // server action, different way of learning the customer's account.
  const handlePosCashCharge = async (customerAccount, amount) => {
    const res = await apiPost({ type: "transfer", fromAccount: customerAccount, toAccount: currentUser.account, amount, memo: "ชำระเงินหน้าร้าน (POS)" });
    if (!res.ok) { notify({ kind: "error", title: "❌ ทำรายการไม่สำเร็จ", detail: res.error }); return { error: res.error }; }
    await refreshMe();
    notify({ kind: "income", title: "💰 เงินเข้า", detail: `+${amount} บาท` });
    return { ok: true, transaction: res.transaction };
  };
  const handlePosCreditCharge = async (customerAccount, amount, days, planLabel) => {
    const res = await apiPost({ type: "credit_purchase", buyerAccount: customerAccount, merchantAccount: currentUser.account, amount, days, planLabel });
    if (!res.ok) { notify({ kind: "error", title: "❌ ทำรายการไม่สำเร็จ", detail: res.error }); return { error: res.error }; }
    await refreshMe();
    notify({ kind: "income", title: "💰 เงินเข้า", detail: `+${amount} บาท (${planLabel})` });
    return { ok: true, transaction: res.transaction };
  };

  const payCreditBill = async (mode) => {
    const res = await apiPost({ type: "credit_bill_payment", account: currentUser.account, mode });
    if (!res.ok) return { error: res.error };
    await refreshMe();
    notify({ kind: "pay", title: mode === "full" ? "💸 ปิดยอดสำเร็จ" : "💸 ชำระบิลสำเร็จ", detail: `-${res.transaction.amount} บาท` });
    return { ok: true };
  };
  const piggyDeposit = async (amount) => { const res = await apiPost({ type: "piggy_deposit", account: currentUser.account, amount }); if (res.ok) await refreshMe(); return res; };
  const piggyWithdraw = async (amount) => { const res = await apiPost({ type: "piggy_withdraw", account: currentUser.account, amount }); if (res.ok) await refreshMe(); return res; };

  const toggleFavoriteAccount = async (account) => {
    const list = currentUser.favoriteAccounts || [];
    const next = list.includes(account) ? list.filter((a) => a !== account) : [...list, account];
    setCurrentUser((u) => ({ ...u, favoriteAccounts: next }));
    await apiPost({ type: "user_self_update", user: { id: currentUser.id, favoriteAccounts: next } });
  };
  const submitTopup = async ({ amount, reason }) => { await apiPost({ type: "topup_request", userId: currentUser.id, amount, reason }); await refreshMe(); };
  const submitLoanRequest = async ({ amount, plan }) => { await apiPost({ type: "loan_request", userId: currentUser.id, amount, days: plan.days, rate: plan.rate }); await refreshMe(); };

  return (
    <div className="min-h-screen bg-amber-50" style={{ fontFamily: "Prompt, sans-serif" }}>
      <style>{`
        ${FONT_IMPORT}
        @keyframes jp-fall { to { transform: translateY(680px) rotate(540deg); opacity: 0.2; } }
        @keyframes jp-pop { 0% { transform: scale(0.6); opacity:0; } 70% { transform: scale(1.05); opacity:1;} 100% { transform: scale(1);} }
        @keyframes jp-marquee { 0% { transform: translateX(0%);} 100% { transform: translateX(-50%);} }
        @keyframes jp-slide-down { 0% { transform: translateY(-120%); opacity:0;} 100% { transform: translateY(0); opacity:1;} }
        @keyframes jp-spin { to { transform: rotate(360deg); } }
        @keyframes jp-nfc-pulse { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(1.8); opacity: 0; } }
        .jp-marquee-track { display:inline-flex; animation: jp-marquee 15s linear infinite; }
        .jp-scroll::-webkit-scrollbar { display:none; }
        .jp-spin { animation: jp-spin 0.8s linear infinite; }
        .jp-nfc-ring { animation: jp-nfc-pulse 1.6s ease-out infinite; }
      `}</style>

      {gameTime?.gamePaused && (
        <div className="sticky top-0 z-[99] bg-pink-500 text-white text-center text-sm font-semibold py-2">⏸️ เกมหยุดชั่วคราว</div>
      )}

      <ClientAuthGate screen={screen} currentUser={currentUser} loadingApp={loadingApp}
        onLogin={doLogin} onSetPin={doSetPin} onUnlock={doUnlock} onLock={doLock} onLogout={doLogout}>
        {currentUser && (
          <ClientApp
            currentUser={currentUser} transactions={transactions} topups={topups} loanRequests={loanRequests}
            badges={badges} announcement={announcement} gameTime={gameTime}
            onLookupAccount={lookupAccount}
            onTransfer={handleTransfer}
            onPosCashCharge={handlePosCashCharge} onPosCreditCharge={handlePosCreditCharge}
            onPayCreditBill={payCreditBill}
            onSubmitTopup={submitTopup} onSubmitLoan={submitLoanRequest}
            onPiggyDeposit={piggyDeposit} onPiggyWithdraw={piggyWithdraw}
            onToggleFavorite={toggleFavoriteAccount}
            onRefresh={refreshMe}
            onLock={doLock} onLogout={doLogout}
            confetti={confetti}
          />
        )}
      </ClientAuthGate>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[90] w-[92%] max-w-sm" style={{ animation: "jp-slide-down 0.35s ease" }}>
          <div className={`bg-white rounded-2xl shadow-xl border-2 p-4 flex items-center gap-3 ${toast.kind === "error" ? "border-pink-300" : toast.kind === "pay" ? "border-orange-200" : "border-teal-200"}`}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl ${toast.kind === "error" ? "bg-pink-500" : toast.kind === "pay" ? "bg-orange-500" : "bg-teal-500"}`}>
              {toast.kind === "error" ? <AlertTriangle size={20} className="text-white" /> : <span>{toast.kind === "pay" ? "💸" : "💰"}</span>}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{toast.title}</div>
              <div className="text-xs text-stone-500 truncate">{toast.detail}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= AUTH ================= */

function ClientAuthGate({ screen, currentUser, loadingApp, onLogin, onSetPin, onUnlock, onLock, onLogout, children }) {
  if (screen === "unlocked" && currentUser) return children;
  if (screen === "setpin") return <SetPinScreen user={currentUser} onSetPin={onSetPin} />;
  if (screen === "lock") return <LockScreen user={currentUser} onUnlock={onUnlock} onLogout={onLogout} />;
  return <LoginScreen onLogin={onLogin} loading={loadingApp} />;
}

function LoginScreen({ onLogin, loading }) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => { setSubmitting(true); setError(""); const r = await onLogin(account, password); setSubmitting(false); if (r?.error) setError(r.error); };
  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-center px-6 pb-24">
      <div className="flex justify-center mb-6"><JiwPayLogo /></div>
      <div className="bg-white rounded-3xl border-2 border-orange-100 p-6">
        <div className="font-semibold text-lg text-stone-800 mb-1" style={{ fontFamily: "Mitr, sans-serif" }}>เข้าสู่ระบบ</div>
        <div className="text-xs text-stone-400 mb-5">กรอกเลขบัญชีและรหัสผ่านที่แอดมินให้ไว้</div>
        <label className="text-xs font-semibold text-stone-500">เลขบัญชี 6 หลัก</label>
        <input value={account} onChange={(e) => setAccount(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} inputMode="numeric" placeholder="เช่น 482913" className="w-full mt-1 mb-3 px-4 py-3 rounded-xl border-2 border-orange-100 outline-none focus:border-orange-300 text-sm" />
        <label className="text-xs font-semibold text-stone-500">รหัสผ่าน</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="รหัสผ่าน" className="w-full mt-1 mb-2 px-4 py-3 rounded-xl border-2 border-orange-100 outline-none focus:border-orange-300 text-sm" />
        {error && <div className="text-xs text-pink-500 font-medium mb-3">{error}</div>}
        <button onClick={submit} disabled={submitting || account.length !== 6 || !password} className="w-full mt-2 py-3.5 rounded-xl font-semibold text-white bg-orange-500 disabled:opacity-50 flex items-center justify-center gap-2" style={{ fontFamily: "Mitr, sans-serif" }}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null} เข้าสู่ระบบ
        </button>
      </div>
    </div>
  );
}

function SetPinScreen({ user, onSetPin }) {
  const [stage, setStage] = useState("enter");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const addDigit = (d) => {
    if (stage === "enter") { if (pin.length < 4) { const np = pin + d; setPin(np); if (np.length === 4) setTimeout(() => setStage("confirm"), 200); } }
    else if (confirmPin.length < 4) {
      const np = confirmPin + d; setConfirmPin(np);
      if (np.length === 4) {
        if (np === pin) onSetPin(np);
        else { setError("รหัส PIN ไม่ตรงกัน ลองใหม่อีกครั้ง"); setTimeout(() => { setPin(""); setConfirmPin(""); setStage("enter"); setError(""); }, 900); }
      }
    }
  };
  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-center px-6 pb-24 text-center">
      <div className="flex justify-center mb-4"><KeyRound size={40} className="text-orange-500" /></div>
      <div className="font-semibold text-xl text-stone-800 mb-1" style={{ fontFamily: "Mitr, sans-serif" }}>{stage === "enter" ? "ตั้งรหัส PIN 4 หลัก" : "ยืนยันรหัส PIN อีกครั้ง"}</div>
      <div className="text-xs text-stone-400 mb-6">ใช้สำหรับล็อกหน้าจอในเครื่องนี้ · {user?.name}</div>
      <div className="mb-6"><PinDots value={stage === "enter" ? pin : confirmPin} /></div>
      {error && <div className="text-xs text-pink-500 font-medium mb-3">{error}</div>}
      <PinPad onDigit={addDigit} onDelete={() => (stage === "enter" ? setPin((p) => p.slice(0, -1)) : setConfirmPin((p) => p.slice(0, -1)))} />
    </div>
  );
}

function LockScreen({ user, onUnlock, onLogout }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const addDigit = (d) => {
    if (pin.length >= 4) return;
    const np = pin + d; setPin(np);
    if (np.length === 4) { const r = onUnlock(np); if (r?.error) { setError(r.error); setTimeout(() => { setPin(""); setError(""); }, 700); } }
  };
  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-center px-6 pb-24 text-center">
      <div className="w-20 h-20 rounded-full bg-orange-500 flex items-center justify-center text-4xl mx-auto mb-3">{user?.avatar}</div>
      <div className="font-semibold text-lg text-stone-800 mb-1" style={{ fontFamily: "Mitr, sans-serif" }}>สวัสดี, {user?.name}</div>
      <div className="text-xs text-stone-400 mb-6">ใส่รหัส PIN เพื่อปลดล็อก</div>
      <div className="mb-5"><PinDots value={pin} /></div>
      {error && <div className="text-xs text-pink-500 font-medium mb-3">{error}</div>}
      <PinPad onDigit={addDigit} onDelete={() => setPin((p) => p.slice(0, -1))} />
      <button onClick={onLogout} className="mt-6 mx-auto flex items-center gap-1.5 text-xs font-medium text-stone-400"><LogOut size={13} /> ออกจากระบบ / เปลี่ยนบัญชี</button>
    </div>
  );
}

/* ================= CLIENT APP ================= */

function ClientApp({
  currentUser, transactions, topups, loanRequests, badges, announcement, gameTime,
  onLookupAccount, onTransfer, onPosCashCharge, onPosCreditCharge, onPayCreditBill,
  onSubmitTopup, onSubmitLoan, onPiggyDeposit, onPiggyWithdraw, onToggleFavorite, onRefresh,
  onLock, onLogout, confetti,
}) {
  const [view, setView] = useState("home");
  const [lastTx, setLastTx] = useState(null);
  const [transferLock, setTransferLock] = useState(null); // { recipient }
  const [showPiggy, setShowPiggy] = useState(false);
  const [showPayBill, setShowPayBill] = useState(false);

  const todaySales = transactions.filter((t) => gameTime && t.day === gameTime.day && String(t.toId) === String(currentUser.account) && !["LOAN_RECEIVE", "LOAN_REPAY", "INTEREST", "RENT", "CREDIT_REPAY", "TOPUP"].includes(t.type)).reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="max-w-md mx-auto min-h-screen overflow-y-auto pb-24 relative">
      <Confetti show={confetti} />

      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <JiwPayLogo />
        <div className="flex items-center gap-1.5">
          <div className="text-[11px] font-semibold text-stone-500 bg-white px-2.5 py-1.5 rounded-full border-2 border-orange-100 hidden sm:block">{fmtGameTime(gameTime)}</div>
          <button onClick={onLock} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center shrink-0"><Lock size={15} className="text-stone-600" /></button>
          <button onClick={onLogout} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center shrink-0"><LogOut size={15} className="text-stone-600" /></button>
        </div>
      </div>
      <div className="px-5 text-[11px] font-semibold text-stone-400 sm:hidden -mt-1 mb-1">{fmtGameTime(gameTime)}</div>

      {announcement && (
        <div className="mx-5 mt-1 mb-3 bg-stone-800 text-white rounded-xl overflow-hidden py-2">
          <div className="jp-marquee-track text-xs font-medium"><span className="px-6">📢 {announcement}</span><span className="px-6">📢 {announcement}</span></div>
        </div>
      )}

      {view === "home" && (
        <HomeView user={currentUser} badges={badges} myTx={transactions.slice(0, 3)} todaySales={todaySales}
          onGoTransfer={() => { setTransferLock(null); setView("transfer"); }}
          onGoScanHub={() => setView("scanhub")}
          onGoTopup={() => setView("topup")}
          onGoLoan={() => setView("loan")}
          onGoHistory={() => setView("history")}
          onOpenPiggy={() => setShowPiggy(true)}
          onOpenPayBill={() => setShowPayBill(true)}
        />
      )}

      {view === "scanhub" && (
        <ScanHubView currentUser={currentUser} onLookupAccount={onLookupAccount}
          onBack={() => setView("home")}
          onScanPay={(recipient) => { setTransferLock({ recipient }); setView("transfer"); }}
        />
      )}

      {view === "transfer" && (
        <TransferView currentUser={currentUser} onToggleFavorite={onToggleFavorite} onLookupAccount={onLookupAccount}
          lockedRecipient={transferLock?.recipient}
          onBack={() => { setView(transferLock ? "scanhub" : "home"); setTransferLock(null); }}
          onConfirm={async (payload) => {
            const r = await onTransfer(payload);
            if (r?.ok) { setLastTx({ ...r.transaction, recipientName: payload.recipientName, recipientAvatar: payload.recipientAvatar }); setView("eslip"); setTransferLock(null); }
            return r;
          }}
        />
      )}

      {view === "eslip" && lastTx && <ESlipView currentUser={currentUser} tx={lastTx} onDone={() => setView("home")} />}

      {view === "topup" && <TopupView requests={topups} onBack={() => setView("home")} onSubmit={onSubmitTopup} />}
      {view === "loan" && <LoanView currentUser={currentUser} requests={loanRequests} onBack={() => setView("home")} onSubmit={onSubmitLoan} />}
      {view === "pos" && (
        <PosTerminalView currentUser={currentUser} onLookupAccount={onLookupAccount}
          onCashCharge={onPosCashCharge} onCreditCharge={onPosCreditCharge}
          onBack={() => setView("home")}
        />
      )}
      {view === "history" && <HistoryView currentUser={currentUser} myTx={transactions} onBack={() => setView("home")} onRefresh={onRefresh} />}

      {showPiggy && <PiggyModal user={currentUser} onClose={() => setShowPiggy(false)} onDeposit={onPiggyDeposit} onWithdraw={onPiggyWithdraw} />}
      {showPayBill && <PayBillModal user={currentUser} onClose={() => setShowPayBill(false)} onPay={onPayCreditBill} />}

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t-2 border-orange-100 flex justify-around py-2 z-20">
        {[
          { key: "home", label: "หน้าแรก", icon: Home, go: () => setView("home") },
          { key: "transfer", label: "โอนเงิน", icon: Send, go: () => { setTransferLock(null); setView("transfer"); } },
          { key: "scanhub", label: "สแกน", icon: QrCode, go: () => setView("scanhub") },
          { key: "pos", label: "POS", icon: CreditCard, go: () => setView("pos") },
          { key: "history", label: "ประวัติ", icon: History, go: () => setView("history") },
        ].map((n) => {
          const Icon = n.icon;
          const active = view === n.key;
          return (
            <button key={n.key} onClick={n.go} className="flex flex-col items-center gap-1 px-2">
              <Icon size={20} className={active ? "text-orange-600" : "text-stone-300"} />
              <span className={`text-[10px] ${active ? "font-bold text-orange-600" : "font-medium text-stone-300"}`}>{n.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HomeView({ user, badges, myTx, todaySales, onGoTransfer, onGoScanHub, onGoTopup, onGoLoan, onGoHistory, onOpenPiggy, onOpenPayBill }) {
  const { base, next } = milestoneRange(user.piggy || 0);
  const progress = Math.min(100, Math.round(((user.piggy - base) / (next - base)) * 100));
  const earned = user.earnedBadges || [];
  const [cardIndex, setCardIndex] = useState(0);
  const touchStartX = useRef(null);
  const todayDue = creditTodayDue(user);
  const totalOwed = creditTotalOutstanding(user);
  const usedCreditPct = user.creditLimit > 0 ? Math.round(((user.creditLimit - user.availableCredit) / user.creditLimit) * 100) : 0;
  const earnedBadges = badges.filter((b) => earned.includes(b.id));

  return (
    <div className="px-5">
      <div className="flex items-center gap-3 bg-white rounded-2xl border-2 border-orange-100 p-4">
        <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center text-3xl">{user.avatar}</div>
        <div className="min-w-0">
          <div className="font-semibold text-stone-800 text-base truncate" style={{ fontFamily: "Mitr, sans-serif" }}>{user.name}</div>
          <div className="text-xs text-stone-400">เลขบัญชี {fmtAccount(user.account)}</div>
        </div>
      </div>

      {user.negative && (
        <div className="mt-3 flex items-center gap-2 bg-pink-50 border-2 border-pink-300 text-pink-600 rounded-xl px-4 py-3 text-xs font-semibold">
          <AlertTriangle size={16} /> บัญชีติดลบ {Math.abs(user.balance)} ฿
        </div>
      )}
      {!user.negative && user.loan?.status === "missed" && (
        <div className="mt-3 flex items-center gap-2 bg-amber-50 border-2 border-amber-300 text-amber-700 rounded-xl px-4 py-3 text-xs font-semibold">
          <AlertTriangle size={16} /> ค้างชำระเงินกู้ {user.loan.dailyInstallment} ฿
        </div>
      )}

      <div className="mt-4">
        <div className="overflow-hidden rounded-2xl"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (touchStartX.current === null || !user.hasCreditCard) return; const dx = e.changedTouches[0].clientX - touchStartX.current; if (dx < -40) setCardIndex(1); else if (dx > 40) setCardIndex(0); touchStartX.current = null; }}
          onClick={() => user.hasCreditCard && setCardIndex((i) => (i === 0 ? 1 : 0))}
        >
          <div className="flex transition-transform duration-300" style={{ transform: `translateX(-${cardIndex * 100}%)` }}>
            <div className="w-full shrink-0 rounded-2xl p-5 text-white" style={{ background: user.negative ? "linear-gradient(135deg,#FF6B9D,#E23F6B)" : "linear-gradient(135deg,#FF9142,#F5720E)" }}>
              <div className="text-sm opacity-90">ยอดเงินคงเหลือ</div>
              <div className="font-bold text-4xl mt-1" style={{ fontFamily: "Mitr, sans-serif" }}>{user.balance.toLocaleString()} <span className="text-xl">บาท</span></div>
              <button onClick={(e) => { e.stopPropagation(); onOpenPiggy(); }} className="w-full flex items-center justify-between mt-4 bg-white/20 px-3 py-2 rounded-full text-xs">
                <span className="flex items-center gap-1.5"><Lock size={12} /> กระปุกออมสิน {(user.piggy || 0).toLocaleString()} ฿ · แตะเพื่อฝาก/ถอน</span>
                <Wallet size={16} />
              </button>
              <div className="mt-2 h-1.5 rounded-full bg-white/25 overflow-hidden"><div className="h-full bg-white" style={{ width: `${progress}%` }} /></div>
              <div className="text-[10px] opacity-80 mt-1">เป้าหมายถัดไป {next.toLocaleString()} ฿</div>
            </div>
            {user.hasCreditCard && (
              <div className="w-full shrink-0 rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg,#1c1917,#3D2C1F)" }}>
                <div className="flex items-center justify-between"><div className="text-sm opacity-80">JiwPay Visa</div><div className="text-lg font-bold tracking-wider opacity-90">VISA</div></div>
                <div className="font-bold text-3xl mt-3" style={{ fontFamily: "Mitr, sans-serif" }}>{(user.availableCredit || 0).toLocaleString()} <span className="text-base font-normal opacity-70">฿ วงเงินคงเหลือ</span></div>
                <div className="h-1.5 rounded-full bg-white/20 overflow-hidden mt-2"><div className="h-full bg-amber-400" style={{ width: `${usedCreditPct}%` }} /></div>
                <div className="flex items-center justify-between mt-3 text-xs opacity-80"><span>วงเงินทั้งหมด {(user.creditLimit || 0).toLocaleString()} ฿</span><span>ยอดวันนี้ {todayDue.toLocaleString()} ฿</span></div>
                <button onClick={(e) => { e.stopPropagation(); onOpenPayBill(); }} disabled={totalOwed <= 0} className="w-full mt-4 py-2.5 rounded-full bg-amber-400 text-stone-900 text-sm font-bold disabled:opacity-40" style={{ fontFamily: "Mitr, sans-serif" }}>ชำระบิล</button>
              </div>
            )}
          </div>
        </div>
        {user.hasCreditCard && <div className="flex justify-center gap-1.5 mt-2">{[0, 1].map((i) => (<button key={i} onClick={() => setCardIndex(i)} className={`h-1.5 rounded-full transition-all ${cardIndex === i ? "w-5 bg-orange-500" : "w-1.5 bg-orange-200"}`} />))}</div>}
      </div>

      <div className="mt-3 flex items-center justify-between bg-white rounded-2xl border-2 border-orange-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center"><TrendingUp size={17} className="text-teal-600" /></div>
          <div><div className="text-[11px] text-stone-400">ยอดขายวันนี้</div><div className="font-bold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{todaySales.toLocaleString()} ฿</div></div>
        </div>
      </div>

      <div className="flex justify-around mt-5">
        {[{ icon: Send, label: "โอนเงิน", bg: "bg-pink-500", onClick: onGoTransfer, disabled: user.negative }, { icon: QrCode, label: "สแกน", bg: "bg-teal-500", onClick: onGoScanHub }, { icon: Plus, label: "เติมเงิน", bg: "bg-orange-500", onClick: onGoTopup }].map((a) => {
          const Icon = a.icon;
          return (
            <button key={a.label} disabled={a.disabled} onClick={a.onClick} className="flex flex-col items-center gap-1.5 disabled:opacity-40">
              <div className={`w-14 h-14 rounded-2xl ${a.bg} flex items-center justify-center`}><Icon size={22} className="text-white" /></div>
              <span className="text-xs font-medium text-stone-700">{a.label}</span>
            </button>
          );
        })}
      </div>

      <button disabled={user.negative} onClick={onGoLoan} className="w-full flex items-center justify-center gap-2 mt-4 bg-white border-2 border-orange-100 rounded-2xl py-3 text-sm font-semibold text-stone-700 disabled:opacity-40"><Banknote size={17} className="text-orange-500" /> กู้เงิน</button>

      <div className="mt-5">
        <div className="font-semibold text-sm text-stone-800 mb-2" style={{ fontFamily: "Mitr, sans-serif" }}>เหรียญรางวัล</div>
        {earnedBadges.length === 0 ? <div className="text-xs text-stone-400 italic">ยังไม่มีเหรียญรางวัล</div> : (
          <div className="flex gap-2.5 overflow-x-auto jp-scroll pb-1">
            {earnedBadges.map((b) => (<div key={b.id} className="min-w-[104px] rounded-2xl border-2 p-3 text-center bg-white border-orange-100"><div className="text-2xl">{b.icon}</div><div className="text-[11px] font-medium mt-1 text-stone-700">{b.label}</div></div>))}
          </div>
        )}
      </div>

      <div className="mt-5 mb-4">
        <div className="flex items-center justify-between mb-2"><div className="font-semibold text-sm text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>รายการล่าสุด</div><button onClick={onGoHistory} className="text-xs font-semibold text-orange-600">ดูทั้งหมด</button></div>
        <div className="bg-white rounded-2xl border-2 border-orange-100 overflow-hidden">
          {myTx.map((t, i) => {
            const dir = String(t.toId) === String(user.account) ? "in" : "out";
            const other = dir === "in" ? t.fromId : t.toId;
            return (
              <div key={t.id} className={`flex items-center gap-3 p-3.5 ${i !== 0 ? "border-t border-orange-50" : ""}`}>
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg shrink-0">{Number(other) === 0 ? "🏦" : "👤"}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-stone-800 truncate">{Number(other) === 0 ? "ธนาคารจิ๋วเปย์" : fmtAccount(String(other))}</div><div className="text-[11px] text-stone-400">{t.memo} · วันที่ {t.day} {t.time}</div></div>
                <div className={`text-sm font-bold shrink-0 ${dir === "in" ? "text-teal-600" : "text-pink-500"}`}>{dir === "in" ? "+" : "-"}{Number(t.amount).toLocaleString()}฿</div>
              </div>
            );
          })}
          {myTx.length === 0 && <div className="text-center text-stone-400 text-sm py-6">ยังไม่มีรายการ</div>}
        </div>
      </div>
    </div>
  );
}

function PiggyModal({ user, onClose, onDeposit, onWithdraw }) {
  const [tab, setTab] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { base, next } = milestoneRange(user.piggy || 0);
  const progress = Math.min(100, Math.round(((user.piggy - base) / (next - base)) * 100));
  const submit = async () => { setBusy(true); setError(""); const r = tab === "deposit" ? await onDeposit(Number(amount)) : await onWithdraw(Number(amount)); setBusy(false); if (r?.error) setError(r.error); else onClose(); };
  return (
    <Modal title="กระปุกออมสิน" onClose={onClose}>
      <div className="text-center mb-4">
        <div className="text-3xl mb-1">🐷</div>
        <div className="font-bold text-2xl text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{(user.piggy || 0).toLocaleString()} ฿</div>
        <div className="h-2 rounded-full bg-amber-100 overflow-hidden mt-2"><div className="h-full bg-teal-500" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab("deposit")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${tab === "deposit" ? "bg-orange-500 text-white" : "bg-stone-50 text-stone-500"}`}>ฝากเงิน</button>
        <button disabled={user.negative} onClick={() => setTab("withdraw")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 ${tab === "withdraw" ? "bg-orange-500 text-white" : "bg-stone-50 text-stone-500"}`}>ถอนเงิน</button>
      </div>
      <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" inputMode="numeric" className="w-full text-center text-2xl font-bold outline-none mb-3 text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }} />
      {error && <div className="text-xs text-pink-500 font-medium mb-2 text-center">{error}</div>}
      <button disabled={busy || !amount || Number(amount) <= 0} onClick={submit} className="w-full py-3.5 rounded-xl font-semibold text-white disabled:bg-stone-200" style={{ fontFamily: "Mitr, sans-serif", background: amount ? (tab === "deposit" ? "#3FC7B8" : "#FF9142") : undefined }}>{tab === "deposit" ? "ฝากเข้ากระปุก" : "ถอนออกจากกระปุก"}</button>
    </Modal>
  );
}

function PayBillModal({ user, onClose, onPay }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const due = creditTodayDue(user);
  const total = creditTotalOutstanding(user);
  const pay = async (mode) => { setBusy(true); const r = await onPay(mode); setBusy(false); if (r?.error) setError(r.error); else onClose(); };
  return (
    <Modal title="ชำระบิลบัตรเครดิต" onClose={onClose}>
      <div className="text-center mb-4"><div className="text-xs text-stone-400">เงินสดคงเหลือ {user.balance.toLocaleString()} ฿</div></div>
      {error && <div className="text-xs text-pink-500 font-medium mb-3 text-center">{error}</div>}
      <div className="space-y-3">
        <button disabled={busy} onClick={() => pay("daily")} className="w-full text-left px-4 py-4 rounded-2xl border-2 border-orange-100 disabled:opacity-40">
          <div className="font-semibold text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>จ่ายตามงวด</div>
          <div className="text-xs text-stone-400 mt-1">ชำระเฉพาะยอดที่ครบกำหนดวันนี้ ({due.toLocaleString()} ฿)</div>
        </button>
        <button disabled={busy} onClick={() => pay("full")} className="w-full text-left px-4 py-4 rounded-2xl bg-orange-500 text-white disabled:opacity-40">
          <div className="font-semibold" style={{ fontFamily: "Mitr, sans-serif" }}>ปิดยอดทั้งหมด</div>
          <div className="text-xs opacity-90 mt-1">ชำระยอดค้างทั้งหมด ({total.toLocaleString()} ฿)</div>
        </button>
      </div>
    </Modal>
  );
}

/* ---- Scanner: two sub-tabs — locked-receiver scan-to-pay / static receive QR ---- */

function ScanHubView({ currentUser, onLookupAccount, onBack, onScanPay }) {
  const [tab, setTab] = useState("pay"); // pay | receive
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const handleDetected = useCallback(async (raw) => {
    const decoded = decodeScanPayload(raw);
    if (!decoded.account) return;
    setResolving(true);
    const info = await onLookupAccount(decoded.account);
    setResolving(false);
    if (!info) { setError("ไม่พบบัญชีนี้ในระบบ"); return; }
    onScanPay(info);
  }, [onLookupAccount, onScanPay]);

  const receivePayload = buildPayPayload(currentUser.account); // account only — no amount, a static/permanent code
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(receivePayload)}`;

  const saveImage = async () => {
    setSaveStatus("saving");
    const r = await downloadImage(qrImgUrl, `jiwpay-qr-${currentUser.account}.png`);
    setSaveStatus(r.ok ? "saved" : "opened");
    setTimeout(() => setSaveStatus(""), 2500);
  };

  return (
    <div className="px-5">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button>
        <div className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>สแกน QR</div>
      </div>

      <div className="flex gap-2 mb-4 bg-white p-1.5 rounded-2xl border-2 border-orange-100">
        <button onClick={() => setTab("pay")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${tab === "pay" ? "bg-orange-500 text-white" : "text-stone-500"}`}>สแกนเพื่อจ่าย</button>
        <button onClick={() => setTab("receive")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${tab === "receive" ? "bg-orange-500 text-white" : "text-stone-500"}`}>QR รับเงิน</button>
      </div>

      {tab === "pay" && (
        <div className="rounded-3xl bg-stone-800 p-6 flex flex-col items-center gap-4">
          {resolving ? (
            <div className="w-52 h-52 rounded-2xl bg-stone-900 flex flex-col items-center justify-center gap-2">
              <Loader2 size={32} className="text-amber-400 animate-spin" />
              <div className="text-xs text-stone-300">กำลังตรวจสอบบัญชี...</div>
            </div>
          ) : (
            <CameraPreview accent="border-amber-400" onDetect={handleDetected} fallbackText="ไม่มีสิทธิ์ใช้กล้อง กรุณาใช้เมนูโอนเงินแทน" />
          )}
          <div className="text-white text-xs text-center opacity-80 px-4">วางกล้องให้ตรงกับ QR ของร้านค้าที่จะจ่ายเงินให้ — ระบบจะล็อกบัญชีผู้รับให้อัตโนมัติ คุณจะใส่ได้แค่จำนวนเงิน</div>
          {error && <div className="w-full flex items-center gap-2 bg-pink-500/20 border-2 border-pink-400 text-pink-200 rounded-xl px-4 py-3 text-xs font-semibold"><AlertTriangle size={16} /> {error}</div>}
        </div>
      )}

      {tab === "receive" && (
        <div className="rounded-3xl bg-white border-2 border-orange-100 p-6 flex flex-col items-center gap-4">
          <div className="text-xs text-stone-400 text-center">QR ถาวรสำหรับรับเงินเข้าบัญชีนี้เท่านั้น — ไม่มีจำนวนเงินกำกับ</div>
          <SmartQrImage payload={receivePayload} size={220} accountLabel={fmtAccount(currentUser.account)} />
          <div className="font-semibold text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{currentUser.name}</div>
          <button onClick={saveImage} disabled={saveStatus === "saving"} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white bg-orange-500 disabled:opacity-60" style={{ fontFamily: "Mitr, sans-serif" }}>
            <Download size={17} /> {saveStatus === "saving" ? "กำลังบันทึก..." : "บันทึกรูปภาพ"}
          </button>
          {saveStatus === "saved" && <div className="text-xs text-teal-600 font-semibold">บันทึกรูปภาพแล้ว!</div>}
          {saveStatus === "opened" && <div className="text-xs text-stone-400">เปิดรูปภาพในแท็บใหม่แล้ว — กดค้างที่รูปเพื่อบันทึก</div>}
          <div className="text-[11px] text-stone-400 text-center px-4">💡 พิมพ์ QR นี้ติดไว้หน้าร้านได้เลย ลูกค้าสแกนจ่ายได้ตลอดเวลา</div>
        </div>
      )}
    </div>
  );
}

/* ---- Transfer: manual entry stays cash-only; locked-via-scan is also cash-only and non-editable ---- */

function TransferView({ currentUser, onToggleFavorite, onLookupAccount, lockedRecipient, onBack, onConfirm }) {
  const [accountInput, setAccountInput] = useState("");
  const [searchedMatch, setSearchedMatch] = useState(null);
  const [searching, setSearching] = useState(false);
  const [recipient, setRecipient] = useState(lockedRecipient || null);
  const [favoritesResolved, setFavoritesResolved] = useState([]);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locked = !!lockedRecipient;
  const favoriteAccounts = currentUser.favoriteAccounts || [];
  const amt = Number(amount) || 0;
  const canConfirm = !!recipient && amt > 0 && !currentUser.negative && amt <= currentUser.balance;

  useEffect(() => {
    let cancelled = false;
    (async () => { const results = await Promise.all(favoriteAccounts.map((acc) => onLookupAccount(acc))); if (!cancelled) setFavoritesResolved(results.filter(Boolean)); })();
    return () => { cancelled = true; };
  }, [favoriteAccounts.join(","), onLookupAccount]);

  useEffect(() => {
    if (accountInput.length !== 6) { setSearchedMatch(null); return; }
    let cancelled = false;
    setSearching(true);
    onLookupAccount(accountInput).then((info) => { if (!cancelled) { setSearchedMatch(info); setSearching(false); } });
    return () => { cancelled = true; };
  }, [accountInput, onLookupAccount]);

  const confirm = async () => {
    setSubmitting(true); setError("");
    const r = await onConfirm({ recipientAccount: recipient.account, recipientName: recipient.name, recipientAvatar: recipient.avatar, amount, memo });
    setSubmitting(false);
    if (r?.error) setError(r.error);
  };

  return (
    <div className="px-5">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button>
        <div className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>โอนเงิน</div>
      </div>

      {locked && recipient ? (
        <div className="bg-white rounded-2xl border-2 border-teal-200 p-4 mb-4 text-center">
          <div className="text-xs text-stone-400 mb-2">ผู้รับเงิน (ล็อกจากการสแกน — แก้ไขไม่ได้)</div>
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-3xl mx-auto mb-2">{recipient.avatar}</div>
          <div className="font-semibold text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>{recipient.name}</div>
          <div className="text-xs text-stone-400">{fmtAccount(recipient.account)}</div>
        </div>
      ) : (
        <>
          <div className="text-xs font-semibold text-stone-500 mb-1.5">ใส่เลขบัญชี 6 หลัก</div>
          <input value={accountInput} onChange={(e) => setAccountInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="เช่น 203871" inputMode="numeric" className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300 mb-3" />
          {searching && <div className="text-xs text-stone-400 mb-3">กำลังค้นหา...</div>}
          {searchedMatch && (
            <div className="flex items-center gap-3 bg-white rounded-2xl border-2 border-teal-200 p-3.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl">{searchedMatch.avatar}</div>
              <div className="flex-1"><div className="text-sm font-semibold text-stone-800">{searchedMatch.name}</div><div className="text-[11px] text-stone-400">{fmtAccount(searchedMatch.account)}</div></div>
              <button onClick={() => onToggleFavorite(searchedMatch.account)} className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0"><Star size={16} className={favoriteAccounts.includes(searchedMatch.account) ? "text-amber-400 fill-amber-400" : "text-stone-300"} /></button>
              <button onClick={() => setRecipient(searchedMatch)} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${recipient?.account === searchedMatch.account ? "bg-teal-500 text-white" : "bg-teal-50 text-teal-600"}`}>{recipient?.account === searchedMatch.account ? "เลือกแล้ว" : "เลือก"}</button>
            </div>
          )}
          {!searching && accountInput.length === 6 && !searchedMatch && <div className="text-xs text-pink-500 mb-4">ไม่พบบัญชีนี้ในระบบ</div>}
          <div className="text-xs font-semibold text-stone-500 mb-1.5 flex items-center gap-1"><Star size={12} className="text-amber-400 fill-amber-400" /> รายการโปรด</div>
          {favoritesResolved.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto jp-scroll pb-1 mb-4">
              {favoritesResolved.map((u) => (<button key={u.account} onClick={() => { setRecipient(u); setAccountInput(u.account); }} className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl border-2 ${recipient?.account === u.account ? "border-orange-500 bg-orange-50" : "border-orange-100 bg-white"}`}><span className="text-xl">{u.avatar}</span><span className="text-[10.5px] font-medium text-stone-700 max-w-[64px] truncate">{u.name}</span></button>))}
            </div>
          ) : <div className="text-xs text-stone-400 italic mb-4">ยังไม่มีรายการโปรด</div>}
        </>
      )}

      <div className="text-center my-4">
        <div className="text-xs text-stone-400 mb-1">จำนวนเงิน</div>
        <div className="flex justify-center items-baseline gap-2">
          <input value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9]/g, "")); setError(""); }} placeholder="0" inputMode="numeric" className="text-center bg-transparent outline-none font-bold text-4xl w-40 text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }} />
          <span className="text-stone-400 font-semibold">บาท</span>
        </div>
      </div>
      {!locked && <div className="flex gap-2.5 justify-center mb-5">{[20, 50, 100].map((v) => <Chip key={v} active={amount === String(v)} onClick={() => setAmount(String(v))}>{v}฿</Chip>)}</div>}

      <div className="mb-5">
        <div className="text-xs font-semibold text-stone-500 mb-1.5">บันทึกช่วยจำ</div>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="เช่น ค่าไข่เจียว, ค่าน้ำปั่น" className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300" />
      </div>

      {error && <div className="text-center text-xs text-pink-500 mb-3 font-semibold">{error}</div>}
      <button disabled={!canConfirm || submitting} onClick={confirm} className="w-full py-4 rounded-2xl font-semibold text-white disabled:bg-stone-200 flex items-center justify-center gap-2" style={{ fontFamily: "Mitr, sans-serif", background: canConfirm ? "#FF9142" : undefined }}>
        {submitting && <Loader2 size={16} className="animate-spin" />} ยืนยันการโอน
      </button>
    </div>
  );
}

function ESlipView({ currentUser, tx, onDone }) {
  return (
    <div className="px-5">
      <div className="flex flex-col items-center pt-6">
        <div style={{ animation: "jp-pop 0.5s ease" }} className="w-16 h-16 rounded-full bg-teal-500 flex items-center justify-center"><CheckCircle2 size={34} className="text-white" /></div>
        <div className="font-bold text-xl text-stone-800 mt-3" style={{ fontFamily: "Mitr, sans-serif" }}>โอนเงินสำเร็จ!</div>
        <div className="text-xs text-stone-400 mt-1">เก็บสลิปไว้เป็นหลักฐานได้เลย</div>
        <div className="w-full mt-5 rounded-3xl overflow-hidden shadow-lg">
          <div className="p-5 text-white" style={{ background: "linear-gradient(135deg,#FF9142,#FF6B9D)" }}>
            <div className="flex items-center gap-1.5 font-semibold text-sm" style={{ fontFamily: "Mitr, sans-serif" }}><Sparkles size={15} /> จิ๋วเปย์ อี-สลิป</div>
            <div className="font-bold text-3xl mt-2" style={{ fontFamily: "Mitr, sans-serif" }}>{Number(tx.amount).toLocaleString()} บาท</div>
          </div>
          <div className="bg-white p-5">
            <div className="flex items-center gap-2.5 mb-1"><div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">{currentUser.avatar}</div><div className="text-xs font-medium text-stone-700">{currentUser.name} (ผู้โอน)</div></div>
            <div className="flex justify-center my-1"><ArrowDownLeft size={14} className="text-stone-300" /></div>
            <div className="flex items-center gap-2.5 mb-3.5"><div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">{tx.recipientAvatar}</div><div className="text-xs font-medium text-stone-700">{tx.recipientName} (ผู้รับ)</div></div>
            <div className="border-t border-dashed border-stone-200 pt-3 space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-stone-400">วันเวลาในเกม</span><span className="font-semibold text-stone-800">วันที่ {tx.day}</span></div></div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-stone-400 mt-3"><Camera size={13} /> แคปหน้าจอเก็บไว้ได้เลย!</div>
      </div>
      <button onClick={onDone} className="w-full mt-5 py-4 rounded-2xl font-semibold text-white bg-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>ปิด / แคปหน้าจอ</button>
    </div>
  );
}

function TopupView({ requests, onBack, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const statusStyle = { pending: "bg-amber-50 text-amber-600", approved: "bg-teal-50 text-teal-600", rejected: "bg-stone-100 text-stone-400" };
  const statusLabel = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ" };
  return (
    <div className="px-5">
      <div className="flex items-center gap-2 mb-4"><button onClick={onBack} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button><div className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>ขอเติมเงิน</div></div>
      <div className="bg-white rounded-2xl border-2 border-orange-100 p-4 mb-5">
        <div className="text-xs font-semibold text-stone-500 mb-1.5">จำนวนเงินที่ขอ</div>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" inputMode="numeric" className="w-full text-2xl font-bold text-center outline-none mb-2 text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }} />
        <div className="flex gap-2 justify-center mb-4">{[50, 100, 200].map((v) => <Chip key={v} active={amount === String(v)} onClick={() => setAmount(String(v))}>{v}฿</Chip>)}</div>
        <div className="text-xs font-semibold text-stone-500 mb-1.5">เหตุผล</div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ซื้อวัตถุดิบเพิ่ม" className="w-full px-4 py-3 rounded-xl border-2 border-orange-100 text-sm outline-none focus:border-orange-300 mb-4" />
        <button onClick={async () => { if (amount) { setBusy(true); await onSubmit({ amount, reason }); setBusy(false); setAmount(""); setReason(""); } }} disabled={!amount || busy} className="w-full py-3.5 rounded-xl font-semibold text-white disabled:bg-stone-200" style={{ fontFamily: "Mitr, sans-serif", background: amount ? "#FF9142" : undefined }}>ส่งคำขอ</button>
      </div>
      <div className="font-semibold text-sm text-stone-800 mb-2" style={{ fontFamily: "Mitr, sans-serif" }}>สถานะคำขอ</div>
      <div className="space-y-2 pb-4">
        {requests.map((r) => (<div key={r.id} className="flex items-center justify-between bg-white rounded-xl border-2 border-orange-100 px-4 py-3"><div><div className="text-sm font-semibold text-stone-800">{Number(r.amount).toLocaleString()} ฿</div><div className="text-[11px] text-stone-400">{r.reason} · วันที่ {r.day}</div></div><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusStyle[r.status]}`}>{statusLabel[r.status]}</span></div>))}
        {requests.length === 0 && <div className="text-center text-stone-400 text-sm py-6">ยังไม่มีคำขอเติมเงิน</div>}
      </div>
    </div>
  );
}

function LoanView({ currentUser, requests, onBack, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState(LOAN_PLANS[0]);
  const [busy, setBusy] = useState(false);
  const hasPending = requests.some((r) => r.status === "pending");
  const statusStyle = { pending: "bg-amber-50 text-amber-600", approved: "bg-teal-50 text-teal-600", rejected: "bg-stone-100 text-stone-400" };
  const statusLabel = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ" };
  return (
    <div className="px-5">
      <div className="flex items-center gap-2 mb-4"><button onClick={onBack} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button><div className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>กู้เงิน</div></div>
      {currentUser.loan ? (
        <div className="bg-white rounded-2xl border-2 border-orange-100 p-5 mb-5">
          <div className="flex items-center gap-2 mb-2"><Banknote size={18} className="text-orange-500" /><span className="font-semibold text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>เงินกู้ที่ใช้งานอยู่</span></div>
          <div className="text-sm text-stone-500 mb-1">ยอดกู้ {currentUser.loan.principal.toLocaleString()} ฿ · ผ่อน {currentUser.loan.dailyInstallment.toLocaleString()} ฿/วัน</div>
          <div className="h-2 rounded-full bg-amber-100 overflow-hidden mb-1"><div className="h-full bg-orange-500" style={{ width: `${(currentUser.loan.daysPaid / currentUser.loan.days) * 100}%` }} /></div>
          <div className="text-xs text-stone-400">ผ่อนแล้ว {currentUser.loan.daysPaid}/{currentUser.loan.days} วัน</div>
        </div>
      ) : currentUser.negative ? (
        <div className="bg-pink-50 border-2 border-pink-300 text-pink-600 rounded-2xl p-4 text-xs font-semibold mb-5">บัญชีติดลบ ไม่สามารถขอกู้เงินใหม่ได้</div>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-orange-100 p-4 mb-5">
          <div className="text-xs font-semibold text-stone-500 mb-1.5">จำนวนเงินที่ต้องการกู้</div>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" inputMode="numeric" className="w-full text-2xl font-bold text-center outline-none mb-3 text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }} />
          <div className="flex flex-col gap-2 mb-4">{LOAN_PLANS.map((p) => (<button key={p.days} onClick={() => setPlan(p)} className={`text-left px-4 py-3 rounded-xl border-2 text-sm font-medium ${plan.days === p.days ? "border-orange-500 bg-orange-50 text-orange-700" : "border-orange-100 text-stone-600"}`}>{p.label}</button>))}</div>
          <button disabled={!amount || hasPending || busy} onClick={async () => { setBusy(true); await onSubmit({ amount, plan }); setBusy(false); setAmount(""); }} className="w-full py-3.5 rounded-xl font-semibold text-white disabled:bg-stone-200" style={{ fontFamily: "Mitr, sans-serif", background: amount && !hasPending ? "#FF9142" : undefined }}>{hasPending ? "มีคำขอที่รออนุมัติอยู่แล้ว" : "ขอกู้เงิน"}</button>
        </div>
      )}
      <div className="font-semibold text-sm text-stone-800 mb-2" style={{ fontFamily: "Mitr, sans-serif" }}>ประวัติคำขอกู้เงิน</div>
      <div className="space-y-2 pb-4">
        {requests.map((r) => (<div key={r.id} className="flex items-center justify-between bg-white rounded-xl border-2 border-orange-100 px-4 py-3"><div><div className="text-sm font-semibold text-stone-800">{Number(r.amount).toLocaleString()} ฿ · {r.days} วัน</div><div className="text-[11px] text-stone-400">วันที่ {r.day}</div></div><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusStyle[r.status]}`}>{statusLabel[r.status]}</span></div>))}
        {requests.length === 0 && <div className="text-center text-stone-400 text-sm py-6">ยังไม่มีประวัติเงินกู้</div>}
      </div>
    </div>
  );
}

/* ---- POS EDC Terminal: numpad first, then NFC tap OR camera card-scan, then locked confirm ---- */

function PosTerminalView({ currentUser, onLookupAccount, onCashCharge, onCreditCharge, onBack }) {
  const [expr, setExpr] = useState("");
  const [identifyMode, setIdentifyMode] = useState(null); // null | "nfc" | "camera"
  const [nfcStatus, setNfcStatus] = useState("idle"); // idle | scanning | error
  const [errorDetail, setErrorDetail] = useState("");
  const [customer, setCustomer] = useState(null);
  const [plan, setPlan] = useState("full");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  const total = (() => { if (!expr) return 0; return expr.split(/(?=[+\-])/).filter(Boolean).reduce((s, p) => s + Number(p), 0); })();
  const press = (val) => setExpr((e) => e + val);
  const clear = () => setExpr("");
  const del = () => setExpr((e) => e.slice(0, -1));

  const startNfc = async () => {
    setErrorDetail(""); setIdentifyMode("nfc");
    if (!("NDEFReader" in window)) { setNfcStatus("unsupported"); return; }
    try {
      setNfcStatus("scanning");
      const ndef = new window.NDEFReader();
      await ndef.scan();
      ndef.onreading = async (event) => {
        const decoder = new TextDecoder();
        let account = null;
        for (const record of event.message.records) {
          if (record.recordType === "text") { account = decoder.decode(record.data).replace(/[^0-9]/g, ""); break; }
        }
        if (!account) { setNfcStatus("error"); setErrorDetail("อ่านบัตรไม่สำเร็จ ลองแตะใหม่อีกครั้ง"); return; }
        const info = await onLookupAccount(account);
        if (!info) { setNfcStatus("error"); setErrorDetail("ไม่พบบัญชีนี้ในระบบ"); return; }
        setCustomer(info);
        setNfcStatus("idle");
      };
      ndef.onreadingerror = () => { setNfcStatus("error"); setErrorDetail("อ่านบัตรไม่สำเร็จ ลองแตะใหม่อีกครั้ง"); };
    } catch (err) {
      setNfcStatus("error"); setErrorDetail("ไม่ได้รับสิทธิ์ใช้ NFC หรือถูกยกเลิก");
    }
  };

  const handleCardScanDetected = useCallback(async (raw) => {
    const decoded = decodeScanPayload(raw);
    if (!decoded.account) return;
    const info = await onLookupAccount(decoded.account);
    if (!info) { setErrorDetail("ไม่พบบัญชีนี้ในระบบ"); return; }
    setCustomer(info);
    setIdentifyMode(null);
  }, [onLookupAccount]);

  const confirmPayment = async () => {
    if (!customer || total <= 0) return;
    setProcessing(true); setError("");
    const r = plan === "full"
      ? await onCashCharge(customer.account, total)
      : await onCreditCharge(customer.account, total, plan === "3" ? 3 : 5, plan === "3" ? "ผ่อน 0% 3 เดือน" : "ผ่อน 0% 5 เดือน");
    setProcessing(false);
    if (r?.error) { setError(r.error); return; }
    setDone({ amount: total, customer });
  };

  const resetAll = () => { setDone(null); setCustomer(null); setExpr(""); setPlan("full"); setIdentifyMode(null); setNfcStatus("idle"); setErrorDetail(""); onBack(); };

  if (done) {
    return (
      <div className="px-5 flex flex-col items-center pt-8">
        <div style={{ animation: "jp-pop 0.5s ease" }} className="w-16 h-16 rounded-full bg-teal-500 flex items-center justify-center"><CheckCircle2 size={34} className="text-white" /></div>
        <div className="font-bold text-xl text-stone-800 mt-3" style={{ fontFamily: "Mitr, sans-serif" }}>ชำระเงินสำเร็จ!</div>
        <div className="w-full rounded-3xl bg-stone-900 text-white p-6 text-center mt-5">
          <div className="text-3xl mb-2">{done.customer.avatar}</div>
          <div className="text-sm opacity-70">{done.customer.name}</div>
          <div className="font-bold text-4xl mt-2" style={{ fontFamily: "Mitr, sans-serif" }}>{done.amount.toLocaleString()} ฿</div>
        </div>
        <button onClick={resetAll} className="w-full mt-5 py-4 rounded-2xl font-semibold text-white bg-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>เสร็จสิ้น</button>
      </div>
    );
  }

  // Step 2 — customer identified: locked confirmation screen
  if (customer) {
    return (
      <div className="px-5">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setCustomer(null)} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button>
          <div className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>ยืนยันการชำระเงิน</div>
        </div>

        <div className="rounded-3xl p-5 text-white mb-4" style={{ background: "linear-gradient(160deg,#1c1917,#3D2C1F 60%,#4a2f1c)" }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl">{customer.avatar}</div>
            <div className="flex-1 min-w-0"><div className="font-semibold truncate" style={{ fontFamily: "Mitr, sans-serif" }}>{customer.name}</div><div className="text-xs opacity-60 font-mono">{fmtAccount(customer.account)}</div></div>
            <CheckCircle2 size={20} className="text-teal-400 shrink-0" />
          </div>
          <div className="text-center mt-4">
            <div className="text-xs opacity-70">ยอดชำระ (ล็อกแล้ว)</div>
            <div className="font-bold text-4xl mt-1" style={{ fontFamily: "Mitr, sans-serif" }}>{total.toLocaleString()} ฿</div>
          </div>
        </div>

        <div className="text-xs font-semibold text-stone-500 mb-1.5">วิธีชำระเงิน</div>
        <div className="flex flex-col gap-2 mb-4">
          <button onClick={() => setPlan("full")} className={`text-left px-4 py-3 rounded-xl border-2 ${plan === "full" ? "border-orange-500 bg-orange-50" : "border-orange-100 bg-white"}`}>
            <div className="text-sm font-semibold text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>ชำระเต็มจำนวน</div>
            <div className="text-[11px] text-stone-400">หักจากเงินสดของลูกค้าทันที</div>
          </button>
          <button disabled={!customer.hasCreditCard} onClick={() => setPlan("3")} className={`text-left px-4 py-3 rounded-xl border-2 disabled:opacity-40 ${plan === "3" ? "border-orange-500 bg-orange-50" : "border-orange-100 bg-white"}`}>
            <div className="text-sm font-semibold text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>ผ่อน 0% 3 เดือน</div>
            <div className="text-[11px] text-stone-400">{customer.hasCreditCard ? "ล็อกวงเงินบัตรเครดิตทั้งหมดทันที" : "ลูกค้าไม่มีบัตรเครดิต"}</div>
          </button>
          <button disabled={!customer.hasCreditCard} onClick={() => setPlan("5")} className={`text-left px-4 py-3 rounded-xl border-2 disabled:opacity-40 ${plan === "5" ? "border-orange-500 bg-orange-50" : "border-orange-100 bg-white"}`}>
            <div className="text-sm font-semibold text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>ผ่อน 0% 5 เดือน</div>
            <div className="text-[11px] text-stone-400">{customer.hasCreditCard ? "ล็อกวงเงินบัตรเครดิตทั้งหมดทันที" : "ลูกค้าไม่มีบัตรเครดิต"}</div>
          </button>
        </div>

        {error && <div className="mb-4 flex items-center gap-2 bg-pink-50 border-2 border-pink-300 text-pink-600 rounded-xl px-4 py-3 text-xs font-semibold"><AlertTriangle size={16} /> {error}</div>}

        <button disabled={processing} onClick={confirmPayment} className="w-full mb-6 py-4 rounded-2xl font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2" style={{ fontFamily: "Mitr, sans-serif", background: "#3FC7B8" }}>
          {processing && <Loader2 size={16} className="animate-spin" />} ยืนยันการชำระเงิน {total.toLocaleString()} ฿
        </button>
      </div>
    );
  }

  // Step 1b — camera card-scan overlay
  if (identifyMode === "camera") {
    return (
      <div className="px-5">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setIdentifyMode(null)} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button>
          <div className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>สแกนบัตร JiwPay</div>
        </div>
        <div className="rounded-3xl bg-stone-800 p-6 flex flex-col items-center gap-4">
          <CameraPreview accent="border-teal-300" onDetect={handleCardScanDetected} fallbackText="ไม่มีสิทธิ์ใช้กล้อง กรุณาใช้เมนูโอนเงินแทน" />
          <div className="text-white text-xs text-center opacity-80 px-4">วางกล้องให้ตรงกับ QR ที่พิมพ์อยู่บนบัตร JiwPay ของลูกค้า</div>
          {errorDetail && <div className="w-full flex items-center gap-2 bg-pink-500/20 border-2 border-pink-400 text-pink-200 rounded-xl px-4 py-3 text-xs font-semibold"><AlertTriangle size={16} /> {errorDetail}</div>}
        </div>
      </div>
    );
  }

  // Step 1 — numpad, then choose identify method
  return (
    <div className="px-5">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button>
        <div className="font-semibold text-lg text-stone-800" style={{ fontFamily: "Mitr, sans-serif" }}>JiwPay EDC Terminal</div>
      </div>

      <div className="rounded-2xl p-5 text-white mb-3" style={{ background: "linear-gradient(160deg,#1c1917,#3D2C1F)" }}>
        <div className="flex items-center justify-between mb-3"><div className="text-xs tracking-widest opacity-70 font-semibold">JIWPAY EDC</div><CreditCard size={20} className="opacity-70" /></div>
        <div className="text-amber-300 text-xs mb-1">{expr || "ใส่ยอดชำระ"}</div>
        <div className="font-bold text-4xl text-right" style={{ fontFamily: "Mitr, sans-serif" }}>{total.toLocaleString()} ฿</div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {["7", "8", "9", "+", "4", "5", "6", "-", "1", "2", "3", "C", "0", "00", "⌫", ""].map((k, i) => (
          k === "" ? <div key={i} /> :
          <button key={k + i} onClick={() => (k === "C" ? clear() : k === "⌫" ? del() : press(k))}
            className={`py-3.5 rounded-xl font-semibold text-sm ${["+", "-"].includes(k) ? "bg-orange-500 text-white" : k === "C" || k === "⌫" ? "bg-pink-50 text-pink-500" : "bg-white border-2 border-orange-100 text-stone-700"}`}
            style={{ fontFamily: "Mitr, sans-serif" }}>{k}</button>
        ))}
      </div>

      <div className="text-xs font-semibold text-stone-500 mb-1.5">ระบุตัวลูกค้า</div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button disabled={total <= 0} onClick={startNfc} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-stone-900 text-white disabled:opacity-40">
          <div className="relative w-12 h-12 rounded-full bg-amber-400 flex items-center justify-center">
            {identifyMode === "nfc" && nfcStatus === "scanning" && <span className="absolute inset-0 rounded-full border-4 border-amber-300 jp-nfc-ring" />}
            <Wifi size={22} className="text-stone-900" style={{ transform: "rotate(45deg)" }} />
          </div>
          <span className="text-sm font-semibold" style={{ fontFamily: "Mitr, sans-serif" }}>{identifyMode === "nfc" && nfcStatus === "scanning" ? "รอแตะบัตร..." : "แตะบัตร (NFC)"}</span>
        </button>
        <button disabled={total <= 0} onClick={() => setIdentifyMode("camera")} className="flex flex-col items-center gap-2 py-5 rounded-2xl bg-white border-2 border-orange-100 disabled:opacity-40">
          <div className="w-12 h-12 rounded-full bg-teal-500 flex items-center justify-center"><Camera size={22} className="text-white" /></div>
          <span className="text-sm font-semibold text-stone-700" style={{ fontFamily: "Mitr, sans-serif" }}>สแกนบัตร (Camera)</span>
        </button>
      </div>
      {total <= 0 && <div className="text-xs text-stone-400 text-center mb-4">กรุณาใส่ยอดชำระก่อน</div>}

      {identifyMode === "nfc" && nfcStatus === "unsupported" && (
        <div className="flex items-center gap-2 bg-stone-100 border-2 border-stone-200 text-stone-600 rounded-xl px-4 py-3 text-xs font-semibold mb-4">
          <AlertTriangle size={16} /> อุปกรณ์นี้ไม่รองรับการอ่านบัตร JiwPay (ต้องใช้ Android &amp; Chrome)
        </div>
      )}
      {identifyMode === "nfc" && nfcStatus === "error" && errorDetail && (
        <div className="flex items-center gap-2 bg-pink-50 border-2 border-pink-300 text-pink-600 rounded-xl px-4 py-3 text-xs font-semibold mb-4"><AlertTriangle size={16} /> {errorDetail}</div>
      )}
    </div>
  );
}

/* ---- History ---- */

function HistoryView({ currentUser, myTx, onBack, onRefresh }) {
  const [filter, setFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const filtered = myTx.filter((t) => { const dir = String(t.toId) === String(currentUser.account) ? "in" : "out"; if (filter === "all") return true; return dir === filter; });
  const days = [...new Set(filtered.map((t) => t.day))].sort((a, b) => b - a);
  const doRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };
  return (
    <div className="px-5">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white border-2 border-orange-100 flex items-center justify-center"><ChevronLeft size={18} className="text-stone-600" /></button>
        <div className="font-semibold text-lg text-stone-800 flex-1" style={{ fontFamily: "Mitr, sans-serif" }}>ประวัติธุรกรรม</div>
        <button onClick={doRefresh} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border-2 border-orange-100 text-xs font-semibold text-stone-600"><RefreshCw size={14} className={refreshing ? "jp-spin" : ""} /> รีเฟรชข้อมูล</button>
      </div>
      <div className="flex gap-2 mb-4">{[{ key: "all", label: "ทั้งหมด" }, { key: "in", label: "เงินเข้า" }, { key: "out", label: "เงินออก" }].map((f) => (<button key={f.key} onClick={() => setFilter(f.key)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${filter === f.key ? "bg-orange-500 border-orange-600 text-white" : "bg-white border-orange-100 text-stone-500"}`}>{f.label}</button>))}</div>
      <div className="space-y-3 pb-4">
        {days.map((d) => (
          <Accordion key={d} title={`วันที่ ${d}`} defaultOpen={d === days[0]}>
            {filtered.filter((t) => t.day === d).map((t) => {
              const dir = String(t.toId) === String(currentUser.account) ? "in" : "out";
              const other = dir === "in" ? t.fromId : t.toId;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-t border-orange-50 first:border-t-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg shrink-0">{Number(other) === 0 ? "🏦" : "👤"}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-stone-800 truncate">{Number(other) === 0 ? "ธนาคารจิ๋วเปย์" : fmtAccount(String(other))}</div><div className="text-[11px] text-stone-400">{t.memo} · {t.time}</div></div>
                  <div className={`text-sm font-bold shrink-0 ${dir === "in" ? "text-teal-600" : "text-pink-500"}`}>{dir === "in" ? "+" : "-"}{Number(t.amount).toLocaleString()}฿</div>
                </div>
              );
            })}
          </Accordion>
        ))}
        {days.length === 0 && <div className="text-center text-stone-400 text-sm py-8">ยังไม่มีประวัติธุรกรรม</div>}
      </div>
    </div>
  );
}
