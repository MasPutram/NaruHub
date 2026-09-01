"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError("Username atau password salah");
      }
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      `}</style>
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#09090b",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}>
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
            background: "#facc15", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 18, color: "#09090b", margin: "0 auto 16px",
          }}>NH</div>
          <h1 style={{
            color: "#fafafa",
            fontSize: "22px",
            fontWeight: 800,
            textAlign: "center",
            margin: "0 0 4px",
            letterSpacing: "-.3px",
          }}>NaruHub</h1>
          <p style={{
            color: "#71717a",
            fontSize: "13px",
            textAlign: "center",
            margin: "0 0 32px",
          }}>Steal An Egg — Control Dashboard</p>

          <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            style={{
              width: "100%",
              padding: "10px 12px",
              marginTop: "6px",
              marginBottom: "16px",
              background: "#09090b",
              border: "1px solid #27272a",
              borderRadius: "8px",
              color: "#fafafa",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <label style={{ color: "#a1a1aa", fontSize: "13px", fontWeight: 600 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              marginTop: "6px",
              marginBottom: "24px",
              background: "#09090b",
              border: "1px solid #27272a",
              borderRadius: "8px",
              color: "#fafafa",
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          {error && (
            <p style={{
              color: "#ef4444",
              fontSize: "13px",
              textAlign: "center",
              margin: "0 0 16px",
            }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "#27272a" : "#facc15",
              color: loading ? "#71717a" : "#09090b",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>
      </div>
    </>
  );
}
