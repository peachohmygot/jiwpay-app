import React, { Suspense, lazy, useState, useEffect } from "react";
const App = lazy(() => import("./App"));
const Admin = lazy(() => import("./Admin"));
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <div className="min-h-screen bg-[#f6f7f2] flex flex-col items-center justify-center gap-4 p-6">
          <h1>เปิดหน้านี้ไม่สำเร็จ</h1>
          <button
            className="rounded-xl bg-[#244c42] text-white px-5 py-3"
            onClick={() => window.location.reload()}
          >
            โหลดใหม่
          </button>
        </div>
      );
    return this.props.children;
  }
}
export default function Root() {
  const [location, setLocation] = useState(() => window.location.href);
  useEffect(() => {
    const change = () => setLocation(window.location.href);
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
    };
  }, []);
  const url = new URL(location);
  const admin = url.hash === "#admin" || /\/admin\/?$/.test(url.pathname);
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#f6f7f2] flex items-center justify-center text-[#244c42]">
            กำลังเปิด JiwPay...
          </div>
        }
      >
        {admin ? <Admin /> : <App />}
      </Suspense>
    </ErrorBoundary>
  );
}
