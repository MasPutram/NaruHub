"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Pet {
  category: string;
  name?: string;
  rate: number;
  mutations?: string[];
}

interface Account {
  sourceAccount: string;
  money: number | null;
  speed: number | null;
  incomeAktif: number | null;
  highValuePetTotal: number | null;
  petsCount: number;
  stolenCount: number;
  mutationToken?: number | null;
  topPets: Pet[];
  online: boolean;
  moderated?: boolean;
  resolved?: boolean;
  moderatedAt?: number;
  resolvedAt?: number;
  detail?: {
    activePets?: Pet[];
    activeLimit?: number;
    allPets?: Pet[];
    growingEggs?: Pet[];
    backpackEggs?: Pet[];
  };
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function fmtRate(v: number): string {
  return fmtMoney(v) + "/s";
}

function fmtCompact(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + "T+";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B+";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M+";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K+";
  return n.toLocaleString("en-US");
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function mutColor(mut: string): string {
  const m = mut.toLowerCase();
  if (m.includes("rainbow")) return "#9333ea";
  if (m.includes("golden")) return "#ca8a04";
  if (m.includes("diamond")) return "#2563eb";
  if (m.includes("titanium")) return "#64748b";
  return "#6366f1";
}

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function deviceLabel(name: string): string | null {
  const num = accountNumber(name);
  if (num === null || isNaN(num)) return null;
  const start = Math.floor((num - 1) / 10) * 10 + 1;
  return "SAE " + start;
}

type TabMode = "moderated" | "resolved";

export default function ModeratedPageWrapper() {
  return <Suspense><ModeratedPageInner /></Suspense>;
}

function ModeratedPageInner() {
  const searchParams = useSearchParams();
  const [moderatedAccounts, setModeratedAccounts] = useState<Account[]>([]);
  const [resolvedAccounts, setResolvedAccounts] = useState<Account[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tabMode, setTabMode] = useState<TabMode>(
    searchParams.get("tab") === "resolved" ? "resolved" : "moderated"
  );
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const fetchModerated = useCallback(async () => {
    try {
      const res = await fetch("/api/moderated-accounts");
      const data = await res.json();
      setModeratedAccounts(data.accounts || []);
    } catch {}
  }, []);

  const fetchResolved = useCallback(async () => {
    try {
      const res = await fetch("/api/resolved-moderated-accounts");
      const data = await res.json();
      setResolvedAccounts(data.accounts || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchModerated();
    fetchResolved();
    const id = setInterval(() => {
      fetchModerated();
      fetchResolved();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchModerated, fetchResolved]);

  async function resolveAccount(account: string) {
    setActionMsg((prev) => ({ ...prev, [account]: "Memproses..." }));
    try {
      const res = await fetch("/api/resolve-moderated", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setModeratedAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
        fetchResolved();
        setActionMsg((prev) => ({ ...prev, [account]: "" }));
      } else {
        setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + (body.error || "unknown") }));
      }
    } catch (e: any) {
      setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + e.message }));
    }
  }

  function filtered(): Account[] {
    const list = tabMode === "moderated" ? [...moderatedAccounts] : [...resolvedAccounts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return list.filter((a) => a.sourceAccount.toLowerCase().includes(q));
    }
    return list;
  }

  const visible = filtered();

  return (
    <div>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --gold: #fbbf24; --red: #f87171;
          --warn: #f59e0b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }

        .topbar {
          background: var(--card); border-bottom: 1px solid var(--card-border);
          padding: 16px 28px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          position: sticky; top: 0; z-index: 50;
        }
        .topbar h1 { font-size: 20px; color: var(--ink); }

        .tab-bar {
          display: flex; gap: 0; padding: 0 28px; margin-top: 12px;
        }
        .tab-btn {
          background: var(--card); color: var(--dim); border: 1px solid var(--card-border);
          border-bottom: none; border-radius: 10px 10px 0 0;
          padding: 10px 24px; font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all .15s;
        }
        .tab-btn.active { background: var(--bg); color: var(--ink); border-color: var(--warn); border-bottom: 1px solid var(--bg); }
        .tab-btn .tab-badge {
          display: inline-block; background: var(--warn); color: #1a1030;
          font-size: 10px; font-weight: 800; border-radius: 8px; padding: 1px 7px; margin-left: 8px;
        }
        .tab-btn.resolved-tab.active { border-color: var(--green); }
        .tab-btn.resolved-tab .tab-badge { background: var(--green); }

        .controls {
          display: flex; gap: 10px; align-items: center; padding: 16px 28px; flex-wrap: wrap;
        }
        .controls label { color: var(--dim); font-size: 12px; font-weight: 700; }
        .controls input {
          background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 6px 12px; font-size: 13px;
        }
        .controls input:focus { outline: none; border-color: var(--warn); }

        .summary {
          display: flex; gap: 12px; padding: 16px 28px; flex-wrap: wrap;
        }
        .scard {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 12px;
          padding: 14px 20px; min-width: 150px; flex: 1;
        }
        .slabel { font-size: 10px; font-weight: 700; color: var(--dim); letter-spacing: 1px; }
        .sval { font-size: 22px; font-weight: 900; margin-top: 4px; }

        .mod-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 16px; padding: 16px 28px 60px;
        }

