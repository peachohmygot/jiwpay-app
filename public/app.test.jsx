import React, { StrictMode } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import App, { CameraPreview, SmartQrImage, normalizeGame } from "../src/App.js";
import { PosPanel, PosQrPanel, decodeScanPayload } from "../src/App.js";
import Admin from "../src/Admin.js";

const game = {
  day: 3,
  hour: 9,
  minute: 15,
  gamePaused: false,
  announcement: "",
};
const user = {
  id: 42,
  account: "123456",
  name: "ร้านมะลิ",
  avatar: "🐱",
  balance: 1000,
  piggy: 500,
  qrEnabled: true,
  hasCreditCard: false,
  creditLimit: 0,
  availableCredit: 0,
  loan: null,
  favoriteAccounts: [],
  earnedBadges: [],
  creditSchedules: [],
};
const recipient = {
  id: 43,
  account: "654321",
  name: "ร้านต้น",
  avatar: "🐻",
  qrEnabled: true,
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const response = (data) => ({ ok: true, json: async () => data });
let state, posts, pendingPost, getCalls;
function seedClient(extra = {}) {
  localStorage.setItem("jiwpay_logged_account", "123456");
  localStorage.setItem(
    "jiwpay_client_v4:123456",
    JSON.stringify({
      currentUser: user,
      transactions: [],
      topups: [],
      loanRequests: [],
      badges: [],
      gameTime: game,
      announcement: "",
      ...extra,
    }),
  );
}
function seedAdmin(extra = {}) {
  localStorage.setItem("jiwpay_admin_key", "test-secret");
  localStorage.setItem(
    "jiwpay_admin_v4",
    JSON.stringify({
      users: [user],
      transactions: [],
      topups: [],
      loanRequests: [],
      badges: [],
      gameState: game,
      ...extra,
    }),
  );
}
beforeEach(() => {
  localStorage.clear();
  posts = [];
  getCalls = [];
  pendingPost = deferred();
  state = {
    Users: [user],
    Transactions: [],
    Topups: [],
    LoanRequests: [],
    Badges: [],
    GameState: [game],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      if (options.method === "POST") {
        posts.push(JSON.parse(options.body));
        return pendingPost.promise;
      }
      const params = new URL(url).searchParams;
      getCalls.push(Object.fromEntries(params));
      if (params.has("lookupAccount"))
        return response({ ok: true, user: recipient });
      return response({
        ok: true,
        scope: params.has("adminKey") ? "admin" : "self",
        rows: state[params.get("sheet")] || [],
      });
    }),
  );
});
afterEach(async () => {
  cleanup();
  pendingPost.resolve(response({ ok: false, error: "cancelled" }));
  await act(async () => {});
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function ready() {
  await waitFor(() =>
    expect(getCalls.some((call) => call.sheet === "LoanRequests")).toBe(true),
  );
  await act(async () => {});
}

describe("persistent sessions and cache", () => {
  it("renders the saved wallet immediately and fetches requests by user ID", async () => {
    seedClient();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(screen.getByLabelText("ยอดเงินคงเหลือ").textContent).toBe("1,000");
    expect(screen.queryByRole("button", { name: "เข้าสู่ระบบ" })).toBeNull();
    await ready();
    expect(getCalls.find((call) => call.sheet === "Topups").userId).toBe("42");
    expect(getCalls.find((call) => call.sheet === "Transactions").userId).toBe(
      "123456",
    );
  });
  it("restores a saved account even when its data cache is missing", async () => {
    localStorage.setItem("jiwpay_logged_account", "123456");
    render(<App />);
    expect(screen.getByLabelText("กำลังโหลดบัญชี")).toBeTruthy();
    await screen.findByLabelText("ยอดเงินคงเหลือ");
    expect(screen.queryByRole("button", { name: "เข้าสู่ระบบ" })).toBeNull();
  });
  it("does not expose another account cache on the guest login screen", () => {
    localStorage.setItem(
      "jiwpay_client_v4:123456",
      JSON.stringify({ currentUser: user }),
    );
    render(<App />);
    expect(screen.queryByText("สวัสดี, ร้านมะลิ")).toBeNull();
    expect(screen.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeTruthy();
  });
  it("survives inaccessible localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<App />);
    expect(screen.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeTruthy();
  });
});
describe("optimistic writes", () => {
  it("immediately inserts a loan request, prevents duplicate submissions, and rolls back rejection", async () => {
    seedClient();
    render(<App />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "เงินกู้" }));
    fireEvent.change(screen.getByLabelText("จำนวนเงินที่ต้องการกู้"), {
      target: { value: "100" },
    });
    const submit = screen.getByRole("button", { name: /ส่งคำขอกู้เงิน/ });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(screen.getByText("รออนุมัติ")).toBeTruthy();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      type: "loan_request",
      amount: 100,
      userId: 42,
    });
    // In-flight optimistic rows must not become authoritative on reload.
    expect(
      JSON.parse(localStorage.getItem("jiwpay_client_v4:123456")).loanRequests,
    ).toHaveLength(0);
    await act(async () =>
      pendingPost.resolve(response({ ok: false, error: "คำขอถูกปฏิเสธ" })),
    );
    await waitFor(() => expect(screen.queryByText("รออนุมัติ")).toBeNull());
    expect(screen.getByLabelText("จำนวนเงินที่ต้องการกู้").value).toBe("100");
  });
  it("updates savings immediately and rolls back a network failure", async () => {
    seedClient();
    render(<App />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /กระปุกออมสิน/ }));
    fireEvent.change(screen.getByLabelText("จำนวนเงิน"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ฝากเข้ากระปุก" }));
    expect(screen.getByLabelText("ยอดเงินคงเหลือ").textContent).toBe("800");
    expect(posts).toHaveLength(1);
    expect(
      JSON.parse(localStorage.getItem("jiwpay_client_v4:123456")).currentUser
        .balance,
    ).toBe(1000);
    await act(async () =>
      pendingPost.resolve(Promise.reject(new TypeError("network"))),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("ยอดเงินคงเหลือ").textContent).toBe("1,000"),
    );
  });
  it("transfers once and uses the server response for the confirmed balance and receipt", async () => {
    seedClient();
    render(<App />);
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "โอนเงิน" })[0]);
    fireEvent.change(screen.getByLabelText("โอนไปยังเลขบัญชี"), {
      target: { value: "654321" },
    });
    await screen.findByText("ร้านต้น");
    fireEvent.change(screen.getByLabelText("จำนวนเงิน"), {
      target: { value: "125" },
    });
    const button = screen.getByRole("button", { name: /โอน ฿125/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(posts).toHaveLength(1);
    expect(button.disabled).toBe(true);
    state.Users = [{ ...user, balance: 875 }];
    state.Transactions = [
      {
        id: "tx1",
        fromId: "123456",
        toId: "654321",
        amount: 125,
        type: "TRANSFER",
        day: 3,
      },
    ];
    await act(async () =>
      pendingPost.resolve(
        response({
          ok: true,
          user: state.Users[0],
          transaction: state.Transactions[0],
        }),
      ),
    );
    await screen.findByText("โอนเงินเรียบร้อย");
    expect(
      JSON.parse(localStorage.getItem("jiwpay_client_v4:123456")).currentUser
        .balance,
    ).toBe(875);
  });
});
describe("admin state", () => {
  it("optimistically removes a top-up and rolls back both row and balance on failure", async () => {
    const row = { id: "top1", userId: 42, amount: 200, status: "pending" };
    state.Topups = [row];
    seedAdmin({ topups: [row] });
    render(
      <StrictMode>
        <Admin />
      </StrictMode>,
    );
    await ready();
    await waitFor(() =>
      expect(screen.queryByText("กำลังตรวจสอบสิทธิ์ผู้ดูแล...")).toBeNull(),
    );
    fireEvent.click(screen.getAllByRole("button", { name: /คำขอ/ })[0]);
    const button = screen.getByRole("button", { name: "อนุมัติ" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("button", { name: "อนุมัติ" })).toBeNull();
    expect(posts).toHaveLength(1);
    await act(async () =>
      pendingPost.resolve(response({ ok: false, error: "ไม่อนุมัติ" })),
    );
    await screen.findByRole("button", { name: "อนุมัติ" });
    expect(
      JSON.parse(localStorage.getItem("jiwpay_admin_v4")).users[0].balance,
    ).toBe(1000);
  });
  it("handles an empty game sheet without inventing a time or causing a fetch loop", async () => {
    state.GameState = [];
    seedAdmin({ gameState: null });
    render(<Admin />);
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "เวลาเกม" })[0]);
    expect(
      screen.getByRole("button", { name: "ตั้งเวลาเริ่มต้น 06:00 น." }),
    ).toBeTruthy();
    const count = getCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(getCalls).toHaveLength(count);
    expect(screen.getAllByText("กำลังซิงค์เวลา...").length).toBeGreaterThan(0);
  });
});
describe("camera and QR", () => {
  it("mounts the video before capture, stops a late StrictMode stream, and releases the active camera", async () => {
    const first = deferred(),
      second = deferred();
    const stop1 = vi.fn(),
      stop2 = vi.fn();
    const media = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("isSecureContext", true);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: media },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(),
    });
    const view = render(
      <StrictMode>
        <CameraPreview onDetect={() => {}} accent="border-white" />
      </StrictMode>,
    );
    const video = view.container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.muted).toBe(true);
    await act(async () => {
      first.resolve({ getTracks: () => [{ stop: stop1 }] });
      second.resolve({ getTracks: () => [{ stop: stop2 }] });
    });
    expect(stop1).toHaveBeenCalled();
    expect(video.srcObject).toBeTruthy();
    view.unmount();
    expect(stop2).toHaveBeenCalled();
  });
  it("encodes the entire JSON QR payload exactly once", () => {
    const payload = JSON.stringify({
      account: "123456",
      amount: 100,
      memo: "ทดสอบ & จ่าย",
    });
    render(<SmartQrImage payload={payload} />);
    expect(
      new URL(screen.getByAltText("QR สำหรับรับเงิน").src).searchParams.get(
        "data",
      ),
    ).toBe(payload);
  });
  it("rejects absent and malformed game times", () => {
    expect(normalizeGame(null)).toBeNull();
    expect(normalizeGame({ day: 1, hour: "", minute: 0 })).toBeNull();
    expect(
      normalizeGame({ day: "2", hour: "6", minute: "0", gamePaused: "FALSE" }),
    ).toMatchObject({ day: 2, hour: 6, minute: 0, gamePaused: false });
  });
});

