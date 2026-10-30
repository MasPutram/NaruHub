import type { Metadata } from "next";
import { Poppins, Bebas_Neue, Space_Grotesk } from "next/font/google";

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

const spaceGrotesk = Space_Grotesk({
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
    <html lang="id" className={`${poppins.variable} ${bebas.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-poppins), system-ui, -apple-system, sans-serif", margin: 0 }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
