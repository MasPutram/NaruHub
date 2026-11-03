import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Narua — Game Store",
  description: "Beli akun & item game Roblox terpercaya",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --font-poppins: 'Manrope', system-ui, -apple-system, sans-serif;
            --font-numbers: 'JetBrains Mono', ui-monospace, monospace;
          }
        `}} />
      </head>
      <body style={{ fontFamily: "var(--font-poppins), system-ui, -apple-system, sans-serif", margin: 0 }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