describe("request ordering and recovery", () => {
  it("ignores a stale GET that finishes after a confirmed savings transaction", async () => {
    seedClient();
    const originalFetch = globalThis.fetch;
    const oldRead = deferred();
    let held = false;
    globalThis.fetch = vi.fn((url, options) => {
      const params = new URL(url).searchParams;
      if (
        options?.method !== "POST" &&
        params.get("sheet") === "Users" &&
        !held
      ) {
        held = true;
        return oldRead.promise;
      }
      return originalFetch(url, options);
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /กระปุกออมสิน/ }));
    fireEvent.change(screen.getByLabelText("จำนวนเงิน"), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ฝากเข้ากระปุก" }));
    state.Users = [{ ...user, balance: 800, piggy: 700 }];
    await act(async () =>
      pendingPost.resolve(response({ ok: true, user: state.Users[0] })),
    );
    await ready();
    await act(async () =>
      oldRead.resolve(response({ ok: true, rows: [user] })),
    );
    expect(screen.getByLabelText("ยอดเงินคงเหลือ").textContent).toBe("800");
    expect(
      JSON.parse(localStorage.getItem("jiwpay_client_v4:123456")).currentUser
        .piggy,
    ).toBe(700);
  });
  it("keeps the admin session and cached data when revalidation goes offline", async () => {
    seedAdmin();
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    render(<Admin />);
    await screen.findByText("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ");
    expect(localStorage.getItem("jiwpay_admin_key")).toBe("test-secret");
    expect(screen.getByRole("heading", { name: "ภาพรวมระบบ" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("รหัสผู้ดูแลระบบ")).toBeNull();
  });
  it("disables and spins manual refresh while loading, then recovers on failure", async () => {
    seedClient();
    render(<App />);
    await ready();
    const reads = deferred();
    globalThis.fetch = vi.fn(() => reads.promise);
    const button = screen.getByRole("button", { name: "รีเฟรชข้อมูล" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    expect(button.querySelector(".animate-spin")).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
    await act(async () =>
      reads.resolve(response({ ok: false, error: "ออฟไลน์" })),
    );
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(localStorage.getItem("jiwpay_logged_account")).toBe("123456");
  });
});

describe("remember me across page reloads", () => {
  it("reopens the client directly, even when the account has a PIN", async () => {
    seedClient({ currentUser: { ...user, pin: "1234" } });
    state.Users = [{ ...user, pin: "1234" }];
    const first = render(<App />);
    await ready();
    first.unmount();
    render(<App />);
    expect(screen.getByLabelText("ยอดเงินคงเหลือ").textContent).toBe("1,000");
    expect(screen.queryByRole("button", { name: "เข้าสู่ระบบ" })).toBeNull();
    expect(screen.queryByText("ใส่รหัส PIN")).toBeNull();
    expect(localStorage.getItem("jiwpay_logged_account")).toBe("123456");
    await ready();
  });
  it("reopens the admin dashboard immediately with the saved admin key", async () => {
    seedAdmin();
    const first = render(<Admin />);
    await ready();
    first.unmount();
    render(<Admin />);
    expect(screen.getByRole("heading", { name: "ภาพรวมระบบ" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "เข้าสู่ระบบผู้ดูแล" }),
    ).toBeNull();
    expect(localStorage.getItem("jiwpay_admin_key")).toBe("test-secret");
    await ready();
  });
});

describe("merchant card payments", () => {
  it("lets the seller identify a customer and charge the entered full amount only once", async () => {
    const charge = vi.fn(() => pendingPost.promise);
    const lookup = vi
      .fn()
      .mockResolvedValue({ ...recipient, hasCreditCard: true });
    render(
      <PosPanel
        user={user}
        lookup={lookup}
        onCash={charge}
        onCredit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("หรือกรอกเลขบัญชี"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ค้นหาบัญชี/ }));
    await screen.findByText("ร้านต้น");
    fireEvent.change(screen.getByLabelText("ยอดที่ร้านค้าต้องการรับ"), {
      target: { value: "300" },
    });
    const button = screen.getByRole("button", { name: /ยืนยันรับเงิน ฿300/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledWith("654321", 300, undefined);
    await act(async () => pendingPost.resolve({ ok: true }));
    await screen.findByText("รับเงินเรียบร้อย!");
  });
  it("sends the seller amount and a zero-interest installment plan to the credit API", async () => {
    const credit = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PosPanel
        user={user}
        lookup={vi
          .fn()
          .mockResolvedValue({ ...recipient, hasCreditCard: true })}
        onCash={vi.fn()}
        onCredit={credit}
      />,
    );
    fireEvent.change(screen.getByLabelText("หรือกรอกเลขบัญชี"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ค้นหาบัญชี/ }));
    await screen.findByText("ร้านต้น");
    fireEvent.change(screen.getByLabelText("ยอดที่ร้านค้าต้องการรับ"), {
      target: { value: "450" },
    });
    expect(screen.queryByRole("combobox", { name: "จำนวนงวด" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "ผ่อน 0%", exact: true }),
    );
    expect(screen.getByRole("combobox", { name: "จำนวนงวด" }).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: /ยืนยันรับเงิน ฿450/ }));
    await waitFor(() =>
      expect(credit).toHaveBeenCalledWith(
        "654321",
        450,
        3,
        "ผ่อน 0% 3 งวด",
        undefined,
      ),
    );
  });
  it("shows a versioned debit-card QR in the admin user dropdown", async () => {
    state.Users = [{ ...user, hasCreditCard: true, qrVersion: 4 }];
    seedAdmin({ users: state.Users });
    render(<Admin />);
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "บัญชีผู้ใช้" })[0]);
    const summary = screen.getByText("บัตร Visa / QR สำหรับให้ร้านค้าสแกน");
    fireEvent.click(summary);
    const qr = screen.getByAltText("QR บัตร Visa สำหรับร้านค้าสแกนตัดเงิน");
    const payload = JSON.parse(new URL(qr.src).searchParams.get("data"));
    expect(payload).toEqual({
      action: "jiwpay_card",
      account: "123456",
      cardType: "visa",
      qrVersion: 4,
    });
  });
  it("keeps card identity distinct from merchant receive-money QR", () => {
    expect(
      decodeScanPayload(
        JSON.stringify({
          action: "jiwpay_card",
          account: "654321",
          qrVersion: 3,
        }),
      ),
    ).toMatchObject({ account: "654321", action: "jiwpay_card", qrVersion: 3 });
  });
});

