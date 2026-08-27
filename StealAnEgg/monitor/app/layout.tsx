import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Steal An Egg — Monitor",
  description: "Track your egg farming accounts in real-time",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
