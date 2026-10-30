import type { Metadata } from "next";
import Sidebar from "../components/Sidebar";

export const metadata: Metadata = {
  title: "Narua — Admin Dashboard",
  description: "Monitor & manage your game store",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="sb-main">
        {children}
      </div>
    </>
  );
}