describe("restored original interactions", () => {
  it("keeps the original swipeable wallet and Visa cards", async () => {
    seedClient({ currentUser: { ...user, hasCreditCard: true } });
    state.Users = [{ ...user, hasCreditCard: true }];
    render(<App />);
    await ready();
    const visa = screen.getByRole("button", { name: "แสดงบัตร Visa" });
    fireEvent.click(visa);
    expect(visa.className).toContain("w-5");
    fireEvent.click(
      screen.getByRole("button", { name: "แสดงบัตรกระเป๋าเงิน" }),
    );
    expect(visa.className).toContain("w-1.5");
  });
  it("calculates the merchant amount using the restored keypad", () => {
    render(<PosQrPanel user={user} />);
    for (const digit of ["1", "2", "0", "+", "3", "0"])
      fireEvent.click(screen.getByRole("button", { name: digit, exact: true }));
    expect(screen.getByLabelText("ยอดที่ร้านค้าต้องการรับ").value).toBe("150");
    fireEvent.click(screen.getByRole("button", { name: "สร้าง QR รับชำระ" }));
    expect(
      JSON.parse(
        new URL(screen.getByAltText("QR สำหรับรับเงิน").src).searchParams.get(
          "data",
        ),
      ),
    ).toMatchObject({ action: "pay", account: "123456", amount: 150 });
    fireEvent.click(screen.getByRole("button", { name: "C", exact: true }));
    expect(screen.queryByAltText("QR สำหรับรับเงิน")).toBeNull();
    expect(screen.getByLabelText("ยอดที่ร้านค้าต้องการรับ").value).toBe("");
  });
  it("updates the QR on card reissue and restores the old QR if the server rejects it", async () => {
    state.Users = [{ ...user, hasCreditCard: true, qrVersion: 4 }];
    seedAdmin({ users: state.Users });
    render(<Admin />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "บัญชีผู้ใช้" }));
    const payload = () =>
      JSON.parse(
        new URL(
          screen.getByAltText("QR บัตร Visa สำหรับร้านค้าสแกนตัดเงิน").src,
        ).searchParams.get("data"),
      );
    fireEvent.click(screen.getByRole("button", { name: "ออกบัตรใหม่" }));
    expect(payload().qrVersion).toBe(5);
    expect(posts).toHaveLength(1);
    await act(async () =>
      pendingPost.resolve(response({ ok: false, error: "บันทึกไม่ได้" })),
    );
    await waitFor(() => expect(payload().qrVersion).toBe(4));
  });
});

