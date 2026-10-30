import Link from "next/link";

export default function LandingPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090b",
      color: "#fafafa",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "40px 20px",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 900, fontSize: 28, color: "#fff", marginBottom: 24,
      }}>NR</div>
      <h1 style={{
        fontSize: "clamp(36px, 6vw, 56px)",
        fontWeight: 900,
        letterSpacing: "-1px",
        margin: "0 0 12px",
        fontFamily: "var(--font-bebas), system-ui",
      }}>NARUA</h1>
      <p style={{
        fontSize: "18px",
        color: "#a1a1aa",
        maxWidth: 420,
        margin: "0 0 40px",
        lineHeight: 1.6,
      }}>
        Tempat jual-beli akun & item game Roblox terpercaya
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/store" style={{
          padding: "14px 32px",
          background: "#ef4444",
          color: "#fff",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
          transition: "opacity .15s",
        }}>Lihat Katalog</Link>
        <Link href="/login" style={{
          padding: "14px 32px",
          background: "#18181b",
          color: "#fafafa",
          border: "1px solid #27272a",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 15,
          textDecoration: "none",
        }}>Masuk</Link>
      </div>
      <p style={{ color: "#52525b", fontSize: 13, marginTop: 60 }}>Coming soon — full store experience</p>
    </div>
  );
}
