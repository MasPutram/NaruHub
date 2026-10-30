"use client";

import { useParams } from "next/navigation";

export default function ProductDetailPage() {
  const { id } = useParams();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090b",
      color: "#fafafa",
      padding: "40px 20px",
      maxWidth: 960,
      margin: "0 auto",
    }}>
      <a href="/store" style={{ color: "#ef4444", fontSize: 14, textDecoration: "none", fontWeight: 600 }}>← Kembali ke katalog</a>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 16, marginBottom: 8 }}>Detail Produk</h1>
      <p style={{ color: "#71717a", fontSize: 14 }}>Produk ID: {id}</p>
      <div style={{
        padding: 40,
        background: "#18181b",
        borderRadius: 12,
        textAlign: "center",
        color: "#52525b",
        border: "1px solid #27272a",
        marginTop: 24,
      }}>
        Halaman detail produk — segera hadir
      </div>
    </div>
  );
}
