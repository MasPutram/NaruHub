"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Row {
  account: string;
  deviceId: string;
  deviceName: string;
  jobId: string;
  placeId: string;
  lastSeen: number;
  inGame: boolean;
  collision: boolean;
}

function ago(ts: number): string {
  if (!ts) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

export default function FleetOverviewPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ total: 0, inGame: 0, collisionServers: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/device-control/presence-overview");
      const data = await res.json();
      if (data.ok) {
        setRows(data.rows || []);
        setSummary({ total: data.total || 0, inGame: data.inGame || 0, collisionServers: data.collisionServers || 0 });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <>
      <style>{`
        :root { --bg:#0b0b12; --card:#14141f; --border:#262636; --ink:#e8e8f0; --dim:#8b8ba3; --accent:#a78bfa; --green:#34d399; --red:#f87171; --yellow:#fbbf24; }
        * { box-sizing:border-box; }
        body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,"Segoe UI",Roboto,sans-serif; padding:28px 34px 50px; }
        .back { border:0; background:none; color:var(--dim); padding:0; margin-bottom:14px; font-size:13px; cursor:pointer; }
        .back:hover { color:var(--ink); }
        h1 { margin:0 0 4px; font-size:24px; }
        .sub { color:var(--dim); font-size:13px; margin-bottom:20px; }
        .stats { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
        .stat { background:var(--card); border:1px solid var(--border); border-top:2px solid var(--accent); border-radius:11px; padding:14px 18px; min-width:130px; }
        .stat.green { border-top-color:var(--green); }
        .stat.red { border-top-color:var(--red); }
        .stat .label { color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
        .stat .value { font-size:22px; font-weight:750; margin-top:6px; }
        .panel { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:6px 14px 14px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th { color:var(--dim); font-size:10px; text-transform:uppercase; text-align:left; padding:10px 8px; border-bottom:1px solid var(--border); }
        td { padding:10px 8px; border-bottom:1px solid #20202d; }
        tr:last-child td { border-bottom:0; }
        tr.collision td { background:rgba(248,113,113,.08); }
        .mono { font-family:ui-monospace,Consolas,monospace; font-size:11px; }
        .badge { padding:3px 7px; border-radius:6px; font-size:10px; font-weight:700; white-space:nowrap; }
        .badge.game { background:#123027; color:var(--green); }
        .badge.off { background:#2b191c; color:var(--red); }
        .badge.warn { background:#2a1a1c; color:var(--red); }
        .empty { color:var(--dim); text-align:center; padding:40px 0; }
      `}</style>

      <button className="back" onClick={() => router.push("/monitor")}>← Back to devices</button>
      <h1>Fleet Overview</h1>
      <div className="sub">Semua clone dari semua device + server-nya. Baris merah = 2+ clone di server yang sama.</div>

      <div className="stats">
        <div className="stat"><div className="label">Total Clone</div><div className="value">{summary.total}</div></div>
        <div className="stat green"><div className="label">In Game</div><div className="value">{summary.inGame}</div></div>
        <div className={`stat ${summary.collisionServers > 0 ? "red" : ""}`}>
          <div className="label">Server Numpuk</div>
          <div className="value">{summary.collisionServers}</div>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty">Memuat...</div>
        ) : rows.length === 0 ? (
          <div className="empty">Belum ada data presence. Restart agent biar heartbeat script ke-deploy.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ACCOUNT</th>
                <th>DEVICE</th>
                <th>SERVER (JOB ID)</th>
                <th>HEARTBEAT</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.deviceId}:${r.account}`} className={r.collision ? "collision" : ""}>
                  <td>{r.account}</td>
                  <td>{r.deviceName}</td>
                  <td className="mono">{r.jobId ? r.jobId.slice(0, 10) + "…" : "—"}</td>
                  <td>{ago(r.lastSeen)}</td>
                  <td>
                    {r.collision ? (
                      <span className="badge warn">NUMPUK</span>
                    ) : r.inGame ? (
                      <span className="badge game">IN GAME</span>
                    ) : (
                      <span className="badge off">OFFLINE</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
