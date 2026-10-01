import type { Metadata } from "next";
import { Poppins, Bebas_Neue } from "next/font/google";
import AppShell from "./components/AppShell";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NaruHub — Control Dashboard",
  description: "Track your egg farming accounts in real-time",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${poppins.variable} ${bebas.variable}`} suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-poppins), system-ui, -apple-system, sans-serif" }} suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