describe("scan to pay", () => {
  it("opens a recipient confirmation and only debits the signed-in payer after confirmation", async () => {
    seedClient();
    render(<App />);
    await ready();
    fireEvent.click(
      screen.getAllByRole("button", { name: "สแกน", exact: true })[0],
    );
    fireEvent.change(screen.getByLabelText("หรือกรอกเลขบัญชี"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ค้นหาบัญชี/ }));
    await screen.findByText("ร้านต้น");
    expect(posts).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("จำนวนเงิน"), {
      target: { value: "120" },
    });
    const button = screen.getByRole("button", { name: /โอน ฿120/ });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      type: "transfer",
      fromAccount: "123456",
      toAccount: "654321",
      amount: 120,
    });
    await act(async () =>
      pendingPost.resolve(response({ ok: false, error: "จำลองปฏิเสธ" })),
    );
  });
});

it("saves a starred recipient and restores it after reopening the app", async () => {
  seedClient();
  const first = render(<App />);
  await ready();
  fireEvent.click(
    screen.getAllByRole("button", { name: "โอนเงิน", exact: true })[0],
  );
  fireEvent.change(screen.getByLabelText("โอนไปยังเลขบัญชี"), {
    target: { value: "654321" },
  });
  const star = await screen.findByRole("button", { name: "เพิ่มรายการโปรด" });
  fireEvent.click(star);
  fireEvent.click(star);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    type: "user_self_update",
    user: { id: 42, favoriteAccounts: ["654321"] },
  });
  expect(
    screen.getByRole("button", { name: "โอนไปยังรายการโปรด 654 321" }),
  ).toBeTruthy();
  state.Users = [{ ...user, favoriteAccounts: ["654321"] }];
  await act(async () =>
    pendingPost.resolve(response({ ok: true, user: state.Users[0] })),
  );
  first.unmount();
  render(<App />);
  await ready();
  fireEvent.click(
    screen.getAllByRole("button", { name: "โอนเงิน", exact: true })[0],
  );
  fireEvent.click(
    screen.getByRole("button", { name: "โอนไปยังรายการโปรด 654 321" }),
  );
  expect(screen.getByLabelText("โอนไปยังเลขบัญชี").value).toBe("654321");
  await screen.findByRole("button", { name: "ติดดาวแล้ว" });
});
