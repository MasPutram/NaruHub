"use client";

import { useEffect, useState, useCallback } from "react";

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
  incomeEggBackpack: number | null;
  incomeEggSedangTumbuh: number | null;
  highValuePetTotal: number | null;
  kandangLevel: number | null;
  treadmillLevel: number | null;
  petsCount: number;
  stolenCount: number;
  topPets: Pet[];
  online: boolean;
  forSale?: boolean;
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

function accountNumber(name: string): number | null {
  const m = name.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function deviceBlockStart(num: number | null): number | null {
  if (num === null || isNaN(num)) return null;
  return Math.floor((num - 1) / 10) * 10 + 1;
}

function deviceLabel(name: string): string | null {
  const start = deviceBlockStart(accountNumber(name));
  return start === null ? null : "SAE " + start;
}

function mutColor(mut: string): string {
  const m = mut.toLowerCase();
  if (m.includes("rainbow")) return "#9333ea";
  if (m.includes("golden")) return "#ca8a04";
  if (m.includes("diamond")) return "#2563eb";
  if (m.includes("titanium")) return "#64748b";
  return "#6366f1";
}

type SortMode = "name" | "speed" | "income" | "money" | "pets" | "eggs";

export default function CatalogPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  async function unmarkForSale(account: string) {
    setActionMsg((prev) => ({ ...prev, [account]: "Memproses..." }));
    try {
      const res = await fetch("/api/mark-forsale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, forSale: false }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
      } else {
        setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + (body.error || "unknown") }));
      }
    } catch (e: any) {
      setActionMsg((prev) => ({ ...prev, [account]: "Gagal: " + e.message }));
    }
  }

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog-accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccounts();
    const id = setInterval(fetchAccounts, 10000);
    return () => clearInterval(id);
  }, [fetchAccounts]);

  function filtered(): Account[] {
    let list = [...accounts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.sourceAccount.toLowerCase().includes(q) ||
          (deviceLabel(a.sourceAccount) || "").toLowerCase().includes(q)
      );
    }
    switch (sortMode) {
      case "speed":
        list.sort((a, b) => (Number(b.speed) || 0) - (Number(a.speed) || 0));
        break;
      case "income":
        list.sort((a, b) => (Number(b.incomeAktif) || 0) - (Number(a.incomeAktif) || 0));
        break;
      case "money":
        list.sort((a, b) => (Number(b.money) || 0) - (Number(a.money) || 0));
        break;
      case "pets":
        list.sort((a, b) => (b.petsCount || 0) - (a.petsCount || 0));
        break;
      case "eggs":
        list.sort((a, b) => (b.stolenCount || 0) - (a.stolenCount || 0));
        break;
      default:
        list.sort((a, b) => {
          const na = accountNumber(a.sourceAccount);
          const nb = accountNumber(b.sourceAccount);
          if (na !== null && nb !== null) return na - nb;
          return a.sourceAccount.localeCompare(b.sourceAccount);
        });
    }
    return list;
  }

  const visible = filtered();
  const onlineCount = visible.filter((a) => a.online).length;
  const totalMoney = visible.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalSpeed = visible.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const totalPets = visible.reduce((s, a) => s + (a.petsCount || 0), 0);
  const totalStolen = visible.reduce((s, a) => s + (a.stolenCount || 0), 0);

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --gold: #fbbf24;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }

        .topbar {
          background: var(--card); border-bottom: 1px solid var(--card-border);
          padding: 16px 28px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          position: sticky; top: 0; z-index: 50;
        }
        .topbar a { color: var(--accent); text-decoration: none; font-size: 14px; font-weight: 700; }
        .topbar h1 { font-size: 20px; color: var(--ink); }
        .topbar .sep { width: 1px; height: 20px; background: var(--card-border); }

        .controls {
          padding: 16px 28px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .controls label { color: var(--dim); font-size: 12px; font-weight: 700; }
        .controls select, .controls input {
          background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700;
        }
        .controls select:focus, .controls input:focus { outline: none; border-color: var(--accent); }
        .viewtoggle {
          margin-left: auto; display: flex; gap: 4px;
        }
        .viewtoggle button {
          background: var(--card); color: var(--dim); border: 1px solid var(--card-border);
          border-radius: 6px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .viewtoggle button.active { background: var(--accent); color: #1a1030; border-color: var(--accent); }

        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; padding: 0 28px 16px; }
        .scard { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px 14px; }
        .scard .slabel { color: var(--dim); font-size: 10px; font-weight: 700; letter-spacing: .5px; }
        .scard .sval { font-size: 22px; font-weight: 800; margin-top: 4px; }

        .catalog-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px; padding: 0 28px 28px;
        }
        .catalog-card {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 16px;
          padding: 20px; transition: border-color .15s;
        }
        .catalog-card:hover { border-color: var(--accent); }
        .cc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
        .cc-dot { width: 10px; height: 10px; border-radius: 50%; }
        .cc-dot.on { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .cc-dot.off { background: #555; }
        .cc-name { font-size: 18px; font-weight: 800; }
        .cc-device { color: var(--accent2); font-size: 10px; font-weight: 700; background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 6px; padding: 2px 6px; }
        .cc-status { margin-left: auto; font-size: 11px; color: var(--dim); }

        .cc-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
        .cc-stat .cslabel { font-size: 10px; font-weight: 700; color: var(--dim); }
        .cc-stat .csval { font-size: 16px; font-weight: 700; }
        .cc-stat.speed .csval { color: var(--accent); }
        .cc-stat.money .csval { color: var(--gold); }
        .cc-stat.income .csval { color: var(--green); }

        .cc-pets { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 14px; }
        .cc-pet {
          background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 8px;
          padding: 4px 8px; text-align: center; min-width: 80px; flex-shrink: 0;
        }
        .cc-pet .cpname { font-size: 10px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72px; }
        .cc-pet .cprate { font-size: 10px; color: var(--gold); font-weight: 700; }
        .cc-pet .cpmut { font-size: 8px; font-weight: 700; }

        .cc-actions { display: flex; gap: 8px; }
        .cc-actions a {
          flex: 1; text-align: center; padding: 8px; border-radius: 8px;
          font-size: 12px; font-weight: 800; text-decoration: none; cursor: pointer;
        }
        .btn-poster { background: var(--accent); color: #1a1030; }
        .btn-poster:hover { filter: brightness(1.1); }
        .btn-detail { background: #262636; color: var(--ink); border: 1px solid var(--card-border); }
        .btn-detail:hover { border-color: var(--accent2); }

        .catalog-table { width: 100%; border-collapse: collapse; margin: 0 28px 28px; max-width: calc(100% - 56px); }
        .catalog-table th {
          background: var(--card); color: var(--dim); font-size: 11px; font-weight: 700;
          text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--card-border);
          position: sticky; top: 56px;
        }
        .catalog-table td {
          padding: 10px 12px; border-bottom: 1px solid var(--card-border); font-size: 13px;
        }
        .catalog-table tr:hover td { background: rgba(167, 139, 250, .05); }
        .catalog-table .tname { font-weight: 800; }
        .catalog-table .tonline { color: var(--green); }
        .catalog-table .toffline { color: #555; }
        .catalog-table a { color: var(--accent); text-decoration: none; font-weight: 700; }
        .catalog-table a:hover { text-decoration: underline; }

        .empty { color: var(--dim); text-align: center; padding: 60px 28px; font-size: 14px; }
      `}</style>

      <div className="topbar">
        <a href="/">← Dashboard</a>
        <div className="sep" />
        <h1>Katalog Akun</h1>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          {accounts.length} akun ({onlineCount} online)
        </span>
      </div>

      <div className="controls">
        <label>Urutkan:</label>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
          <option value="name">Nama (Nomor)</option>
          <option value="speed">Speed Tertinggi</option>
          <option value="income">Income Tertinggi</option>
          <option value="money">Cash Terbanyak</option>
          <option value="pets">Pet Terbanyak</option>
          <option value="eggs">Egg Stolen Terbanyak</option>
        </select>
        <label>Cari:</label>
        <input
          type="text"
          placeholder="Nama akun / device..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 200 }}
        />
        <div className="viewtoggle">
          <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")}>
            Grid
          </button>
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Tabel
          </button>
        </div>
      </div>

      <div className="summary">
        <div className="scard">
          <div className="slabel">TOTAL AKUN</div>
          <div className="sval">{visible.length}</div>
        </div>
        <div className="scard">
          <div className="slabel">ONLINE</div>
          <div className="sval" style={{ color: "var(--green)" }}>{onlineCount}</div>
        </div>
        <div className="scard">
          <div className="slabel">TOTAL MONEY</div>
          <div className="sval" style={{ color: "var(--gold)" }}>{fmtMoney(totalMoney)}</div>
        </div>
        <div className="scard">
          <div className="slabel">TOTAL SPEED</div>
          <div className="sval" style={{ color: "var(--accent)" }}>{fmtCompact(totalSpeed)}</div>
        </div>
        <div className="scard">
          <div className="slabel">TOTAL PETS</div>
          <div className="sval">{totalPets.toLocaleString()}</div>
        </div>
        <div className="scard">
          <div className="slabel">TOTAL STOLEN</div>
          <div className="sval">{totalStolen.toLocaleString()}</div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          {accounts.length > 0
            ? "Ga ada akun yang cocok dengan pencarian."
            : "Belum ada akun yang lapor. Nyalain Auto Report di GUI game."}
        </div>
      ) : viewMode === "grid" ? (
        <div className="catalog-grid">
          {visible.map((a) => (
            <div key={a.sourceAccount} className="catalog-card">
              <div className="cc-head">
                <span className={`cc-dot ${a.online ? "on" : "off"}`} />
                <span className="cc-name">{a.sourceAccount}</span>
                {deviceLabel(a.sourceAccount) && (
                  <span className="cc-device">{deviceLabel(a.sourceAccount)}</span>
                )}
                <span className="cc-status">{a.online ? "Online" : "Offline"}</span>
              </div>

              <div className="cc-stats">
                <div className="cc-stat speed">
                  <div className="cslabel">SPEED</div>
                  <div className="csval">{fmtCompact(a.speed)}</div>
                </div>
                <div className="cc-stat money">
                  <div className="cslabel">CASH</div>
                  <div className="csval">{fmtMoney(a.money)}</div>
                </div>
                <div className="cc-stat income">
                  <div className="cslabel">INCOME AKTIF</div>
                  <div className="csval">{fmtMoney(a.incomeAktif)}/s</div>
                </div>
                <div className="cc-stat">
                  <div className="cslabel">PET &gt;= 1B/S</div>
                  <div className="csval">{fmtMoney(a.highValuePetTotal)}</div>
                </div>
                <div className="cc-stat">
                  <div className="cslabel">PETS</div>
                  <div className="csval">{a.petsCount}</div>
                </div>
                <div className="cc-stat">
                  <div className="cslabel">EGGS STOLEN</div>
                  <div className="csval">{a.stolenCount}</div>
                </div>
              </div>

              {(a.topPets || []).length > 0 && (
                <div className="cc-pets">
                  {a.topPets.slice(0, 5).map((p, i) => (
                    <div key={i} className="cc-pet">
                      <div className="cpname">{p.name || p.category}</div>
                      <div className="cprate">{fmtRate(p.rate)}</div>
                      {p.mutations && p.mutations.length > 0 && (
                        <div className="cpmut" style={{ color: mutColor(p.mutations[0]) }}>
                          {p.mutations.map((m) => m.toUpperCase()).join("+")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="cc-actions">
                <a
                  className="btn-poster"
                  href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`}
                >
                  Generate Poster
                </a>
                <button
                  className="btn-detail"
                  onClick={() => unmarkForSale(a.sourceAccount)}
                  style={{ cursor: "pointer", border: "1px solid var(--card-border)" }}
                >
                  Kembalikan
                </button>
              </div>
              {actionMsg[a.sourceAccount] && (
                <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{actionMsg[a.sourceAccount]}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Akun</th>
              <th>Device</th>
              <th>Speed</th>
              <th>Cash</th>
              <th>Income Aktif</th>
              <th>Pet &gt;= 1B/s</th>
              <th>Pets</th>
              <th>Stolen</th>
              <th>Top Pet</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.sourceAccount}>
                <td>
                  <span className={a.online ? "tonline" : "toffline"}>
                    {a.online ? "●" : "○"}
                  </span>
                </td>
                <td className="tname">{a.sourceAccount}</td>
                <td style={{ color: "var(--accent2)", fontSize: 11 }}>
                  {deviceLabel(a.sourceAccount) || "-"}
                </td>
                <td style={{ color: "var(--accent)" }}>{fmtCompact(a.speed)}</td>
                <td style={{ color: "var(--gold)" }}>{fmtMoney(a.money)}</td>
                <td style={{ color: "var(--green)" }}>{fmtMoney(a.incomeAktif)}/s</td>
                <td>{fmtMoney(a.highValuePetTotal)}</td>
                <td>{a.petsCount}</td>
                <td>{a.stolenCount}</td>
                <td style={{ fontSize: 11 }}>
                  {a.topPets?.[0]
                    ? `${a.topPets[0].name || a.topPets[0].category} (${fmtRate(a.topPets[0].rate)})`
                    : "-"}
                </td>
                <td style={{ display: "flex", gap: 8 }}>
                  <a href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`}>Poster</a>
                  <button
                    onClick={() => unmarkForSale(a.sourceAccount)}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                  >
                    Kembalikan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
