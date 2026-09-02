"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Pet {
  category: string;
  name?: string;
  rate: number;
  mutations?: string[];
}

let iconIndex: Record<string, string> | null = null;
let iconIndexPromise: Promise<Record<string, string>> | null = null;

function loadIconIndex(): Promise<Record<string, string>> {
  if (iconIndex) return Promise.resolve(iconIndex);
  if (!iconIndexPromise) {
    iconIndexPromise = fetch("/icons/index.json")
      .then((r) => r.json())
      .then((data) => { iconIndex = data; return data; })
      .catch(() => { iconIndex = {}; return {}; });
  }
  return iconIndexPromise;
}

function petIconUrl(category: string, index: Record<string, string>): string | null {
  const filename = index[category];
  if (filename) return `/icons/normal/${encodeURIComponent(filename)}`;
  return null;
}

function petRarity(category: string, index: Record<string, string>): string | null {
  const filename = index[category];
  if (!filename) return null;
  const m = filename.match(/\[([^\]]+)\]/);
  return m ? m[1] : null;
}

const DIVINE_RARITIES = new Set(["Divine", "Eternal"]);
const ONE_BILLION = 1_000_000_000;

function pickHighlightPet(pets: Pet[], index: Record<string, string>): { highlight: Pet | null; main: Pet[] } {
  if (!pets || pets.length === 0) return { highlight: null, main: [] };

  const divineHighRate = pets
    .filter((p) => DIVINE_RARITIES.has(petRarity(p.category, index) || "") && (p.rate || 0) >= ONE_BILLION)
    .sort((a, b) => (b.rate || 0) - (a.rate || 0));

  let highlight: Pet;
  if (divineHighRate.length > 0) {
    highlight = divineHighRate[0];
  } else {
    const sorted = [...pets].sort((a, b) => (b.rate || 0) - (a.rate || 0));
    highlight = sorted[0];
  }

  const main = pets.filter((p) => p !== highlight).slice(0, 3);
  return { highlight, main };
}

function rarityColor(rarity: string | null): string {
  switch (rarity) {
    case "Divine": return "#e879f9";
    case "Eternal": return "#f97316";
    case "Secret": return "#ef4444";
    case "Cosmic": return "#22d3ee";
    case "Mythic": return "#a78bfa";
    case "Legendary": return "#fbbf24";
    case "Epic": return "#818cf8";
    case "Rare": return "#34d399";
    default: return "var(--dim)";
  }
}

function PetIcon({ category, name, size = 32 }: { category: string; name: string; size?: number }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);

  const staticSrc = petIconUrl(category, index);
  const fallbackSrc = `/api/pet-icon?category=${encodeURIComponent(category)}`;
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setSrc(staticSrc); setFailed(false); }, [staticSrc]);

  if (!src || failed) {
    if (!staticSrc && !failed && category) {
      return (
        <img
          src={fallbackSrc}
          alt={name}
          width={size}
          height={size}
          style={{ borderRadius: 6, objectFit: "contain", background: "#1c1c2b", flexShrink: 0 }}
          onError={() => setFailed(true)}
        />
      );
    }
    return (
      <div style={{ width: size, height: size, borderRadius: 6, background: "#262640", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, color: "var(--dim)", flexShrink: 0 }}>
        {(name || "?")[0]}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ borderRadius: 6, objectFit: "contain", background: "#1c1c2b", flexShrink: 0 }}
      onError={() => {
        if (staticSrc && !failed) setSrc(fallbackSrc);
        else setFailed(true);
      }}
    />
  );
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
  firstSeen?: number;
  lastSeen?: number;
  forSale?: boolean;
}

interface AccountDetail {
  activePets: Pet[];
  activeLimit: number | null;
  allPets: Pet[];
  growingEggs: Pet[];
  backpackEggs: Pet[];
}

function fmtUptime(firstSeen?: number): string {
  if (!firstSeen) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - firstSeen));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e18) return "$" + (n / 1e18).toFixed(1) + "Qi";
  if (abs >= 1e15) return "$" + (n / 1e15).toFixed(1) + "Qa";
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return Number(v).toLocaleString("en-US");
}

function fmtCompactNum(v: number | null | undefined): string {
  if (v == null) return "-";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e18) return (n / 1e18).toFixed(1) + "Qi+";
  if (abs >= 1e15) return (n / 1e15).toFixed(1) + "Qa+";
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + "T+";
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + "B+";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M+";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K+";
  return n.toLocaleString("en-US");
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "-";
  return fmtMoney(v) + "/s";
}

