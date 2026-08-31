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
        router.push("/");
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
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f172a",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "#1e293b",
        padding: "40px",
        borderRadius: "16px",
        width: "100%",
        maxWidth: "380px",
        boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
      }}>
        <h1 style={{
          color: "#f1f5f9",
          fontSize: "24px",
          fontWeight: 700,
          textAlign: "center",
          margin: "0 0 8px",
        }}>NaruHub</h1>
        <p style={{
          color: "#64748b",
          fontSize: "14px",
          textAlign: "center",
          margin: "0 0 32px",
        }}>Monitor Dashboard</p>

        <label style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 500 }}>
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
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "8px",
            color: "#f1f5f9",
            fontSize: "15px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        <label style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 500 }}>
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
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "8px",
            color: "#f1f5f9",
            fontSize: "15px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <p style={{
            color: "#f87171",
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
            background: loading ? "#334155" : "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Masuk..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}