        .mod-card {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 14px;
          padding: 0; overflow: hidden; position: relative; transition: border-color .15s;
        }
        .mod-card:hover { border-color: var(--warn); }
        .mod-card.resolved-card:hover { border-color: var(--green); }

        .mc-head {
          display: flex; align-items: center; gap: 8px; padding: 14px 16px 8px;
        }
        .mc-name { font-weight: 800; font-size: 15px; }
        .mc-device {
          background: #262636; color: var(--dim); font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 6px;
        }
        .mc-badge {
          margin-left: auto; font-size: 10px; font-weight: 800; padding: 3px 10px;
          border-radius: 6px;
        }
        .mc-badge.warn { background: rgba(245,158,11,0.15); color: var(--warn); }
        .mc-badge.ok { background: rgba(52,211,153,0.15); color: var(--green); }

        .mc-date {
          padding: 0 16px 8px; font-size: 11px; color: var(--dim);
        }

        .mc-stats {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
          background: var(--card-border); margin: 0 16px; border-radius: 10px; overflow: hidden;
        }
        .mc-stat {
          background: var(--card); padding: 8px 10px; text-align: center;
        }
        .mc-stat .mslabel { font-size: 9px; font-weight: 700; color: var(--dim); letter-spacing: .5px; }
        .mc-stat .msval { font-size: 14px; font-weight: 800; margin-top: 2px; }

        .mc-pets {
          display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 16px;
        }
        .mc-pet {
          background: #1a1a2e; border-radius: 8px; padding: 4px 10px;
        }
        .mc-pet .mpname { font-size: 11px; font-weight: 700; }
        .mc-pet .mprate { font-size: 10px; color: var(--accent2); font-weight: 700; }
        .mc-pet .mpmut { font-size: 9px; font-weight: 800; }

