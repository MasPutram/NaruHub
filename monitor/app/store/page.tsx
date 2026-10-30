"use client";

export default function StorePage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090b",
      color: "#fafafa",
      padding: "40px 20px",
      maxWidth: 960,
      margin: "0 auto",
    }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Katalog</h1>
      <p style={{ color: "#71717a", fontSize: 14, marginBottom: 32 }}>Produk akan segera tersedia.</p>
      <div style={{
        padding: 40,
        background: "#18181b",
        borderRadius: 12,
        textAlign: "center",
        color: "#52525b",
        border: "1px solid #27272a",
      }}>
        Belum ada produk yang tersedia
      </div>
    </div>
  );
}
