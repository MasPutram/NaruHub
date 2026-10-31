import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-numbers",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Narua — Game Store",
  description: "Beli akun & item game Roblox terpercaya",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${manrope.variable} ${mono.variable}`} suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-poppins), system-ui, -apple-system, sans-serif", margin: 0 }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
