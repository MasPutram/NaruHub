"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#09090b",
      color: "#fafafa",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
        <p style={{ color: "#71717a", fontSize: 14, marginBottom: 16 }}>{error.message}</p>
        <button
          onClick={reset}
          style={{
            padding: "10px 24px",
            background: "#facc15",
            color: "#09090b",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
