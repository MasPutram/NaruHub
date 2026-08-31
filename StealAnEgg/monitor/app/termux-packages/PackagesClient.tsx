"use client";

import { useEffect, useState } from "react";

interface Package {
  id: string;
  name: string;
  description: string;
  version: string;
}

export default function TermuxPackagesClient({ command }: { command: string }) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/termux/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages || []))
      .catch(() => {});
  }, []);

  function copyCommand() {
    if (!command) return;
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 28px; }
        .eyebrow { color: var(--accent2); font-size: 12px; font-weight: 700; letter-spacing: 1px; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        .subtitle { color: var(--dim); font-size: 13px; margin-bottom: 24px; }
        .section { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
        .section-title { color: var(--accent2); font-size: 13px; font-weight: 800; letter-spacing: .5px; margin-bottom: 14px; }
        .command-box {
          background: var(--bg); border: 1px solid var(--card-border); border-radius: 10px;
          padding: 14px 16px; font-family: "Cascadia Code", "Fira Code", monospace; font-size: 13px;
          word-break: break-all; color: var(--green); min-height: 48px;
          display: flex; align-items: center; gap: 12px;
        }
        .command-text { flex: 1; }
        .copy-btn {
          background: var(--accent); color: #1a1030; border: none; border-radius: 8px;
          padding: 8px 16px; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap;
        }
        .copy-btn:hover { filter: brightness(1.1); }
        .copy-btn:disabled { opacity: .6; cursor: default; }
        .steps { color: var(--dim); font-size: 13px; line-height: 1.8; }
        .steps code { background: #1c1c2b; padding: 2px 6px; border-radius: 4px; color: var(--ink); font-size: 12px; }
        .pkg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
        .pkg-card { background: var(--bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 14px 16px; }
        .pkg-name { font-weight: 800; font-size: 15px; margin-bottom: 4px; }
        .pkg-desc { color: var(--dim); font-size: 12px; margin-bottom: 6px; }
        .pkg-ver { color: var(--accent); font-size: 11px; font-weight: 700; }
        .empty { color: var(--dim); font-size: 13px; }
      `}</style>

      <div style={{ marginBottom: 4 }}>
        <div className="eyebrow">TERMUX CLIENT</div>
        <h1>Command</h1>
      </div>
      <div className="subtitle">Command tetap (key sudah dipatenkan) -- tinggal copy & paste ke Termux / Cloud instance manapun.</div>

      <div className="section">
        <div className="section-title">COMMAND</div>
        {command ? (
          <div className="command-box">
            <div className="command-text">{command}</div>
            <button className="copy-btn" onClick={copyCommand}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="empty">ACCESS_KEY belum diset di server (.env).</div>
        )}
      </div>

      <div className="section">
        <div className="section-title">CARA PAKAI</div>
        <div className="steps">
          1. Buka <code>Termux</code> di HP atau Cloud instance<br />
          2. Paste command di atas -- sama persis buat semua device, ga perlu diganti-ganti<br />
          3. Setiap instance otomatis generate <code>deviceId</code> unik<br />
          4. Device akan muncul di halaman <a href="/termux" style={{ color: "var(--accent2)" }}>Monitor Devices</a><br />
          5. Heartbeat dikirim setiap 2 menit untuk update status online
        </div>
      </div>

      <div className="section">
        <div className="section-title">AVAILABLE PACKAGES</div>
        {packages.length === 0 ? (
          <div className="empty">Belum ada package tersedia.</div>
        ) : (
          <div className="pkg-grid">
            {packages.map((p) => (
              <div key={p.id} className="pkg-card">
                <div className="pkg-name">{p.name}</div>
                <div className="pkg-desc">{p.description}</div>
                <div className="pkg-ver">v{p.version}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
