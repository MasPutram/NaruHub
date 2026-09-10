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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  // Group clones by device.
  const byDevice = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.deviceName || r.deviceId || "?";
    if (!byDevice.has(k)) byDevice.set(k, []);
    byDevice.get(k)!.push(r);
  }
  const devices = Array.from(byDevice.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  function toggle(name: string) {
    setExpanded((p) => ({ ...p, [name]: !p[name] }));
  }

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
        .stats { display:flex; gap:12px; margin-bottom:22px; flex-wrap:wrap; }
        .stat { background:var(--card); border:1px solid var(--border); border-top:2px solid var(--accent); border-radius:11px; padding:14px 18px; min-width:130px; }
        .stat.green { border-top-color:var(--green); }
        .stat.red { border-top-color:var(--red); }
        .stat .label { color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
        .stat .value { font-size:22px; font-weight:750; margin-top:6px; }

        .devgroup { background:var(--card); border:1px solid var(--border); border-radius:10px; margin-bottom:10px; overflow:hidden; }
        .devgroup.bad { border-color:#5a2a2f; }
        .devhead { display:flex; align-items:center; gap:12px; padding:14px 16px; cursor:pointer; user-select:none; }
        .devhead:hover { background:#181824; }
        .caret { color:var(--dim); font-size:12px; width:12px; }
        .devname { font-weight:800; font-size:15px; }
        .devmeta { color:var(--dim); font-size:12px; margin-left:auto; }
        .dot { width:9px; height:9px; border-radius:50%; }
        .dot.ok { background:var(--green); box-shadow:0 0 8px var(--green); }
        .dot.bad { background:var(--red); box-shadow:0 0 8px var(--red); }

        .badge { padding:3px 9px; border-radius:6px; font-size:10px; font-weight:800; white-space:nowrap; letter-spacing:.3px; }
        .badge.ok { background:#123027; color:var(--green); }
        .badge.warn { background:#2b191c; color:var(--red); }
        .badge.game { background:#123027; color:var(--green); }
        .badge.off { background:#1e1e2a; color:var(--dim); }

        .devbody { border-top:1px solid var(--border); }
        .clone { display:flex; align-items:center; gap:12px; padding:9px 16px 9px 30px; border-bottom:1px solid #1c1c28; font-size:12px; }
        .clone:last-child { border-bottom:0; }
        .clone.collision { background:rgba(248,113,113,.07); }
        .idx { color:var(--dim); width:22px; }
        .cacc { font-weight:700; min-width:150px; }
        .mono { font-family:ui-monospace,Consolas,monospace; font-size:11px; color:var(--dim); min-width:110px; }
        .hb { color:var(--dim); min-width:44px; }
        .clone .badge { margin-left:auto; }

        .empty { color:var(--dim); text-align:center; padding:40px 0; }
      `}</style>

      <button className="back" onClick={() => router.push("/monitor")}>← Back to devices</button>
      <h1>Fleet Overview</h1>
      <div className="sub">Klik device buat expand. Badge merah = ada clone yang numpuk seserver, hijau = aman.</div>

      <div className="stats">
        <div className="stat"><div className="label">Total Clone</div><div className="value">{summary.total}</div></div>
        <div className="stat green"><div className="label">In Game</div><div className="value">{summary.inGame}</div></div>
        <div className={`stat ${summary.collisionServers > 0 ? "red" : ""}`}>
          <div className="label">Server Numpuk</div>
          <div className="value">{summary.collisionServers}</div>
        </div>
      </div>

      {loading ? (
        <div className="empty">Memuat...</div>
      ) : devices.length === 0 ? (
        <div className="empty">Belum ada data presence. Restart agent biar heartbeat script ke-deploy.</div>
      ) : (
        devices.map(([name, drows]) => {
          const bad = drows.some((r) => r.collision);
          const inGame = drows.filter((r) => r.inGame).length;
          const open = !!expanded[name];
          return (
            <div className={`devgroup ${bad ? "bad" : ""}`} key={name}>
              <div className="devhead" onClick={() => toggle(name)}>
                <span className="caret">{open ? "▾" : "▸"}</span>
                <span className={`dot ${bad ? "bad" : "ok"}`} />
                <span className="devname">{name}</span>
                <span className={`badge ${bad ? "warn" : "ok"}`}>{bad ? "NUMPUK" : "AMAN"}</span>
                <span className="devmeta">{inGame}/{drows.length} in-game</span>
              </div>
              {open && (
                <div className="devbody">
                  {drows.map((r, i) => (
                    <div className={`clone ${r.collision ? "collision" : ""}`} key={r.account}>
                      <span className="idx">{i + 1}.</span>
                      <span className="cacc">{r.account}</span>
                      <span className="mono">{r.jobId ? r.jobId.slice(0, 10) + "…" : "—"}</span>
                      <span className="hb">{ago(r.lastSeen)}</span>
                      <span className={`badge ${r.collision ? "warn" : r.inGame ? "game" : "off"}`}>
                        {r.collision ? "NUMPUK" : r.inGame ? "IN GAME" : "OFFLINE"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