        .mc-actions {
          display: flex; gap: 8px; padding: 12px 16px;
        }
        .mc-actions button {
          flex: 1; text-align: center; padding: 8px; border-radius: 8px;
          font-size: 12px; font-weight: 800; cursor: pointer; border: none;
        }
        .btn-resolve { background: var(--green); color: #052e10; }
        .btn-resolve:hover { filter: brightness(1.1); }
        .btn-poster-link {
          background: #262636; color: var(--ink); border: 1px solid var(--card-border) !important;
          text-decoration: none; display: flex; align-items: center; justify-content: center;
          flex: 1; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 800;
        }
        .btn-poster-link:hover { border-color: var(--accent2) !important; }

        .resolved-overlay {
          position: absolute; inset: 0; z-index: 10; pointer-events: none;
          display: flex; align-items: center; justify-content: center;
        }
        .resolved-watermark span {
          font-size: 32px; font-weight: 900; color: rgba(52, 211, 153, 0.15);
          letter-spacing: 6px; transform: rotate(-15deg);
        }
        .resolved-date-badge {
          position: absolute; top: 12px; right: 12px; z-index: 15;
          background: rgba(52,211,153,0.15); color: var(--green); font-size: 11px; font-weight: 800;
          padding: 4px 12px; border-radius: 8px;
        }

        .empty { color: var(--dim); text-align: center; padding: 60px 28px; font-size: 14px; }
      `}</style>

      <div className="topbar">
        <h1>Captcha / Moderated</h1>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          {tabMode === "moderated"
            ? `${moderatedAccounts.length} akun moderated`
            : `${resolvedAccounts.length} akun resolved`}
        </span>
      </div>

      <div className="tab-bar">
        <button
          className={`tab-btn ${tabMode === "moderated" ? "active" : ""}`}
          onClick={() => setTabMode("moderated")}
        >
          Moderated
          <span className="tab-badge">{moderatedAccounts.length}</span>
        </button>
        <button
          className={`tab-btn resolved-tab ${tabMode === "resolved" ? "active" : ""}`}
          onClick={() => setTabMode("resolved")}
        >
          Resolved
          <span className="tab-badge">{resolvedAccounts.length}</span>
        </button>
      </div>

      <div className="controls">
        <label>Cari:</label>
        <input
          type="text"
          placeholder="Nama akun..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 200 }}
        />
      </div>

      <div className="summary">
        <div className="scard">
          <div className="slabel">{tabMode === "moderated" ? "AKUN MODERATED" : "AKUN RESOLVED"}</div>
          <div className="sval" style={{ color: tabMode === "moderated" ? "var(--warn)" : "var(--green)" }}>
            {visible.length}
          </div>
        </div>
        <div className="scard">
          <div className="slabel">TOTAL SPEED</div>
          <div className="sval" style={{ color: "var(--accent)" }}>
            {fmtCompact(visible.reduce((s, a) => s + (Number(a.speed) || 0), 0))}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          {tabMode === "moderated"
            ? moderatedAccounts.length > 0
              ? "Ga ada akun yang cocok dengan pencarian."
              : "Belum ada akun yang di-moderated."
            : resolvedAccounts.length > 0
              ? "Ga ada akun resolved yang cocok dengan pencarian."
              : "Belum ada akun yang resolved."}
        </div>
      ) : (
        <div className="mod-grid">
          {visible.map((a) => (
            <div key={a.sourceAccount} className={`mod-card ${a.resolved ? "resolved-card" : ""}`}>
              {a.resolved && (
                <>
                  <div className="resolved-overlay">
                    <div className="resolved-watermark">
                      <span>RESOLVED</span>
                    </div>
                  </div>
                  {a.resolvedAt && <div className="resolved-date-badge">{fmtDate(a.resolvedAt)}</div>}
                </>
              )}

              <div className="mc-head">
                <span className="mc-name">{a.sourceAccount}</span>
                {deviceLabel(a.sourceAccount) && (
                  <span className="mc-device">{deviceLabel(a.sourceAccount)}</span>
                )}
                <span className={`mc-badge ${a.resolved ? "ok" : "warn"}`}>
                  {a.resolved ? "RESOLVED" : "CAPTCHA"}
                </span>
              </div>

              <div className="mc-date">
                {a.resolved && a.resolvedAt
                  ? `Resolved: ${fmtDate(a.resolvedAt)}`
                  : a.moderatedAt
                    ? `Moderated: ${fmtDate(a.moderatedAt)}`
                    : ""}
              </div>

              <div className="mc-stats">
                <div className="mc-stat">
                  <div className="mslabel">SPEED</div>
                  <div className="msval">{fmtCompact(a.speed)}</div>
                </div>
                <div className="mc-stat">
                  <div className="mslabel">CASH</div>
                  <div className="msval">{fmtMoney(a.money)}</div>
                </div>
              </div>

              {(a.topPets || []).length > 0 && (
                <div className="mc-pets">
                  {a.topPets.slice(0, 5).map((p, i) => (
                    <div key={i} className="mc-pet">
                      <div className="mpname">{p.name || p.category}</div>
                      <div className="mprate">{fmtRate(p.rate)}</div>
                      {p.mutations && p.mutations.length > 0 && (
                        <div className="mpmut" style={{ color: mutColor(p.mutations[0]) }}>
                          {p.mutations.map((m) => m.toUpperCase()).join("+")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mc-actions" style={{ position: "relative", zIndex: 15 }}>
                <a
                  className="btn-poster-link"
                  href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`}
                >
                  Poster
                </a>
                {!a.resolved && (
                  <button
                    className="btn-resolve"
                    onClick={() => resolveAccount(a.sourceAccount)}
                  >
                    Resolved
                  </button>
                )}
              </div>
              {actionMsg[a.sourceAccount] && (
                <div style={{ fontSize: 11, color: "#f87171", padding: "0 16px 10px" }}>{actionMsg[a.sourceAccount]}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
