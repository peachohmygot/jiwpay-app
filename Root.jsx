import React from "react";

import ClientPOSApp from "./App";       // was App.js in your repo
import AdminDashboardApp from "./Admin"; // was Admin.js in your repo

export default function Root() {
  const params = new URLSearchParams(window.location.search);
  const isAdmin = params.get("admin") === "true";

  return isAdmin ? <AdminDashboardApp /> : <ClientPOSApp />;
}
