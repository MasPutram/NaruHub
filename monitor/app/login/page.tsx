"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

type Tab = "user" | "admin";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body = tab === "admin" ? { key } : { email, password };
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(data.role === "admin" ? "/dashboard" : "/store");
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Login gagal");
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
        .login-tab { flex: 1; padding: 10px; border: none; cursor: pointer; font-size: 13px; font-weight: 700; border-radius: 8px; transition: all .15s; }
        .login-tab.active { background: ${accent}; color: #fff; }
        .login-tab:not(.active) { background: transparent; color: #71717a; }
        .login-tab:not(.active):hover { color: #a1a1aa; }
        .login-input { width: 100%; padding: 10px 12px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 14px; outline: none; box-sizing: border-box; }
        .login-input:focus { border-color: ${accent}; }
        .login-btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
        .login-btn:disabled { opacity: .5; cursor: not-allowed; }
        .login-link { color: ${accent}; text-decoration: none; font-weight: 600; }
        .login-link:hover { text-decoration: underline; }
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
        }}>Narua</h1>
        <p style={{
          color: "#71717a", fontSize: "13px", textAlign: "center", margin: "0 0 24px",
        }}>Masuk ke akunmu</p>

        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "#18181b", borderRadius: 10, padding: 4 }}>
          <button type="button" className={`login-tab ${tab === "user" ? "active" : ""}`} onClick={() => { setTab("user"); setError(""); }}>User</button>
          <button type="button" className={`login-tab ${tab === "admin" ? "active" : ""}`} onClick={() => { setTab("admin"); setError(""); }}>Admin</button>
        </div>

        {tab === "user" ? (
          <>
            <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>Email</label>
            <input className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@contoh.com" required autoFocus style={{ marginTop: 6, marginBottom: 16 }} />
            <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>Password</label>
            <input className="login-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password" required style={{ marginTop: 6, marginBottom: 24 }} />
          </>
        ) : (
          <>
            <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>Access Key</label>
            <input className="login-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Masukkan access key" required autoFocus style={{ marginTop: 6, marginBottom: 24 }} />
          </>
        )}

        {error && (
          <p style={{ color: "#ef4444", fontSize: "13px", textAlign: "center", margin: "0 0 16px" }}>{error}</p>
        )}

        <button type="submit" disabled={loading} className="login-btn" style={{ background: loading ? "#27272a" : accent, color: "#fff" }}>
          {loading ? "Masuk..." : "Masuk"}
        </button>

        {tab === "user" && (
          <p style={{ color: "#71717a", fontSize: "13px", textAlign: "center", marginTop: 20 }}>
            Belum punya akun? <a href="/register" className="login-link">Daftar</a>
          </p>
        )}
      </form>
    </div>
  );
}