function fmtLevel(v: number | null | undefined): string {
  if (v == null) return "-";
  return "Lv. " + v;
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

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sortMode, setSortMode] = useState("name_asc");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [detail, setDetail] = useState<{ name: string; data: AccountDetail | null; loading: boolean } | null>(null);
  const [genAllStatus, setGenAllStatus] = useState("");
  const [genAllRunning, setGenAllRunning] = useState(false);
  const genMsgs = useRef<Record<string, { text: string; color: string }>>({});
  const [, forceUpdate] = useState(0);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      const active = (data.accounts || []).filter((a: Account) => a.online && !a.forSale);
      setAccounts(active);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAccounts();
    const id = setInterval(fetchAccounts, 5000);
    return () => clearInterval(id);
  }, [fetchAccounts]);

  function filterByDevice(list: Account[]): Account[] {
    if (!deviceFilter.trim()) return list;
    const queryNum = accountNumber(deviceFilter.trim());
    if (queryNum === null) return list;
    const wantBlock = deviceBlockStart(queryNum);
    return list.filter((a) => deviceBlockStart(accountNumber(a.sourceAccount)) === wantBlock);
  }

  function sortAccounts(list: Account[]): Account[] {
    const sorted = [...list];
    switch (sortMode) {
      case "speed_desc":
        sorted.sort((a, b) => (Number(b.speed) || 0) - (Number(a.speed) || 0));
        break;
      case "income_aktif_desc":
        sorted.sort((a, b) => (Number(b.incomeAktif) || 0) - (Number(a.incomeAktif) || 0));
        break;
      case "income_pasif_desc":
        sorted.sort(
          (a, b) =>
            (Number(b.incomeEggBackpack) || 0) +
            (Number(b.incomeEggSedangTumbuh) || 0) -
            ((Number(a.incomeEggBackpack) || 0) + (Number(a.incomeEggSedangTumbuh) || 0))
        );
        break;
      case "egg_desc":
        sorted.sort((a, b) => (Number(b.stolenCount) || 0) - (Number(a.stolenCount) || 0));
        break;
      default:
        sorted.sort((a, b) => {
          const na = accountNumber(a.sourceAccount);
          const nb = accountNumber(b.sourceAccount);
          if (na !== null && nb !== null && na !== nb) return na - nb;
          return a.sourceAccount.localeCompare(b.sourceAccount);
        });
    }
    return sorted;
  }

  const visible = sortAccounts(filterByDevice(accounts));

  const totalMoney = visible.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalSpeed = visible.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const totalPets = visible.reduce((s, a) => s + (Number(a.petsCount) || 0), 0);
  const totalStolen = visible.reduce((s, a) => s + (Number(a.stolenCount) || 0), 0);

  async function openDetail(name: string) {
    setDetail({ name, data: null, loading: true });
    try {
      const res = await fetch("/api/account-detail?account=" + encodeURIComponent(name));
      const body = await res.json();
      if (res.ok && body.ok) {
        setDetail({ name, data: body, loading: false });
      } else {
        setDetail({ name, data: null, loading: false });
      }
    } catch {
      setDetail({ name, data: null, loading: false });
    }
  }

  function setGenMsg(account: string, text: string, color: string) {
    genMsgs.current[account] = { text, color };
    forceUpdate((n) => n + 1);
  }

  async function generatePoster(account: string) {
    setGenMsg(account, "Mengirim...", "var(--dim)");
    try {
      const res = await fetch("/api/generate-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setGenMsg(
          account,
          body.mode === "discord-price-flow"
            ? "Draft terkirim ke Discord (isi harga di sana)."
            : "Poster terkirim ke Discord.",
          "var(--green)"
        );
      } else {
        setGenMsg(account, "Gagal: " + (body.error || "unknown"), "#f87171");
      }
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "#f87171");
    }
  }

  async function markForSale(account: string) {
    setGenMsg(account, "Memindahkan ke katalog...", "var(--dim)");
    try {
      const res = await fetch("/api/mark-forsale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, forSale: true }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setAccounts((prev) => prev.filter((a) => a.sourceAccount !== account));
        setGenMsg(account, "Akun dipindah ke Katalog.", "var(--green)");
      } else {
        setGenMsg(account, "Gagal: " + (body.error || "unknown"), "#f87171");
      }
    } catch (e: any) {
      setGenMsg(account, "Gagal: " + e.message, "#f87171");
    }
  }

  async function generateAll() {
    if (genAllRunning || visible.length === 0) return;
    setGenAllRunning(true);
    let ok = 0,
      fail = 0;
    for (let i = 0; i < visible.length; i++) {
      const acc = visible[i].sourceAccount;
      setGenAllStatus(`Generate ${i + 1}/${visible.length}: ${acc}...`);
      try {
        const res = await fetch("/api/generate-poster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: acc }),
        });
        const body = await res.json();
        if (res.ok && body.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
      if (i < visible.length - 1) await new Promise((r) => setTimeout(r, 700));
    }
    setGenAllStatus(`Selesai: ${ok} berhasil${fail ? `, ${fail} gagal` : ""}.`);
    setGenAllRunning(false);
  }

  return (
    <>
      <style>{`
        :root {
          --bg: #0b0b12; --card: #14141f; --card-border: #262636;
          --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
          --green: #34d399; --gold: #fbbf24;
        }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, "Segoe UI", Roboto, sans-serif; padding: 28px; }
        .eyebrow { color: var(--accent2); font-size: 12px; font-weight: 700; letter-spacing: 1px; }
        h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
        .sortbar { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; flex-wrap: wrap; }
        .sortbar label { color: var(--dim); font-size: 12px; font-weight: 700; }
        .sortbar select, .sortbar input {
          background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
          border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700;
        }
        .sortbar select:focus, .sortbar input:focus { outline: none; border-color: var(--accent); }
        .sortbar input { width: 190px; }
        .genallbtn {
          margin-left: auto; background: var(--accent); color: #1a1030; border: none; border-radius: 8px;
          padding: 7px 14px; font-size: 12px; font-weight: 800; cursor: pointer;
        }
        .genallbtn:hover { filter: brightness(1.1); }
        .genallbtn:disabled { opacity: .6; cursor: default; }
        .genallstatus { color: var(--dim); font-size: 12px; min-width: 160px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 20px 0 26px; }
        .sumcard { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; }
        .sumcard .label { color: var(--dim); font-size: 11px; font-weight: 700; letter-spacing: .5px; }
        .sumcard .value { font-size: 24px; font-weight: 800; margin-top: 6px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
        .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px; cursor: pointer; }
        .card:hover { border-color: var(--accent); }
        .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
        .dot.online { background: var(--green); box-shadow: 0 0 6px var(--green); }
        .name { font-weight: 800; font-size: 15px; }
        .devicetag { color: var(--accent2); font-size: 10px; font-weight: 700; background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 6px; padding: 2px 6px; }
        .status { color: var(--dim); font-size: 11px; margin-left: auto; }
        .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
        .stat .label { color: var(--dim); font-size: 10px; font-weight: 700; }
        .stat .val { font-size: 15px; font-weight: 700; }
        .stat.money .val { color: var(--gold); }
        .stat.speed .val { color: var(--accent); }
        .pet-section { display: flex; gap: 8px; margin-bottom: 12px; }
        .highlight-card {
          background: linear-gradient(135deg, #1a1030 0%, #14141f 100%);
          border: 1px solid #a78bfa44; border-radius: 10px; padding: 10px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-width: 90px; text-align: center; gap: 4px; position: relative; overflow: hidden;
        }
        .highlight-card::before {
          content: ""; position: absolute; inset: 0; border-radius: 10px;
          background: radial-gradient(ellipse at 50% 0%, rgba(167,139,250,.12) 0%, transparent 70%);
          pointer-events: none;
        }
        .highlight-badge {
          font-size: 8px; font-weight: 800; letter-spacing: .5px; padding: 1px 6px;
          border-radius: 4px; text-transform: uppercase;
        }
        .highlight-card .pname { font-size: 10px; color: var(--ink); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
        .highlight-card .prate { font-size: 11px; font-weight: 800; }
        .toppets { display: flex; gap: 6px; overflow-x: auto; flex: 1; }
        .pet { background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 8px; text-align: center; min-width: 72px; display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
        .pet .pname { font-size: 9px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 62px; }
        .pet .prate { font-size: 9px; color: var(--gold); font-weight: 700; }
        .genbtn { margin-top: 12px; width: 100%; background: var(--accent); color: #1a1030; border: none; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 800; cursor: pointer; }
        .genbtn:hover { filter: brightness(1.1); }
        .restartbtn { margin-top: 6px; width: 100%; background: #262636; color: var(--ink); border: 1px solid var(--card-border); border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 800; cursor: pointer; }
        .restartbtn:hover { border-color: var(--accent2); }
        .genmsg { font-size: 11px; margin-top: 6px; min-height: 14px; }
        .empty { color: var(--dim); text-align: center; padding: 60px 0; }

        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; z-index: 50; }
        .modal { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 24px; width: 100%; max-width: 720px; }
        .modal-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .modal-head .name { font-size: 20px; }
        .modal-close { margin-left: auto; background: none; border: none; color: var(--dim); font-size: 22px; cursor: pointer; line-height: 1; }
        .modal-close:hover { color: var(--ink); }
        .modal-sub { color: var(--dim); font-size: 12px; margin-bottom: 18px; }
        .section-title { color: var(--accent2); font-size: 12px; font-weight: 800; letter-spacing: .5px; margin: 18px 0 8px; }
        .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
        .dpet { background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; }
        .dpet .dinfo { min-width: 0; }
        .dpet .dname { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dpet .drate { font-size: 11px; color: var(--gold); font-weight: 700; }
        .detail-empty { color: var(--dim); font-size: 12px; }
      `}</style>

      <div style={{ marginBottom: 4 }}>
        <div className="eyebrow">STEAL AN EGG</div>
        <h1>Monitor — Akun & Pet</h1>
      </div>

      <div className="sortbar">
        <label>Urutkan:</label>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
          <option value="name_asc">Nama Akun (Nomor)</option>
          <option value="speed_desc">Speed (Tertinggi)</option>
          <option value="income_aktif_desc">Income Potensi Pet Aktif (Tertinggi)</option>
          <option value="income_pasif_desc">Income Pasif (Tertinggi)</option>
          <option value="egg_desc">Egg Terbanyak</option>
        </select>
        <label>Device:</label>
        <input
          type="text"
          placeholder="mis: SAE 21 (isi 21-30)"
          value={deviceFilter}
          onChange={(e) => setDeviceFilter(e.target.value)}
        />
        <button className="genallbtn" disabled={genAllRunning || visible.length === 0} onClick={generateAll}>
          Generate All Poster
        </button>
        <span className="genallstatus">{genAllStatus}</span>
      </div>

      <div className="summary">
        <div className="sumcard">
          <div className="label">ACTIVE ACCOUNTS</div>
          <div className="value">{visible.length}</div>
        </div>
        <div className="sumcard">
          <div className="label">TOTAL MONEY</div>
          <div className="value">{fmtMoney(totalMoney)}</div>
        </div>
        <div className="sumcard">
          <div className="label">TOTAL SPEED</div>
          <div className="value">{fmtCompactNum(totalSpeed)}</div>
        </div>
        <div className="sumcard">
          <div className="label">TOTAL PETS</div>
          <div className="value">{fmtNum(totalPets)}</div>
        </div>
        <div className="sumcard">
          <div className="label">TOTAL EGGS STOLEN</div>
          <div className="value">{fmtNum(totalStolen)}</div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          {accounts.length > 0
            ? "Ga ada akun yang cocok sama filter device itu."
            : 'Belum ada akun yang lapor. Nyalain "Auto Report ke Dashboard" di GUI game.'}
        </div>
      ) : (
        <div className="grid">
          {visible.map((a) => (
            <div key={a.sourceAccount} className="card" onClick={() => openDetail(a.sourceAccount)}>
              <div className="card-head">
                <span className={`dot ${a.online ? "online" : ""}`} />
                <span className="name">{a.sourceAccount}</span>
                <span className="devicetag">{deviceLabel(a.sourceAccount) || ""}</span>
                <span className="status">{a.online ? fmtUptime(a.firstSeen) || "Active" : "Offline"}</span>
              </div>
              <div className="stats">
                <div className="stat speed">
                  <div className="label">SPEED</div>
                  <div className="val">{fmtCompactNum(a.speed)}</div>
                </div>
                <div className="stat money">
                  <div className="label">CASH</div>
                  <div className="val">{fmtMoney(a.money)}</div>
                </div>
                <div className="stat">
                  <div className="label">INCOME POTENSI PET AKTIF</div>
                  <div className="val">{fmtRate(a.incomeAktif)}</div>
                </div>
                <div className="stat">
                  <div className="label">POTENSI 18 PET AKTIF</div>
                  <div className="val">{fmtRate(a.highValuePetTotal)}</div>
                </div>
                <div className="stat">
                  <div className="label">KANDANG LEVEL</div>
                  <div className="val">{fmtLevel(a.kandangLevel)}</div>
                </div>
                <div className="stat">
                  <div className="label">TREADMILL LEVEL</div>
                  <div className="val">{fmtLevel(a.treadmillLevel)}</div>
                </div>
                <div className="stat">
                  <div className="label">PETS</div>
                  <div className="val">{fmtNum(a.petsCount)} pets</div>
                </div>
                <div className="stat">
                  <div className="label">STOLEN</div>
                  <div className="val">{fmtNum(a.stolenCount)} eggs</div>
                </div>
              </div>
              <PetCards pets={a.topPets || []} />
              <a
                className="genbtn"
                href={`/poster?account=${encodeURIComponent(a.sourceAccount)}`}
                onClick={(e) => e.stopPropagation()}
                style={{ display: "block", textAlign: "center", textDecoration: "none" }}
              >
                Generate Poster
              </a>
              <button
                className="restartbtn"
                onClick={(e) => {
                  e.stopPropagation();
                  markForSale(a.sourceAccount);
                }}
              >
                Siap Jual
              </button>
              <div className="genmsg" style={{ color: genMsgs.current[a.sourceAccount]?.color || "var(--dim)" }}>
                {genMsgs.current[a.sourceAccount]?.text || ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="overlay" onClick={(e) => { if ((e.target as HTMLElement).classList.contains("overlay")) setDetail(null); }}>
          <div className="modal">
            <div className="modal-head">
              <span className="name">{detail.name}</span>
              <button className="modal-close" onClick={() => setDetail(null)}>&times;</button>
            </div>
            {detail.loading ? (
              <div className="modal-sub">Memuat...</div>
            ) : !detail.data ? (
              <div className="modal-sub">Belum ada data lengkap buat akun ini.</div>
            ) : (
              <>
                <div className="modal-sub">Active Limit: {detail.data.activeLimit ?? "-"}</div>
                <PetSection title="Pet Aktif" pets={detail.data.activePets} />
                <PetSection title="Isi Tas (Semua Pet)" pets={detail.data.allPets} />
                <PetSection title="Telur Sedang Tumbuh" pets={detail.data.growingEggs} />
                <PetSection title="Telur di Tas" pets={detail.data.backpackEggs} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PetCards({ pets }: { pets: Pet[] }) {
  const [index, setIndex] = useState<Record<string, string>>({});
  useEffect(() => { loadIconIndex().then(setIndex); }, []);

  if (!pets || pets.length === 0) return null;

  const { highlight, main } = pickHighlightPet(pets, index);
  const hlRarity = highlight ? petRarity(highlight.category, index) : null;
  const hlColor = rarityColor(hlRarity);

  return (
    <div className="pet-section">
      {highlight && (
        <div className="highlight-card" style={{ borderColor: hlColor + "44" }}>
          <span className="highlight-badge" style={{ background: hlColor + "22", color: hlColor }}>
            {hlRarity || "TOP"}
          </span>
          <PetIcon category={highlight.category} name={highlight.name || highlight.category} size={40} />
          <div className="pname">{highlight.name || highlight.category}</div>
          <div className="prate" style={{ color: hlColor }}>{fmtRate(highlight.rate)}</div>
        </div>
      )}
      <div className="toppets">
        {main.map((p, i) => (
          <div key={i} className="pet">
            <PetIcon category={p.category} name={p.name || p.category} />
            <div className="pname">{p.name || p.category}</div>
            <div className="prate">{fmtRate(p.rate)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PetSection({ title, pets }: { title: string; pets: Pet[] }) {
  const sorted = [...(pets || [])].sort((a, b) => (b.rate || 0) - (a.rate || 0));
  return (
    <>
      <div className="section-title">
        {title} ({sorted.length})
      </div>
      {sorted.length === 0 ? (
        <div className="detail-empty">Kosong.</div>
      ) : (
        <div className="detail-grid">
          {sorted.map((p, i) => (
            <div key={i} className="dpet">
              <PetIcon category={p.category} name={p.name || p.category} size={28} />
              <div className="dinfo">
                <div className="dname">
                  {p.name || p.category}
                  {(p.mutations || []).length > 0 && ` (${p.mutations!.join(", ")})`}
                </div>
                <div className="drate">{fmtRate(p.rate)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
