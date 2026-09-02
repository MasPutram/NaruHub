"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const isDashboard = pathname === "/dashboard";
  const isPoster = pathname === "/poster";

  if (isLogin || isDashboard || isPoster) return <>{children}</>;

  return (
    <>
      <Sidebar />
      <div className="sb-main">
        {children}
      </div>
    </>
  );
}
