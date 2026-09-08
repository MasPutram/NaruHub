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
  catalogPrice?: number;
  sold?: boolean;
  soldPrice?: number;
  soldAt?: number;
  detail?: {
    activePets?: Pet[];
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

function fmtRupiah(v: number): string {
  return "Rp " + v.toLocaleString("id-ID");
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function potensi18(a: Account): number {
  const d = a.detail;
  if (!d) return 0;
  const all = [
    ...(d.activePets || []),
    ...(d.allPets || []),
    ...(d.growingEggs || []),
    ...(d.backpackEggs || []),
  ];
  const seen = new Set<string>();
  const deduped: Pet[] = [];
  for (const p of all) {
    const k = `${p.category}|${(p.mutations || []).sort().join("+")}|${p.rate}`;
    if (!seen.has(k)) { seen.add(k); deduped.push(p); }
  }
  deduped.sort((a, b) => (b.rate || 0) - (a.rate || 0));
  let total = 0;
  for (let i = 0; i < Math.min(18, deduped.length); i++) total += deduped[i].rate || 0;
  return total;
}

type SortMode = "name" | "speed" | "income" | "money" | "pets" | "eggs" | "potensi" | "akun_baru" | "harga";
type TabMode = "catalog" | "sold";

export default function CatalogPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [soldAccounts, setSoldAccounts] = useState<Account[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [tabMode, setTabMode] = useState<TabMode>("catalog");
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [priceEditing, setPriceEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);
  const [soldModal, setSoldModal] = useState<string | null>(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [soldLoading, setSoldLoading] = useState(false);
  const [soldError, setSoldError] = useState("");

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

  function downloadAllPosters() {
    const withPrice = visible.filter((a) => a.catalogPrice && a.catalogPrice > 0);
    if (withPrice.length === 0) return;
    if (!confirm(`Buka ${withPrice.length} poster di tab baru?`)) return;
    for (const a of withPrice) {
      window.open(`/poster?account=${encodeURIComponent(a.sourceAccount)}`, "_blank");
    }
  }

  async function saveCatalogPrice(account: string) {
    const val = Number(priceInput);
    if (isNaN(val) || val < 0) return;
    setPriceSaving(true);
    try {
      const res = await fetch("/api/set-catalog-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, price: val }),
      });
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) => a.sourceAccount === account ? { ...a, catalogPrice: val } : a)
        );
        setPriceEditing(null);
      }
    } catch {}
    setPriceSaving(false);
  }

  async function markSold() {
    if (!soldModal) return;
    const price = Number(soldPrice);
    if (isNaN(price) || price <= 0) {
      setSoldError("Masukkan harga yang valid.");
      return;
    }
    setSoldLoading(true);
    setSoldError("");
    try {
      const res = await fetch("/api/mark-sold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: soldModal, price }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setAccounts((prev) => prev.filter((a) => a.sourceAccount !== soldModal));
        setSoldModal(null);
        setSoldPrice("");
        fetchSoldAccounts();
      } else {
        setSoldError(body.error || "Gagal menandai terjual.");
      }
    } catch (e: any) {
      setSoldError(e.message);
    } finally {
      setSoldLoading(false);
    }
  }

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog-accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {}
  }, []);

  const fetchSoldAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/sold-accounts");
      const data = await res.json();
      setSoldAccounts(data.accounts || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchSoldAccounts();
    const id = setInterval(() => {
      fetchAccounts();
      fetchSoldAccounts();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchAccounts, fetchSoldAccounts]);

  function filtered(): Account[] {
    let list = tabMode === "catalog" ? [...accounts] : [...soldAccounts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.sourceAccount.toLowerCase().includes(q) ||
          (deviceLabel(a.sourceAccount) || "").toLowerCase().includes(q)
      );
    }
    const minP = Number(minPrice) * 1000;
    if (minP > 0) {
      if (tabMode === "catalog") {
        list = list.filter((a) => (a.catalogPrice || 0) >= minP);
      } else {
        list = list.filter((a) => (a.soldPrice || 0) >= minP);
      }
    }
    const maxP = Number(maxPrice) * 1000;
    if (maxP > 0) {
      if (tabMode === "catalog") {
        list = list.filter((a) => (a.catalogPrice || 0) > 0 && (a.catalogPrice || 0) <= maxP);
      } else {
        list = list.filter((a) => (a.soldPrice || 0) > 0 && (a.soldPrice || 0) <= maxP);
      }
    }
    if (tabMode === "sold") {
      list.sort((a, b) => (b.soldAt || 0) - (a.soldAt || 0));
      return list;
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
      case "potensi":
        list.sort((a, b) => potensi18(b) - potensi18(a));
        break;
      case "akun_baru":
        list = list.filter((a) => (a.treadmillLevel ?? -1) === 1);
        list.sort((a, b) => potensi18(b) - potensi18(a));
        break;
      case "harga":
        list.sort((a, b) => (b.catalogPrice || 0) - (a.catalogPrice || 0));
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
  const activeList = tabMode === "catalog" ? accounts : soldAccounts;
  const onlineCount = activeList.filter((a) => a.online).length;
  const totalMoney = activeList.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalSpeed = activeList.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const totalPets = activeList.reduce((s, a) => s + (a.petsCount || 0), 0);
  const totalStolen = activeList.reduce((s, a) => s + (a.stolenCount || 0), 0);
  const totalSoldRevenue = soldAccounts.reduce((s, a) => s + (a.soldPrice || 0), 0);

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --gold: #fbbf24; --red: #f87171;
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
        .tab-btn.active { background: var(--bg); color: var(--ink); border-color: var(--accent); border-bottom: 1px solid var(--bg); }
        .tab-btn .tab-badge {
          display: inline-block; background: var(--accent); color: #1a1030;
          font-size: 10px; font-weight: 800; border-radius: 8px; padding: 1px 7px; margin-left: 8px;
        }
        .tab-btn.sold-tab .tab-badge { background: var(--red); color: #fff; }

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
          padding: 20px; transition: border-color .15s; position: relative; overflow: hidden;
        }
        .catalog-card:hover { border-color: var(--accent); }
        .catalog-card.sold-card { opacity: 1; }
        .catalog-card.sold-card .sold-overlay {
          position: absolute; inset: 0; background: rgba(20, 20, 31, 0.75);
          display: flex; align-items: center; justify-content: center;
          z-index: 10; pointer-events: none;
        }
        .sold-watermark {
          border: 4px solid var(--red); border-radius: 12px; padding: 12px 32px;
          transform: rotate(-18deg);
        }
        .sold-watermark span {
          font-size: 36px; font-weight: 900; color: var(--red); letter-spacing: 6px;
          text-transform: uppercase;
        }
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

        .btn-download-all {
          background: #8b5cf6; color: #fff; border: none; border-radius: 10px;
          padding: 10px 24px; font-size: 13px; font-weight: 800; cursor: pointer;
        }
        .btn-download-all:hover { filter: brightness(1.1); }
        .btn-download-all:disabled { opacity: .6; cursor: not-allowed; }

        .cc-price-row {
          padding: 0 16px 8px;
        }
        .cc-price-btn {
          background: none; border: 1px dashed var(--card-border); border-radius: 8px;
          color: var(--accent); font-size: 13px; font-weight: 800; padding: 6px 12px;
          cursor: pointer; width: 100%; text-align: center;
        }
        .cc-price-btn:hover { border-color: var(--accent); background: rgba(250,204,21,0.05); }

        .cc-actions { display: flex; gap: 8px; }
        .cc-actions a, .cc-actions button {
          flex: 1; text-align: center; padding: 8px; border-radius: 8px;
          font-size: 12px; font-weight: 800; text-decoration: none; cursor: pointer;
          border: none;
        }
        .btn-poster { background: var(--accent); color: #1a1030; }
        .btn-poster:hover { filter: brightness(1.1); }
        .btn-detail { background: #262636; color: var(--ink); border: 1px solid var(--card-border) !important; }
        .btn-detail:hover { border-color: var(--accent2) !important; }
        .btn-sold { background: var(--red); color: #fff; }
        .btn-sold:hover { filter: brightness(1.1); }

        .sold-price-badge {
          position: absolute; top: 12px; right: 12px; z-index: 15;
          background: var(--red); color: #fff; font-size: 12px; font-weight: 800;
          padding: 4px 12px; border-radius: 8px;
        }
        .sold-date-badge {
          position: absolute; top: 12px; left: 12px; z-index: 15;
          background: rgba(30, 30, 50, 0.9); color: var(--dim); font-size: 10px; font-weight: 700;
          padding: 3px 10px; border-radius: 6px;
        }

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
        .catalog-table .tsold { color: var(--red); font-weight: 800; }

        .empty { color: var(--dim); text-align: center; padding: 60px 28px; font-size: 14px; }

        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100;
          display: flex; align-items: center; justify-content: center;
        }
        .modal-box {
          background: var(--card); border: 1px solid var(--card-border); border-radius: 16px;
          padding: 28px; width: 400px; max-width: 90vw;
        }
        .modal-box h2 { font-size: 18px; margin-bottom: 6px; }
        .modal-box .modal-sub { color: var(--dim); font-size: 12px; margin-bottom: 20px; }
        .modal-box label { color: var(--dim); font-size: 12px; font-weight: 700; display: block; margin-bottom: 6px; }
        .modal-box input {
          width: 100%; background: var(--bg); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 10px 14px; font-size: 16px; font-weight: 700;
          margin-bottom: 16px;
        }
        .modal-box input:focus { outline: none; border-color: var(--accent); }
        .modal-actions { display: flex; gap: 10px; }
        .modal-actions button {
          flex: 1; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 800;
          cursor: pointer; border: none;
        }
        .modal-actions .btn-confirm { background: var(--red); color: #fff; }
        .modal-actions .btn-confirm:hover { filter: brightness(1.1); }
        .modal-actions .btn-confirm:disabled { opacity: .5; cursor: not-allowed; }
        .modal-actions .btn-cancel { background: #262636; color: var(--ink); }
        .modal-error { color: var(--red); font-size: 12px; margin-bottom: 10px; }
      `}</style>

      <div className="topbar">
        <h1>Katalog Akun</h1>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--dim)", fontSize: 12 }}>
          {tabMode === "catalog"
            ? `${accounts.length} akun (${onlineCount} online)`
            : `${soldAccounts.length} akun terjual`}
        </span>
      </div>

      <div className="tab-bar">
        <button
          className={`tab-btn ${tabMode === "catalog" ? "active" : ""}`}
          onClick={() => setTabMode("catalog")}
        >
          Katalog
          <span className="tab-badge">{accounts.length}</span>
        </button>
        <button
          className={`tab-btn sold-tab ${tabMode === "sold" ? "active" : ""}`}
          onClick={() => setTabMode("sold")}
        >
          Terjual
          <span className="tab-badge">{soldAccounts.length}</span>
        </button>
      </div>

      <div className="controls">
        {tabMode === "catalog" && (
          <>
            <label>Urutkan:</label>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="name">Nama (Nomor)</option>
              <option value="speed">Speed Tertinggi</option>
              <option value="income">Income Tertinggi</option>
              <option value="money">Cash Terbanyak</option>
              <option value="pets">Pet Terbanyak</option>
              <option value="eggs">Egg Stolen Terbanyak</option>
              <option value="potensi">Potensi 18 Pet</option>
              <option value="akun_baru">Akun Baru (Kandang 0)</option>
              <option value="harga">Harga Tertinggi</option>
            </select>
          </>
        )}
        <label>Cari:</label>
        <input
          type="text"
          placeholder="Nama akun / device..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: 200 }}
        />
        <label>Harga {"≥"}:</label>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
          <input
            type="number"
            placeholder="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            style={{ width: 80 }}
          />
          <span style={{ color: "var(--dim)", fontSize: 11 }}>.000</span>
        </div>
        <label>Harga {"≤"}:</label>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
          <input
            type="number"
            placeholder="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            style={{ width: 80 }}
          />
          <span style={{ color: "var(--dim)", fontSize: 11 }}>.000</span>
        </div>
        <div className="viewtoggle">
          <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")}>
            Grid
          </button>
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")}>
            Tabel
          </button>
        </div>
      </div>

      {tabMode === "catalog" ? (
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
          <div className="scard">
            <div className="slabel">SUDAH ADA HARGA</div>
            <div className="sval" style={{ color: "var(--accent)" }}>{accounts.filter((a) => a.catalogPrice && a.catalogPrice > 0).length}</div>
          </div>
        </div>
      ) : (
        <div className="summary">
          <div className="scard">
            <div className="slabel">AKUN TERJUAL</div>
            <div className="sval">{soldAccounts.length}</div>
          </div>
          <div className="scard">
            <div className="slabel">TOTAL PENDAPATAN</div>
            <div className="sval" style={{ color: "var(--green)" }}>{fmtRupiah(totalSoldRevenue)}</div>
          </div>
          <div className="scard">
            <div className="slabel">RATA-RATA HARGA</div>
            <div className="sval" style={{ color: "var(--gold)" }}>
              {soldAccounts.length > 0 ? fmtRupiah(Math.round(totalSoldRevenue / soldAccounts.length)) : "Rp 0"}
            </div>
          </div>
        </div>
      )}

      {tabMode === "catalog" && visible.some((a) => a.catalogPrice && a.catalogPrice > 0) && (
        <div style={{ padding: "0 28px 12px", display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="btn-download-all"
            onClick={downloadAllPosters}
          >
            {`Download All Poster (${visible.filter((a) => a.catalogPrice && a.catalogPrice > 0).length} akun)`}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          {tabMode === "catalog"
            ? accounts.length > 0
              ? "Ga ada akun yang cocok dengan pencarian."
              : "Belum ada akun di katalog."
            : soldAccounts.length > 0
              ? "Ga ada akun terjual yang cocok dengan pencarian."
              : "Belum ada akun yang terjual."}
        </div>
      ) : viewMode === "grid" ? (
        <div className="catalog-grid">
          {visible.map((a) => (
            <div key={a.sourceAccount} className={`catalog-card ${a.sold ? "sold-card" : ""}`}>
              {a.sold && (
                <>
                  <div className="sold-overlay">
                    <div className="sold-watermark">
                      <span>TERJUAL</span>
                    </div>
                  </div>
                  <div className="sold-price-badge">{fmtRupiah(a.soldPrice || 0)}</div>
                  {a.soldAt && <div className="sold-date-badge">{fmtDate(a.soldAt)}</div>}
                </>
              )}

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

              {!a.sold && (
                <div className="cc-price-row">
                  {priceEditing === a.sourceAccount ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                      <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 700 }}>Rp</span>
                      <input
                        type="number"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveCatalogPrice(a.sourceAccount); if (e.key === "Escape") setPriceEditing(null); }}
                        autoFocus
                        style={{ flex: 1, background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--card-border)", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontWeight: 700 }}
                      />
                      <button
                        onClick={() => saveCatalogPrice(a.sourceAccount)}
                        disabled={priceSaving}
                        style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                      >
                        {priceSaving ? "..." : "OK"}
                      </button>
                      <button
                        onClick={() => setPriceEditing(null)}
                        style={{ background: "#262636", color: "var(--ink)", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <button
                      className="cc-price-btn"
                      onClick={() => { setPriceEditing(a.sourceAccount); setPriceInput(String(a.catalogPrice || "")); }}
                    >
                      {a.catalogPrice ? fmtRupiah(a.catalogPrice) : "Set Harga"}
                    </button>
                  )}
                </div>
              )}

              <div className="cc-actions" style={{ position: "relative", zIndex: 15 }}>
                <a
                  className="btn-poster"
                  href={`/poster?account=${encodeURIComponent(a.sourceAccount)}${a.sold ? `&sold=1&soldPrice=${a.soldPrice || 0}` : ""}${a.catalogPrice ? `&catalogPrice=${a.catalogPrice}` : ""}`}
                >
                  {a.sold ? "Poster Terjual" : "Generate Poster"}
                </a>
                {!a.sold && (
                  <>
                    <button
                      className="btn-sold"
                      onClick={() => {
                        setSoldModal(a.sourceAccount);
                        setSoldPrice(String(a.catalogPrice || ""));
                        setSoldError("");
                      }}
                    >
                      Terjual
                    </button>
                    <button
                      className="btn-detail"
                      onClick={() => unmarkForSale(a.sourceAccount)}
                    >
                      Kembalikan
                    </button>
                  </>
                )}
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
              <th>Harga</th>
              {tabMode === "sold" && <th>Tanggal</th>}
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.sourceAccount}>
                <td>
                  {a.sold ? (
                    <span className="tsold">TERJUAL</span>
                  ) : (
                    <span className={a.online ? "tonline" : "toffline"}>
                      {a.online ? "●" : "○"}
                    </span>
                  )}
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
                <td style={{ color: tabMode === "sold" ? "var(--red)" : "var(--accent)", fontWeight: 700, fontSize: 12 }}>
                  {tabMode === "sold"
                    ? fmtRupiah(a.soldPrice || 0)
                    : a.catalogPrice ? fmtRupiah(a.catalogPrice) : "-"}
                </td>
                {tabMode === "sold" && (
                  <td style={{ color: "var(--dim)", fontSize: 11 }}>
                    {a.soldAt ? fmtDate(a.soldAt) : "-"}
                  </td>
                )}
                <td style={{ display: "flex", gap: 8 }}>
                  {a.sold ? (
                    <a href={`/poster?account=${encodeURIComponent(a.sourceAccount)}&sold=1&soldPrice=${a.soldPrice || 0}`}>Poster</a>
                  ) : (
                    <>
                      <a href={`/poster?account=${encodeURIComponent(a.sourceAccount)}${a.catalogPrice ? `&catalogPrice=${a.catalogPrice}` : ""}`}>Poster</a>
                      <button
                        onClick={() => {
                          setSoldModal(a.sourceAccount);
                          setSoldPrice(String(a.catalogPrice || ""));
                          setSoldError("");
                        }}
                        style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                      >
                        Terjual
                      </button>
                      <button
                        onClick={() => unmarkForSale(a.sourceAccount)}
                        style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                      >
                        Kembalikan
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {soldModal && (
        <div className="modal-backdrop" onClick={() => { if (!soldLoading) setSoldModal(null); }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>Tandai Terjual</h2>
            <div className="modal-sub">
              Akun <strong>{soldModal}</strong> akan dipindahkan ke daftar terjual.
            </div>
            <label>Harga Jual (Rupiah)</label>
            <input
              type="number"
              placeholder="Contoh: 150000"
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") markSold(); }}
            />
            {soldError && <div className="modal-error">{soldError}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setSoldModal(null)} disabled={soldLoading}>
                Batal
              </button>
              <button className="btn-confirm" onClick={markSold} disabled={soldLoading}>
                {soldLoading ? "Memproses..." : "Konfirmasi Terjual"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
