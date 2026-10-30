"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Password tidak cocok");
      return;
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, wa_number: waNumber, password }),
      });

      if (res.ok) {
        router.push("/store");
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Registrasi gagal");
      }
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  const accent = "#ef4444";

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#09090b",
    }}>
      <style>{`
        .reg-input { width: 100%; padding: 10px 12px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 14px; outline: none; box-sizing: border-box; }
        .reg-input:focus { border-color: ${accent}; }
        .reg-btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
        .reg-btn:disabled { opacity: .5; cursor: not-allowed; }
        .reg-link { color: ${accent}; text-decoration: none; font-weight: 600; }
        .reg-link:hover { text-decoration: underline; }
      `}</style>

      <form onSubmit={handleSubmit} style={{
        background: "#0f0f11",
        border: "1px solid #27272a",
        padding: "40px",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "380px",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          background: accent, display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 18, color: "#fff", margin: "0 auto 16px",
        }}>NR</div>
        <h1 style={{
          color: "#fafafa", fontSize: "22px", fontWeight: 800,
          textAlign: "center", margin: "0 0 4px", letterSpacing: "-.3px",
        }}>Daftar Akun</h1>
        <p style={{
          color: "#71717a", fontSize: "13px", textAlign: "center", margin: "0 0 24px",
        }}>Buat akun Narua untuk mulai belanja</p>

        <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>Email</label>
        <input className="reg-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@contoh.com" required autoFocus style={{ marginTop: 6, marginBottom: 16 }} />

        <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>Nomor WhatsApp</label>
        <input className="reg-input" type="tel" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} placeholder="628xxxxxxxxxx" required style={{ marginTop: 6, marginBottom: 16 }} />

        <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>Password</label>
        <input className="reg-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" required style={{ marginTop: 6, marginBottom: 16 }} />

        <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>Konfirmasi Password</label>
        <input className="reg-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Ulangi password" required style={{ marginTop: 6, marginBottom: 24 }} />

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", textAlign: "center", margin: "0 0 16px" }}>{error}</p>
        )}

        <button type="submit" disabled={loading} className="reg-btn" style={{ background: loading ? "#27272a" : accent, color: "#fff" }}>
          {loading ? "Mendaftar..." : "Daftar"}
        </button>

        <p style={{ color: "#71717a", fontSize: "13px", textAlign: "center", marginTop: 20 }}>
          Sudah punya akun? <a href="/login" className="reg-link">Masuk</a>
        </p>
      </form>
    </div>
  );
}
