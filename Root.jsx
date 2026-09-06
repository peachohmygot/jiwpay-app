import React from "react";

// Adjust these two paths to wherever your two files actually live in the repo.
import ClientPOSApp from "./jiwpay-v12-production";     // default export: App
import AdminDashboardApp from "./jiwpay-admin-dashboard"; // default export: AdminDashboardApp

export default function Root() {
  const params = new URLSearchParams(window.location.search);
  const isAdmin = params.get("admin") === "true";

  return isAdmin ? <AdminDashboardApp /> : <ClientPOSApp />;
}
